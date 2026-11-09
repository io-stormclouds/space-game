//! The server end to end over a real WebSocket: hello → welcome → checkpoint, requests → sync and
//! replies, a replica that stays equal to the server's world (hash), a refused login, the rate
//! limit, and a world that survives a reconnect and a server restart (restored from disk).

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio_tungstenite::tungstenite::Message;

use game_server::{AppState, Config, router};
use game_session::{Host, HostOptions, SyncMessage};

fn config(dir: &std::path::Path, dev: bool) -> Config {
    Config {
        addr: "127.0.0.1:0".parse().unwrap(),
        data_dir: dir.to_path_buf(),
        dev_mode: dev,
        step_seconds: if dev { 1.0 / 60.0 } else { 1.0 },
        snapshot_seconds: 60.0,
        idle_seconds: 300.0,
        offline_limit_hours: 12.0,
        max_requests_per_second: 20.0,
    }
}

async fn start(cfg: Config) -> (String, std::sync::Arc<AppState>) {
    let state = AppState::open(cfg).unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let app = router(state.clone());
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (format!("ws://{addr}/ws"), state)
}

type Ws = tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

/// A client with its replica: every sync message from the server is applied to it.
struct Client {
    ws: Ws,
    replica: Host,
    hashes: usize,
}

async fn connect(url: &str, callsign: &str, password: &str) -> (Ws, Value) {
    let (mut ws, _) = tokio_tungstenite::connect_async(url).await.unwrap();
    let hello = json!({ "type": "hello", "protocolVersion": 2, "callsign": callsign, "password": password });
    ws.send(Message::Text(hello.to_string().into())).await.unwrap();
    let first = next(&mut ws).await;
    (ws, first)
}

async fn next(ws: &mut Ws) -> Value {
    loop {
        let msg = tokio::time::timeout(Duration::from_secs(10), ws.next()).await.expect("message in time").expect("open").unwrap();
        if let Message::Text(t) = msg {
            return serde_json::from_str(t.as_str()).unwrap();
        }
    }
}

impl Client {
    /// Logs in; the first message after the welcome is the world's checkpoint.
    async fn login(url: &str, callsign: &str, password: &str) -> Client {
        let (mut ws, welcome) = connect(url, callsign, password).await;
        assert_eq!(welcome["type"], "welcome", "{welcome}");
        let reset = next(&mut ws).await;
        assert_eq!(reset["type"], "reset");
        let mut c = Client { ws, replica: Host::new(HostOptions::default()), hashes: 0 };
        c.apply(reset);
        c
    }

    fn apply(&mut self, m: Value) {
        if m["type"] == "hash" {
            self.hashes += 1;
        }
        let msg = SyncMessage::from_value(m).unwrap();
        self.replica.apply_sync(msg).expect("the replica follows the server");
    }

    /// Next message that is not a sync message (those go to the replica).
    async fn next(&mut self) -> Value {
        loop {
            let m = next(&mut self.ws).await;
            match m["type"].as_str() {
                Some("reset" | "sync" | "hash") => self.apply(m),
                _ => return m,
            }
        }
    }

    /// Follows the world until `n` state hashes came (each checked by the replica).
    async fn wait_hashes(&mut self, n: usize) {
        while self.hashes < n {
            let m = next(&mut self.ws).await;
            match m["type"].as_str() {
                Some("reset" | "sync" | "hash") => self.apply(m),
                _ => panic!("unexpected message {m}"),
            }
        }
    }

    async fn ask(&mut self, id: u64, request: Value) -> Value {
        self.ws.send(Message::Text(json!({ "id": id, "request": request }).to_string().into())).await.unwrap();
        loop {
            let m = self.next().await;
            if m["type"] == "reply" && m["id"] == id {
                return m;
            }
        }
    }
}

fn tmp(name: &str) -> std::path::PathBuf {
    let d = std::env::temp_dir().join(format!("sg-it-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    d
}

#[tokio::test]
async fn login_play_reconnect_and_restart() {
    let dir = tmp("play");
    let (url, state) = start(config(&dir, true)).await;

    let mut c = Client::login(&url, "Kestrel", "tajne-haslo").await;
    let snap = c.ask(1, json!({ "kind": "start", "scenarioId": "tau-ceti" })).await;
    assert_eq!(snap["ok"], true);
    assert_eq!(snap["value"]["scenarioId"], "tau-ceti");
    assert_eq!(c.replica.session.scenario_id(), "tau-ceti");
    let scan = c.ask(3, json!({ "kind": "command", "command": { "type": "SCAN_SYSTEM", "shipId": "arka-1" } })).await;
    assert_eq!(scan["value"]["ok"], true, "{scan}");
    assert_eq!(c.replica.session.commands().len(), 1, "the command reached the replica before the reply");
    c.ask(4, json!({ "kind": "setTempo", "tempo": 600 })).await;
    let bad = c.ask(5, json!({ "kind": "nope" })).await;
    assert_eq!(bad["ok"], false);
    // the world runs; the replica follows it and the hash (every 5 s) agrees
    c.wait_hashes(1).await;
    c.ask(6, json!({ "kind": "pause" })).await;
    let saved = c.ask(7, json!({ "kind": "save" })).await["value"].clone();
    assert_eq!(saved["step"].as_u64().unwrap(), c.replica.session.step_index());
    assert_eq!(serde_json::to_value(c.replica.session.save()).unwrap(), saved, "the replica's save is the server's");
    let step = c.replica.session.step_index();
    assert!(step > 60);
    c.ws.close(None).await.unwrap();

    // wrong password: refused with a message
    let (_, refused) = connect(&url, "Kestrel", "zle-haslo").await;
    assert_eq!(refused["type"], "error");

    // reconnect: the same world, not a new one
    let mut c = Client::login(&url, "kestrel", "tajne-haslo").await;
    assert!(c.replica.session.step_index() >= step);
    let world_before = c.ask(2, json!({ "kind": "save" })).await["value"].clone();
    // a resync request gets a new checkpoint
    c.ws.send(Message::Text(json!({ "type": "resync" }).to_string().into())).await.unwrap();
    let again = next(&mut c.ws).await;
    assert_eq!(again["type"], "reset");
    c.ws.close(None).await.unwrap();

    // restart: the world comes back from disk (checkpoint + log tail)
    tokio::time::sleep(Duration::from_millis(200)).await;
    state.shutdown().await;
    let (url2, _state2) = start(config(&dir, true)).await;
    let mut c = Client::login(&url2, "Kestrel", "tajne-haslo").await;
    let after = c.ask(2, json!({ "kind": "save" })).await["value"].clone();
    assert_eq!(after["commands"], world_before["commands"]);
    assert!(after["step"].as_u64().unwrap() >= world_before["step"].as_u64().unwrap());
    assert_eq!(after["world"]["ships"], world_before["world"]["ships"], "paused: nothing moved");
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn production_needs_an_account_keeps_time_and_limits_requests() {
    let dir = tmp("prod");
    let (url, _state) = start(config(&dir, false)).await;
    let (_, refused) = connect(&url, "Nowy", "haslo-123").await;
    assert_eq!(refused["type"], "error", "no account is made on login in production");
    assert!(refused["error"].as_str().unwrap().contains("nieznany"));
    // registration is explicit in production
    let (mut ws, _) = tokio_tungstenite::connect_async(&url).await.unwrap();
    let hello = json!({ "type": "hello", "protocolVersion": 2, "callsign": "Nowy", "password": "haslo-123", "register": true });
    ws.send(Message::Text(hello.to_string().into())).await.unwrap();
    assert_eq!(next(&mut ws).await["type"], "welcome");
    let mut c = Client { ws, replica: Host::new(HostOptions::default()), hashes: 0 };
    let tempo = c.ask(1, json!({ "kind": "setTempo", "tempo": 600 })).await;
    assert_eq!(tempo["ok"], false, "no test tempos in production");

    // a burst far above 20/s: the excess is refused, the connection stays
    for id in 100..200u64 {
        let r = json!({ "id": id, "request": { "kind": "command", "command": { "type": "MOVE_SHIP", "shipId": "nope", "to": "x" } } });
        c.ws.send(Message::Text(r.to_string().into())).await.unwrap();
    }
    let (mut ok, mut limited) = (0, 0);
    while ok + limited < 100 {
        let m = c.next().await;
        if m["type"] == "reply" {
            if m["ok"] == true {
                ok += 1;
            } else {
                assert!(m["error"].as_str().unwrap().contains("za dużo"), "{m}");
                limited += 1;
            }
        }
    }
    assert!(limited >= 50 && ok >= 30, "ok {ok}, limited {limited}");
    tokio::time::sleep(Duration::from_millis(300)).await;
    let older = c.ask(300, json!({ "kind": "snapshot" })).await;
    assert_eq!(older["ok"], true);
    let _ = std::fs::remove_dir_all(dir);
}
