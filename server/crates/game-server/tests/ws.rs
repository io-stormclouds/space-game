//! The server end to end over a real WebSocket: hello → welcome, requests → replies and pushes, a
//! refused login, and a world that survives a reconnect and a server restart (restored from disk).

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio_tungstenite::tungstenite::Message;

use game_server::{AppState, Config, router};

fn config(dir: &std::path::Path, dev: bool) -> Config {
    Config {
        addr: "127.0.0.1:0".parse().unwrap(),
        data_dir: dir.to_path_buf(),
        dev_mode: dev,
        step_seconds: if dev { 1.0 / 60.0 } else { 1.0 },
        snapshot_seconds: 60.0,
        idle_seconds: 300.0,
        offline_limit_hours: 12.0,
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

async fn connect(url: &str, callsign: &str, password: &str) -> (Ws, Value) {
    let (mut ws, _) = tokio_tungstenite::connect_async(url).await.unwrap();
    let hello = json!({ "type": "hello", "protocolVersion": 1, "callsign": callsign, "password": password });
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

/// Sends a request and waits for its reply (pushes on the way are skipped).
async fn ask(ws: &mut Ws, id: u64, request: Value) -> Value {
    ws.send(Message::Text(json!({ "id": id, "request": request }).to_string().into())).await.unwrap();
    loop {
        let m = next(ws).await;
        if m["type"] == "reply" && m["id"] == id {
            return m;
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

    let (mut ws, welcome) = connect(&url, "Kestrel", "tajne-haslo").await;
    assert_eq!(welcome["type"], "welcome", "{welcome}");
    assert_eq!(welcome["devMode"], true);
    let snap = ask(&mut ws, 1, json!({ "kind": "start", "scenarioId": "tau-ceti" })).await;
    assert_eq!(snap["ok"], true);
    assert_eq!(snap["value"]["scenarioId"], "tau-ceti");
    ask(&mut ws, 2, json!({ "kind": "pause" })).await;
    let scan = ask(&mut ws, 3, json!({ "kind": "command", "command": { "type": "SCAN_SYSTEM", "shipId": "arka-1" } })).await;
    assert_eq!(scan["value"]["ok"], true, "{scan}");
    let stepped = ask(&mut ws, 4, json!({ "kind": "stepOnce", "steps": 600 })).await;
    let step = stepped["value"]["step"].as_u64().unwrap();
    assert!(step >= 600);
    let bad = ask(&mut ws, 5, json!({ "kind": "nope" })).await;
    assert_eq!(bad["ok"], false);
    ws.close(None).await.unwrap();

    // wrong password: refused with a message
    let (_, refused) = connect(&url, "Kestrel", "zle-haslo").await;
    assert_eq!(refused["type"], "error");

    // reconnect: the same world, not a new one
    let (mut ws, _) = connect(&url, "kestrel", "tajne-haslo").await;
    let again = ask(&mut ws, 1, json!({ "kind": "snapshot" })).await;
    assert!(again["value"]["step"].as_u64().unwrap() >= step);
    let world_before = ask(&mut ws, 2, json!({ "kind": "save" })).await["value"].clone();
    ws.close(None).await.unwrap();

    // restart: the world comes back from disk as the replay of its log
    tokio::time::sleep(Duration::from_millis(200)).await;
    state.shutdown().await;
    let (url2, _state2) = start(config(&dir, true)).await;
    let (mut ws, _) = connect(&url2, "Kestrel", "tajne-haslo").await;
    ask(&mut ws, 1, json!({ "kind": "pause" })).await;
    let after = ask(&mut ws, 2, json!({ "kind": "save" })).await["value"].clone();
    assert_eq!(after["commands"], world_before["commands"]);
    assert!(after["step"].as_u64().unwrap() >= world_before["step"].as_u64().unwrap());
    assert_eq!(after["world"]["structures"], world_before["world"]["structures"]);
    let _ = std::fs::remove_dir_all(dir);
}

#[tokio::test]
async fn production_needs_an_account_and_keeps_time() {
    let dir = tmp("prod");
    let (url, _state) = start(config(&dir, false)).await;
    let (_, refused) = connect(&url, "Nowy", "haslo-123").await;
    assert_eq!(refused["type"], "error", "no account is made on login in production");
    assert!(refused["error"].as_str().unwrap().contains("nieznany"));
    // registration is explicit in production
    let (mut ws, _) = tokio_tungstenite::connect_async(&url).await.unwrap();
    let hello = json!({ "type": "hello", "protocolVersion": 1, "callsign": "Nowy", "password": "haslo-123", "register": true });
    ws.send(Message::Text(hello.to_string().into())).await.unwrap();
    assert_eq!(next(&mut ws).await["type"], "welcome");
    let tempo = ask(&mut ws, 1, json!({ "kind": "setTempo", "tempo": 600 })).await;
    assert_eq!(tempo["ok"], false, "no test tempos in production");
    let _ = std::fs::remove_dir_all(dir);
}
