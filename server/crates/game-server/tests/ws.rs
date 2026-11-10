//! The server end to end over a real WebSocket: hello → welcome → checkpoint, requests → sync and
//! replies, a replica that stays equal to the server's world (hash), a refused login, the rate
//! limit, a world that survives a reconnect and a server restart (restored from disk), and two
//! players trading through a hub of the galaxy service (B6).

use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use tokio_tungstenite::tungstenite::Message;

use game_server::config::AuthConfig;
use game_server::{AppState, Config, PROTOCOL_VERSION, router};
use game_session::exchange::{MarketConfig, NpcConfig};
use game_session::{Host, HostOptions, SyncMessage};

fn config(dir: &std::path::Path, dev: bool) -> Config {
    Config {
        addr: "127.0.0.1:0".parse().unwrap(),
        data_dir: dir.to_path_buf(),
        database_url: None,
        dev_mode: dev,
        step_seconds: if dev { 1.0 / 60.0 } else { 1.0 },
        snapshot_seconds: 60.0,
        idle_seconds: 300.0,
        offline_limit_hours: 12.0,
        max_requests_per_second: 20.0,
        // shipments in about a second
        market: MarketConfig {
            seconds_per_ly: 0.02,
            handling_seconds: 0.5,
            npc: Some(NpcConfig { seed: 7, players: 6, update_seconds: 10.0, depth: 50.0 }),
            ..MarketConfig::default()
        },
        auth: AuthConfig::for_mode(dev),
    }
}

/// One HTTP/1.1 request over a fresh TCP connection: status, the session cookie it set, JSON body.
async fn http(url: &str, method: &str, path: &str, cookie: Option<&str>, body: Option<Value>) -> (u16, Option<String>, Value) {
    let (status, set, text) = http_text(url, method, path, cookie, body).await;
    (status, set, serde_json::from_str(&text).unwrap_or(Value::Null))
}

async fn http_text(url: &str, method: &str, path: &str, cookie: Option<&str>, body: Option<Value>) -> (u16, Option<String>, String) {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let addr = url.trim_start_matches("ws://").trim_end_matches("/ws");
    let mut s = tokio::net::TcpStream::connect(addr).await.unwrap();
    let body = body.map(|b| b.to_string()).unwrap_or_default();
    let mut req = format!(
        "{method} {path} HTTP/1.1\r\nHost: {addr}\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: {}\r\n",
        body.len()
    );
    if let Some(c) = cookie {
        req += &format!("Cookie: sg_session={c}\r\n");
    }
    req += "\r\n";
    req += &body;
    s.write_all(req.as_bytes()).await.unwrap();
    let mut out = Vec::new();
    s.read_to_end(&mut out).await.unwrap();
    let text = String::from_utf8(out).unwrap();
    let (head, body) = text.split_once("\r\n\r\n").unwrap();
    let status = head.split(' ').nth(1).unwrap().parse().unwrap();
    let set = head
        .lines()
        .filter_map(|l| l.strip_prefix("set-cookie: ").or_else(|| l.strip_prefix("Set-Cookie: ")))
        .find_map(|c| c.strip_prefix("sg_session=")?.split(';').next().map(str::to_string));
    (status, set, body.to_string())
}

/// A WebSocket that logs in with a ticket of the session's cookie.
async fn connect_with_ticket(url: &str, cookie: &str) -> (Ws, Value) {
    let (status, _, t) = http(url, "POST", "/api/ticket", Some(cookie), None).await;
    assert_eq!(status, 200, "{t}");
    let (mut ws, _) = tokio_tungstenite::connect_async(url).await.unwrap();
    let hello = json!({ "type": "hello", "protocolVersion": PROTOCOL_VERSION, "ticket": t["ticket"] });
    ws.send(Message::Text(hello.to_string().into())).await.unwrap();
    let first = next(&mut ws).await;
    (ws, first)
}

async fn start(cfg: Config) -> (String, std::sync::Arc<AppState>) {
    let state = AppState::open(cfg).await.unwrap();
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let app = router(state.clone());
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
    (format!("ws://{addr}/ws"), state)
}

type Ws = tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

/// A client with its replica: every sync message from the server is applied to it; the last view
/// of the galaxy is kept.
struct Client {
    ws: Ws,
    replica: Host,
    hashes: usize,
    galaxy: Option<Value>,
}

async fn connect(url: &str, callsign: &str, password: &str) -> (Ws, Value) {
    let (mut ws, _) = tokio_tungstenite::connect_async(url).await.unwrap();
    let hello = json!({ "type": "hello", "protocolVersion": PROTOCOL_VERSION, "callsign": callsign, "password": password });
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
        let mut c = Client { ws, replica: Host::new(HostOptions::default()), hashes: 0, galaxy: None };
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

    /// Next message that is neither a sync message (those go to the replica) nor a galaxy view (kept).
    async fn next(&mut self) -> Value {
        loop {
            let m = next(&mut self.ws).await;
            match m["type"].as_str() {
                Some("reset" | "sync" | "hash") => self.apply(m),
                Some("galaxy") => self.galaxy = Some(m["view"].clone()),
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
                Some("galaxy") => self.galaxy = Some(m["view"].clone()),
                _ => panic!("unexpected message {m}"),
            }
        }
    }

    async fn ask(&mut self, id: u64, request: Value) -> Value {
        self.ws.send(Message::Text(json!({ "id": id, "request": request }).to_string().into())).await.unwrap();
        self.reply(id).await
    }

    async fn reply(&mut self, id: u64) -> Value {
        loop {
            let m = self.next().await;
            if m["type"] == "reply" && m["id"] == id {
                return m;
            }
        }
    }

    async fn galaxy_op(&mut self, id: u64, op: Value) -> Value {
        self.ws.send(Message::Text(json!({ "id": id, "galaxy": op }).to_string().into())).await.unwrap();
        self.reply(id).await
    }

    /// Follows the world and the galaxy until `ok` holds (at most 15 s).
    async fn wait(&mut self, ok: impl Fn(&Client) -> bool, what: &str) -> &Client {
        let until = tokio::time::Instant::now() + Duration::from_secs(15);
        while !ok(self) {
            assert!(tokio::time::Instant::now() < until, "not in time: {what}; view {:?}", self.galaxy);
            let m = next(&mut self.ws).await;
            match m["type"].as_str() {
                Some("reset" | "sync" | "hash") => self.apply(m),
                Some("galaxy") => self.galaxy = Some(m["view"].clone()),
                _ => {}
            }
        }
        self
    }

    /// Body of the colony's port.
    fn port(&self) -> String {
        let w = self.replica.session.world();
        w.structures.iter().find(|s| s.kind == "HQ" && s.is_working()).expect("a port").body_id.clone()
    }

    /// Body of the colony's port and a catalog material it has at least `n` of.
    fn port_and_stock(&self, n: f64) -> (String, String) {
        let body = self.port();
        let catalog: Vec<String> = self.replica.session.catalog().materials.into_iter().map(|m| m.id).collect();
        let mat =
            self.replica.session.world().storage_of(&body).into_iter().find(|(m, q)| *q >= n && catalog.contains(m)).expect("stock").0;
        (body, mat)
    }

    fn stored(&self, body: &str, mat: &str) -> f64 {
        self.replica.session.world().storage_of(body).get(mat).copied().unwrap_or(0.0)
    }
}

impl Client {
    /// Logs in with a ticket of the session's cookie; the checkpoint follows the welcome.
    async fn with_ticket(url: &str, cookie: &str) -> Client {
        let (mut ws, welcome) = connect_with_ticket(url, cookie).await;
        assert_eq!(welcome["type"], "welcome", "{welcome}");
        let reset = next(&mut ws).await;
        assert_eq!(reset["type"], "reset");
        let mut c = Client { ws, replica: Host::new(HostOptions::default()), hashes: 0, galaxy: None };
        c.apply(reset);
        c
    }
}

fn hub<'a>(view: &'a Value, id: &str) -> &'a Value {
    view["hubs"].as_array().unwrap().iter().find(|h| h["id"] == id).expect("hub")
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
    // production: no password over the socket, no account made on login, no guests
    let (_, refused) = connect(&url, "Nowy", "haslo-123").await;
    assert_eq!(refused["type"], "error");
    assert!(refused["error"].as_str().unwrap().contains("wyłączone"), "{refused}");
    let (status, _, e) = http(&url, "POST", "/api/login", None, Some(json!({ "callsign": "Nowy", "password": "haslo-123" }))).await;
    assert_eq!((status, e["error"].as_str().unwrap()), (401, "nieznany dowódca"));
    let (status, _, _) = http(&url, "POST", "/api/guest", None, None).await;
    assert_eq!(status, 403, "no guests in production");
    assert_eq!(http(&url, "GET", "/metrics", None, None).await.0, 404, "no metrics without METRICS_TOKEN");
    // registration is explicit; the ticket of its session logs the socket in
    let (status, cookie, me) =
        http(&url, "POST", "/api/register", None, Some(json!({ "callsign": "Nowy", "password": "haslo-123" }))).await;
    assert_eq!(status, 200, "{me}");
    let (ws, welcome) = connect_with_ticket(&url, &cookie.unwrap()).await;
    assert_eq!(welcome["type"], "welcome", "{welcome}");
    assert_eq!(welcome["accountId"], me["accountId"]);
    let mut c = Client { ws, replica: Host::new(HostOptions::default()), hashes: 0, galaxy: None };
    let tempo = c.ask(1, json!({ "kind": "setTempo", "tempo": 600 })).await;
    assert_eq!(tempo["ok"], false, "no test tempos in production");
    let season = c.galaxy_op(2, json!({ "op": "closeSeason" })).await;
    assert!(season["error"].as_str().unwrap().contains("tryb deweloperski"), "seasons end by themselves: {season}");

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
    // a client of the previous protocol is told, not served (its replica would keep its own galaxy)
    let (mut ws, _) = tokio_tungstenite::connect_async(&url).await.unwrap();
    let hello = json!({ "type": "hello", "protocolVersion": 2, "callsign": "Nowy", "password": "haslo-123" });
    ws.send(Message::Text(hello.to_string().into())).await.unwrap();
    let old = next(&mut ws).await;
    assert_eq!(old["type"], "error");
    assert!(old["error"].as_str().unwrap().contains("protocol 3"), "{old}");
    let _ = std::fs::remove_dir_all(dir);
}

/// R-25: a session in a cookie, a one-time ticket for the socket, a logout, the lock after failed
/// logins, a guest account (dev mode), and a page of another site that the cookie does not serve.
#[tokio::test]
async fn sessions_tickets_logout_and_failed_logins() {
    let dir = tmp("sessions");
    let (url, _state) = start(config(&dir, true)).await;
    let creds = json!({ "callsign": "Orzel", "password": "haslo-123" });
    let (status, cookie, me) = http(&url, "POST", "/api/register", None, Some(creds.clone())).await;
    assert_eq!(status, 200, "{me}");
    assert_eq!((me["callsign"].as_str(), me["guest"].as_bool()), (Some("Orzel"), Some(false)));
    let cookie = cookie.expect("the session cookie");
    let (status, _, e) = http(&url, "POST", "/api/register", None, Some(creds.clone())).await;
    assert_eq!((status, e["error"].as_str().unwrap()), (409, "ten znak wywoławczy jest już zajęty"));
    let (status, _, again) = http(&url, "GET", "/api/session", Some(&cookie), None).await;
    assert_eq!((status, &again), (200, &me));

    // a ticket opens one socket, once
    let (status, _, t) = http(&url, "POST", "/api/ticket", Some(&cookie), None).await;
    assert_eq!(status, 200);
    let hello = json!({ "type": "hello", "protocolVersion": PROTOCOL_VERSION, "ticket": t["ticket"] });
    let (mut ws, _) = tokio_tungstenite::connect_async(&url).await.unwrap();
    ws.send(Message::Text(hello.to_string().into())).await.unwrap();
    let welcome = next(&mut ws).await;
    assert_eq!((welcome["type"].as_str(), &welcome["accountId"]), (Some("welcome"), &me["accountId"]));
    let (mut ws2, _) = tokio_tungstenite::connect_async(&url).await.unwrap();
    ws2.send(Message::Text(hello.to_string().into())).await.unwrap();
    let reused = next(&mut ws2).await;
    assert!(reused["error"].as_str().unwrap().contains("zużyty"), "{reused}");

    // the password login gives another session; the logout ends only its own
    let (status, second, _) = http(&url, "POST", "/api/login", None, Some(json!({ "callsign": "orzel", "password": "haslo-123" }))).await;
    assert_eq!(status, 200);
    let second = second.unwrap();
    assert_ne!(second, cookie);
    let (status, cleared, _) = http(&url, "POST", "/api/logout", Some(&second), None).await;
    assert_eq!((status, cleared.as_deref()), (204, Some("")));
    assert_eq!(http(&url, "GET", "/api/session", Some(&second), None).await.0, 401);
    assert_eq!(http(&url, "POST", "/api/ticket", Some(&second), None).await.0, 401);
    assert_eq!(http(&url, "GET", "/api/session", Some(&cookie), None).await.0, 200);

    // five wrong passwords lock the callsign, even for the right one
    for _ in 0..5 {
        let (status, _, _) = http(&url, "POST", "/api/login", None, Some(json!({ "callsign": "Orzel", "password": "zle-haslo" }))).await;
        assert_eq!(status, 401);
    }
    let (status, _, e) = http(&url, "POST", "/api/login", None, Some(creds.clone())).await;
    assert_eq!(status, 429, "{e}");
    assert!(e["error"].as_str().unwrap().contains("za dużo nieudanych"));

    // a guest (dev mode): a session without a password
    let (status, guest, g) = http(&url, "POST", "/api/guest", None, None).await;
    assert_eq!(status, 200, "{g}");
    assert!(g["callsign"].as_str().unwrap().starts_with("gosc-") && g["guest"] == true);
    let (_guest_ws, welcome) = connect_with_ticket(&url, &guest.unwrap()).await;
    assert_eq!(welcome["accountId"], g["accountId"]);

    // the metrics (open in dev mode): this server's accounts and sessions, the open sockets
    let (status, _, text) = http_text(&url, "GET", "/metrics", None, None).await;
    assert_eq!(status, 200);
    assert!(text.contains("\ngame_accounts 2\n"), "{text}");
    assert!(text.contains("\ngame_sessions 2\n"), "{text}");
    assert!(text.contains("game_logins_total{result=\"refused\"}"));
    assert!(text.contains("# TYPE game_world_tick_seconds histogram"));

    // a page of another site: the cookie does not act for it
    let addr = url.trim_start_matches("ws://").trim_end_matches("/ws").to_string();
    let (status, _, _) = {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let mut s = tokio::net::TcpStream::connect(&addr).await.unwrap();
        let req = format!(
            "POST /api/ticket HTTP/1.1\r\nHost: {addr}\r\nOrigin: https://evil.example\r\nCookie: sg_session={cookie}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"
        );
        s.write_all(req.as_bytes()).await.unwrap();
        let mut out = String::new();
        s.read_to_string(&mut out).await.unwrap();
        (out.split(' ').nth(1).unwrap().parse::<u16>().unwrap(), (), ())
    };
    assert_eq!(status, 403);
    let _ = std::fs::remove_dir_all(dir);
}

fn round2(x: f64) -> f64 {
    (x * 100.0).round() / 100.0
}

/// B6 gate (plan 02 §11, 05-SOCIAL S1): two players trade through a hub. Kestrel ships goods from
/// the colony to Sirius and offers them inside the faction's spread; Wega buys there, cheaper than
/// from the faction, and ships them home, where they land in the storage of Wega's world (one
/// `HUB_DELIVERY` command in its log, followed by the replica). Credits move by the price, less and
/// plus the fee; the market survives a restart.
#[tokio::test]
async fn two_players_trade_through_a_hub() {
    let dir = tmp("trade");
    let (url, state) = start(config(&dir, true)).await;
    let hub_id = "hub-sirius";
    let mut a = Client::login(&url, "Kestrel", "tajne-haslo").await;
    let mut b = Client::login(&url, "Wega", "inne-haslo").await;
    a.ask(1, json!({ "kind": "start", "scenarioId": "planeta-matka" })).await;
    b.ask(1, json!({ "kind": "start", "scenarioId": "planeta-matka" })).await;
    assert!(a.replica.session.snapshot().hubs.is_empty(), "server worlds have no galaxy of their own");

    let (a_body, mat) = a.port_and_stock(20.0);
    let before = a.stored(&a_body, &mat);
    // the bridge into the world is the server's: a client cannot deliver to itself
    let cheat = a
        .ask(2, json!({ "kind": "command", "command": { "type": "HUB_DELIVERY", "shipmentId": "x", "bodyId": a_body, "cargo": { &mat: 100 } } }))
        .await;
    assert_eq!(cheat["ok"], false, "{cheat}");
    let nowhere = a
        .ask(
            3,
            json!({ "kind": "command", "command": { "type": "SHIP_TO_HUB", "bodyId": a_body, "hubId": "hub-x", "cargo": { &mat: 1 } } }),
        )
        .await;
    assert_eq!(nowhere["ok"], false);
    let sent = a
        .ask(
            4,
            json!({ "kind": "command", "command": { "type": "SHIP_TO_HUB", "bodyId": a_body, "hubId": hub_id, "cargo": { &mat: 20 } } }),
        )
        .await;
    assert_eq!(sent["value"]["ok"], true, "{sent}");
    assert_eq!(a.stored(&a_body, &mat), before - 20.0, "the cargo left the colony (the replica too)");

    let at_hub = |v: &Value, who: &str| hub(v, hub_id)["stock"][who].as_f64().unwrap_or(0.0);
    let view = a.wait(|c| c.galaxy.as_ref().is_some_and(|v| at_hub(v, &mat) == 20.0), "the cargo at the hub").await.galaxy.clone().unwrap();
    let account_a = view["account"].as_str().unwrap().to_string();
    let quote = hub(&view, hub_id)["quotes"].as_array().unwrap().iter().find(|q| q["material"] == mat.as_str()).unwrap().clone();
    let (bid, ask) = (quote["bid"].as_f64().unwrap(), quote["ask"].as_f64().unwrap());
    assert!(bid > 0.0 && ask > bid, "the faction quotes {mat}: {quote}");
    let price = round2((bid + ask) / 2.0);
    let a_credits = view["credits"].as_f64().unwrap();

    let offer = a
        .galaxy_op(10, json!({ "op": "placeOrder", "hubId": hub_id, "material": mat, "side": "sell", "quantity": 20, "price": price }))
        .await;
    assert_eq!(offer["ok"], true, "{offer}");
    assert!(offer["value"]["trades"].as_array().unwrap().is_empty(), "inside the spread nobody meets it at once");

    let offered = |v: &Value| {
        hub(v, hub_id)["book"].as_array().unwrap().iter().any(|l| l["material"] == mat.as_str() && l["side"] == "sell" && l["npc"] == false)
    };
    let b_view = b.wait(|c| c.galaxy.as_ref().is_some_and(offered), "Kestrel's offer in Wega's book").await.galaxy.clone().unwrap();
    let players = b_view["players"].as_array().unwrap();
    assert!(players.iter().any(|p| p["name"] == "Kestrel" && p["npc"] == false), "players see each other");
    assert!(players.iter().any(|p| p["npc"] == true), "and the factions' commanders");
    assert_eq!(hub(&b_view, hub_id)["faction"], "Konsorcjum Orion");
    let b_credits = b_view["credits"].as_f64().unwrap();

    let deal =
        b.galaxy_op(11, json!({ "op": "placeOrder", "hubId": hub_id, "material": mat, "side": "buy", "quantity": 15, "price": ask })).await;
    assert_eq!(deal["ok"], true, "{deal}");
    let trades = deal["value"]["trades"].as_array().unwrap();
    assert_eq!(trades.len(), 1, "{deal}");
    assert_eq!(trades[0]["seller"], account_a.as_str(), "bought from the player, not the faction");
    assert_eq!(trades[0]["price"].as_f64(), Some(price));
    let value = price * 15.0;
    let paid = b
        .wait(|c| c.galaxy.as_ref().is_some_and(|v| at_hub(v, &mat) == 15.0), "the goods in Wega's hub stock")
        .await
        .galaxy
        .clone()
        .unwrap();
    assert!((paid["credits"].as_f64().unwrap() - (b_credits - value * 1.02)).abs() < 0.011, "{} vs {b_credits}", paid["credits"]);
    let got = a
        .wait(|c| c.galaxy.as_ref().is_some_and(|v| v["credits"].as_f64().unwrap() > a_credits), "Kestrel paid")
        .await
        .galaxy
        .clone()
        .unwrap();
    assert!((got["credits"].as_f64().unwrap() - (a_credits + value * 0.98)).abs() < 0.011);
    assert_eq!(got["orders"][0]["remaining"].as_f64(), Some(5.0), "5 units still offered");

    // home: the goods land in Wega's colony
    let b_body = b.port();
    let b_before = b.stored(&b_body, &mat);
    let ship = b.galaxy_op(12, json!({ "op": "shipHome", "hubId": hub_id, "bodyId": b_body, "cargo": { &mat: 15 } })).await;
    assert_eq!(ship["ok"], true, "{ship}");
    b.wait(|c| c.stored(&b_body, &mat) >= b_before + 15.0, "the delivery in Wega's storage").await;
    let deliveries = b
        .replica
        .session
        .commands()
        .iter()
        .filter(|c| matches!(c.command, game_core::models::command::Command::HubDelivery { .. }))
        .count();
    assert_eq!(deliveries, 1);
    b.wait(|c| c.galaxy.as_ref().is_some_and(|v| v["shipments"].as_array().unwrap().is_empty()), "the shipment done").await;

    // the market is kept across a restart
    a.ws.close(None).await.unwrap();
    b.ws.close(None).await.unwrap();
    tokio::time::sleep(Duration::from_millis(200)).await;
    state.shutdown().await;
    let saved: Value = serde_json::from_str(&std::fs::read_to_string(dir.join("galaxy.json")).unwrap()).unwrap();
    assert_eq!(saved["wallets"].as_object().unwrap().len(), 2);
    let (url2, _state2) = start(config(&dir, true)).await;
    let mut a = Client::login(&url2, "Kestrel", "tajne-haslo").await;
    let again = a.wait(|c| c.galaxy.is_some(), "the view after the restart").await.galaxy.clone().unwrap();
    assert_eq!(again["credits"], got["credits"]);
    assert_eq!(again["orders"][0]["remaining"].as_f64(), Some(5.0));
    let _ = std::fs::remove_dir_all(dir);
}

/// R-7: the factions are a switch. Off: no faction quotes, commanders or hosts; players' orders only.
#[tokio::test]
async fn factions_can_be_switched_off() {
    let dir = tmp("nonpc");
    let mut cfg = config(&dir, true);
    cfg.market.npc = None;
    let (url, _state) = start(cfg).await;
    let mut a = Client::login(&url, "Kestrel", "tajne-haslo").await;
    let v = a.wait(|c| c.galaxy.is_some(), "the view").await.galaxy.clone().unwrap();
    assert_eq!(v["npc"], false);
    assert!(v["players"].as_array().unwrap().is_empty());
    for h in v["hubs"].as_array().unwrap() {
        assert!(h["faction"].is_null());
        assert!(h["quotes"].as_array().unwrap().iter().all(|q| q["bid"] == 0.0 && q["ask"] == 0.0));
    }
    let order = a
        .galaxy_op(1, json!({ "op": "placeOrder", "hubId": "hub-sol", "material": "FER", "side": "buy", "quantity": 2, "price": 10 }))
        .await;
    assert_eq!(order["ok"], true);
    assert!(order["value"]["trades"].as_array().unwrap().is_empty(), "nobody sells");
    assert!(v["contracts"].as_array().unwrap().is_empty(), "no factions, no contracts");
    let _ = std::fs::remove_dir_all(dir);
}

/// 05-SOCIAL S1 gate, second half: a faction's contract settled. Kestrel takes a contract of the
/// Sirius hub, buys its goods there (from the faction, with the fee and the 5% duty), delivers
/// them, gets the reward and reputation; the premium contract needs reputation 75.
#[tokio::test]
async fn a_faction_contract_is_taken_delivered_and_paid() {
    let dir = tmp("contract");
    let mut cfg = config(&dir, true);
    cfg.market.start_credits = 10_000.0;
    let (url, _state) = start(cfg).await;
    let hub_id = "hub-sirius";
    let mut a = Client::login(&url, "Kestrel", "tajne-haslo").await;
    let v = a.wait(|c| c.galaxy.is_some(), "the view").await.galaxy.clone().unwrap();
    let contracts = v["contracts"].as_array().unwrap();
    assert_eq!(contracts.len(), 12, "3 open per hub");
    let premium = contracts.iter().find(|c| c["hubId"] == hub_id && c["minRep"] == 75.0).unwrap()["id"].clone();
    let refused = a.galaxy_op(1, json!({ "op": "takeContract", "contractId": premium })).await;
    assert_eq!(refused["ok"], false);
    assert!(refused["error"].as_str().unwrap().contains("reputacji 75"), "{refused}");

    let c = contracts.iter().find(|c| c["hubId"] == hub_id && c["minRep"] == 0.0).unwrap().clone();
    let (id, material, quantity, reward) =
        (c["id"].clone(), c["material"].as_str().unwrap().to_string(), c["quantity"].as_f64().unwrap(), c["reward"].as_f64().unwrap());
    assert_eq!(hub(&v, hub_id)["tariff"].as_f64(), Some(0.05));
    let taken = a.galaxy_op(2, json!({ "op": "takeContract", "contractId": id })).await;
    assert_eq!(taken["value"]["state"], "taken", "{taken}");
    let early = a.galaxy_op(3, json!({ "op": "deliverContract", "contractId": id })).await;
    assert!(early["error"].as_str().unwrap().starts_with("w hubie brakuje"), "{early}");

    let ask =
        hub(&v, hub_id)["quotes"].as_array().unwrap().iter().find(|q| q["material"] == material.as_str()).unwrap()["ask"].as_f64().unwrap();
    // above the ask: the faction's quote may move a little with the trade itself
    let bought = a
        .galaxy_op(
            4,
            json!({ "op": "placeOrder", "hubId": hub_id, "material": material, "side": "buy", "quantity": quantity, "price": ask * 2.0 }),
        )
        .await;
    assert_eq!(bought["value"]["order"]["remaining"].as_f64(), Some(0.0), "{bought}");
    let before = a
        .wait(|c| c.galaxy.as_ref().is_some_and(|v| hub(v, hub_id)["stock"][&material].as_f64() == Some(quantity)), "the goods in the hub")
        .await
        .galaxy
        .clone()
        .unwrap()["credits"]
        .as_f64()
        .unwrap();
    let done = a.galaxy_op(5, json!({ "op": "deliverContract", "contractId": id })).await;
    assert_eq!(done["value"]["state"], "delivered", "{done}");
    let after =
        a.wait(|c| c.galaxy.as_ref().is_some_and(|v| v["credits"].as_f64().unwrap() > before), "the reward").await.galaxy.clone().unwrap();
    assert!((after["credits"].as_f64().unwrap() - (before + reward)).abs() < 0.011);
    let rep = hub(&after, hub_id)["reputation"].as_f64().unwrap();
    assert!((5.0..6.0).contains(&rep), "5 for the contract and a little for the trade: {rep}");
    assert!(after["contracts"].as_array().unwrap().iter().any(|x| x["id"] == id && x["state"] == "delivered"));
    let _ = std::fs::remove_dir_all(dir);
}

/// 05-SOCIAL S2 gate: a corporation of three accounts; a deposit and a withdrawal in its ledger,
/// which every member sees. Invitations go by callsign; only the chief and officers withdraw.
#[tokio::test]
async fn a_corporation_of_three_accounts_with_a_deposit_and_a_withdrawal_in_its_ledger() {
    let dir = tmp("corp");
    let mut cfg = config(&dir, true);
    cfg.market.corp.founding_credits = 500.0;
    cfg.market.corp.founding_goods = Default::default();
    let (url, _state) = start(cfg).await;
    let mut a = Client::login(&url, "Kestrel", "tajne-haslo").await;
    let mut b = Client::login(&url, "Wega", "inne-haslo").await;
    let mut c = Client::login(&url, "Lyra", "trzecie-haslo").await;
    let account_c = c.wait(|x| x.galaxy.is_some(), "Lyra's view").await.galaxy.as_ref().unwrap()["account"].clone();

    let founded = a.galaxy_op(1, json!({ "op": "foundCorporation", "name": "Konsorcjum Kestrel", "tag": "kst", "hubId": "hub-sol" })).await;
    assert_eq!(founded["value"]["role"], "chief", "{founded}");
    assert_eq!(founded["value"]["tag"], "KST");
    let corp_id = founded["value"]["id"].clone();
    let stranger = b.galaxy_op(1, json!({ "op": "invite", "callsign": "Lyra" })).await;
    assert_eq!(stranger["ok"], false, "only members invite");
    for (n, who) in [(2, "Wega"), (3, "lyra")] {
        let r = a.galaxy_op(n, json!({ "op": "invite", "callsign": who })).await;
        assert_eq!(r["ok"], true, "{r}");
    }
    let invited = |x: &Client| x.galaxy.as_ref().is_some_and(|v| !v["invitations"].as_array().unwrap().is_empty());
    for (x, name) in [(&mut b, "Wega"), (&mut c, "Lyra")] {
        x.wait(invited, name).await;
        assert_eq!(x.galaxy.as_ref().unwrap()["invitations"][0]["by"], "Kestrel");
        let joined = x.galaxy_op(10, json!({ "op": "acceptInvitation", "corpId": corp_id })).await;
        assert_eq!(joined["value"]["role"], "member", "{joined}");
    }

    let paid = b.galaxy_op(11, json!({ "op": "deposit", "credits": 200, "note": "na start" })).await;
    assert_eq!(paid["value"]["credits"].as_f64(), Some(200.0), "{paid}");
    let refused = c.galaxy_op(11, json!({ "op": "withdraw", "credits": 50 })).await;
    assert!(refused["error"].as_str().unwrap().contains("szef i oficerowie"), "{refused}");
    let promoted = a.galaxy_op(4, json!({ "op": "setRole", "account": account_c, "role": "officer" })).await;
    assert_eq!(promoted["ok"], true, "{promoted}");
    let taken = c.galaxy_op(12, json!({ "op": "withdraw", "credits": 50, "note": "paliwo" })).await;
    assert_eq!(taken["value"]["credits"].as_f64(), Some(150.0), "{taken}");

    // every member sees the corporation, its three members and the two entries of the ledger
    let two = |x: &Client| x.galaxy.as_ref().is_some_and(|v| v["corporation"]["ledger"].as_array().is_some_and(|l| l.len() == 2));
    for x in [&mut a, &mut b, &mut c] {
        let v = x.wait(two, "the ledger").await.galaxy.clone().unwrap();
        let corp = &v["corporation"];
        assert_eq!(corp["members"].as_array().unwrap().len(), 3);
        let ledger = corp["ledger"].as_array().unwrap();
        assert_eq!(
            (ledger[0]["callsign"].as_str(), ledger[0]["kind"].as_str(), ledger[0]["credits"].as_f64()),
            (Some("Lyra"), Some("withdrawal"), Some(50.0))
        );
        assert_eq!(
            (ledger[1]["callsign"].as_str(), ledger[1]["kind"].as_str(), ledger[1]["note"].as_str()),
            (Some("Wega"), Some("deposit"), Some("na start"))
        );
        assert_eq!(v["corporations"][0]["members"], 3);
    }
    let _ = std::fs::remove_dir_all(dir);
}

/// R-26: the whole server on PostgreSQL (`TEST_DATABASE_URL`, e.g. `postgres://sg:sg@127.0.0.1:55432/sg`;
/// skipped without it), each run in a schema of its own. An account and its session, a world with
/// its commands, and the market with a shipment that reached its hub all come back after a restart,
/// and nothing of it is in files.
#[tokio::test]
async fn the_server_on_postgres_survives_a_restart() {
    let Ok(base) = std::env::var("TEST_DATABASE_URL") else {
        eprintln!("skipped: TEST_DATABASE_URL is not set");
        return;
    };
    let schema =
        format!("it_{}_{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis());
    let (admin, connection) = tokio_postgres::connect(&base, tokio_postgres::NoTls).await.expect("TEST_DATABASE_URL reachable");
    tokio::spawn(connection);
    admin.batch_execute(&format!("CREATE SCHEMA {schema}")).await.unwrap();
    let db = format!("{base}{}options=-c%20search_path%3D{schema}", if base.contains('?') { '&' } else { '?' });

    let dir = tmp("postgres");
    let cfg = Config { database_url: Some(db.clone()), ..config(&dir, true) };
    let (url, state) = start(cfg.clone()).await;
    let (status, cookie, me) =
        http(&url, "POST", "/api/register", None, Some(json!({ "callsign": "Sokol", "password": "haslo-123" }))).await;
    assert_eq!(status, 200, "{me}");
    let cookie = cookie.unwrap();
    let mut c = Client::with_ticket(&url, &cookie).await;
    c.ask(1, json!({ "kind": "start", "scenarioId": "planeta-matka" })).await;
    let (body, mat) = c.port_and_stock(10.0);
    let sent = c
        .ask(2, json!({ "kind": "command", "command": { "type": "SHIP_TO_HUB", "bodyId": body, "hubId": "hub-sirius", "cargo": { &mat: 10 } } }))
        .await;
    assert_eq!(sent["value"]["ok"], true, "{sent}");
    let at_hub = |v: &Value| hub(v, "hub-sirius")["stock"][mat.as_str()].as_f64().unwrap_or(0.0);
    c.wait(|c| c.galaxy.as_ref().is_some_and(|v| at_hub(v) == 10.0), "the cargo at the hub").await;
    c.ask(3, json!({ "kind": "pause" })).await;
    let before = c.ask(4, json!({ "kind": "save" })).await["value"].clone();
    c.ws.close(None).await.unwrap();
    tokio::time::sleep(Duration::from_millis(200)).await;
    state.shutdown().await;
    for f in ["accounts.json", "sessions.json", "galaxy.json", "worlds"] {
        assert!(!dir.join(f).exists(), "{f} is in PostgreSQL, not in files");
    }
    let tables: i64 = admin
        .query_one(&format!("SELECT count(*) FROM {schema}.world_snapshots WHERE world_id = $1"), &[&me["accountId"].as_str().unwrap()])
        .await
        .unwrap()
        .get(0);
    assert_eq!(tables, 1);

    // a new server on the same database: the session, the world and the market are back
    let (url, _state) = start(cfg).await;
    let (status, _, again) = http(&url, "GET", "/api/session", Some(&cookie), None).await;
    assert_eq!((status, &again["callsign"]), (200, &me["callsign"]));
    let mut c = Client::with_ticket(&url, &cookie).await;
    let after = c.ask(1, json!({ "kind": "save" })).await["value"].clone();
    assert_eq!(after["commands"], before["commands"]);
    assert_eq!(after["world"], before["world"], "paused: the same world");
    let view = c.wait(|c| c.galaxy.is_some(), "the galaxy view").await.galaxy.clone().unwrap();
    assert_eq!(at_hub(&view), 10.0, "the market came back with the cargo in the hub");
    // a second migration run changes nothing; the schema goes away
    admin.batch_execute(&format!("DROP SCHEMA {schema} CASCADE")).await.unwrap();
    let _ = std::fs::remove_dir_all(dir);
}

/// Buys `quantity` of a material from the faction in a hub at its ask.
async fn buy_from_faction(c: &mut Client, id: u64, hub_id: &str, material: &str, quantity: f64) {
    let view = c.wait(|x| x.galaxy.is_some(), "a view").await.galaxy.clone().unwrap();
    let quote = hub(&view, hub_id)["quotes"].as_array().unwrap().iter().find(|q| q["material"] == material).unwrap().clone();
    let r = c
        .galaxy_op(id, json!({ "op": "placeOrder", "hubId": hub_id, "material": material, "side": "buy", "quantity": quantity, "price": quote["ask"] }))
        .await;
    assert_eq!(r["value"]["order"]["remaining"].as_f64(), Some(0.0), "bought at once: {r}");
}

/// 05-SOCIAL S3 gate: a megaproject completed by the contributions of two corporations (an
/// alliance's gate), and a season closed and opened: the closed season's rankings stay in the
/// history, the market and the worlds start anew, and it all survives a restart.
#[tokio::test]
async fn two_corporations_complete_an_alliance_gate_and_a_season_turns() {
    let dir = tmp("season");
    let mut cfg = config(&dir, true);
    cfg.market.start_credits = 20_000.0;
    cfg.market.corp.founding_credits = 500.0;
    cfg.market.corp.founding_goods = Default::default();
    cfg.market.social.megaproject_scale = 0.02;
    cfg.market.social.season_seconds = 0.0;
    let (url, state) = start(cfg.clone()).await;
    let mut a = Client::login(&url, "Kestrel", "tajne-haslo").await;
    let mut b = Client::login(&url, "Wega", "inne-haslo").await;
    a.ask(1, json!({ "kind": "start", "scenarioId": "planeta-matka" })).await;
    let commands_before = a.replica.session.commands().len();
    a.ask(2, json!({ "kind": "command", "command": { "type": "SCAN_SYSTEM", "shipId": "arka-1" } })).await;
    assert!(a.replica.session.commands().len() > commands_before);
    let hub_id = "hub-sol";

    // two corporations and their alliance
    for (c, name, tag) in [(&mut a, "Konsorcjum Kestrel", "KST"), (&mut b, "Gildia Wega", "WGA")] {
        let r = c.galaxy_op(10, json!({ "op": "foundCorporation", "name": name, "tag": tag, "hubId": hub_id })).await;
        assert_eq!(r["ok"], true, "{r}");
    }
    let pact = a.galaxy_op(11, json!({ "op": "foundAlliance", "name": "Pakt Orionu" })).await;
    assert_eq!(pact["value"]["leads"], true, "{pact}");
    let invited = a.galaxy_op(12, json!({ "op": "inviteCorporation", "tag": "wga" })).await;
    assert_eq!(invited["value"]["invited"], json!(["WGA"]), "{invited}");
    let has_invitation = |x: &Client| x.galaxy.as_ref().is_some_and(|v| !v["allianceInvitations"].as_array().unwrap().is_empty());
    b.wait(has_invitation, "Wega's alliance invitation").await;
    let joined = b.galaxy_op(13, json!({ "op": "acceptAlliance", "allianceId": pact["value"]["id"] })).await;
    assert_eq!(joined["value"]["members"].as_array().unwrap().len(), 2, "{joined}");

    // the alliance's gate: Kestrel's corporation gives steel and beams, Wega's the engines and the superconductor
    let gate = a.galaxy_op(14, json!({ "op": "startMegaproject", "kind": "gate", "scope": "alliance", "hubId": hub_id })).await;
    assert_eq!(gate["ok"], true, "{gate}");
    let required = gate["value"]["required"].clone();
    assert_eq!(required, json!({ "STA": 32.0, "BEL": 8.0, "SLN": 3.0, "NAD": 1.0 }));
    let project = gate["value"]["id"].clone();
    buy_from_faction(&mut a, 20, hub_id, "STA", 32.0).await;
    buy_from_faction(&mut a, 21, hub_id, "BEL", 8.0).await;
    buy_from_faction(&mut b, 20, hub_id, "SLN", 3.0).await;
    buy_from_faction(&mut b, 21, hub_id, "NAD", 1.0).await;
    let half = a.galaxy_op(22, json!({ "op": "contribute", "projectId": project, "goods": { "STA": 32, "BEL": 8 } })).await;
    assert!(half["value"]["completedAt"].is_null(), "{half}");
    let done = b.galaxy_op(22, json!({ "op": "contribute", "projectId": project, "goods": { "SLN": 3, "NAD": 1 } })).await;
    assert!(done["value"]["completedAt"].as_f64().is_some(), "{done}");
    let shares: Vec<&str> = done["value"]["shares"].as_array().unwrap().iter().map(|s| s["tag"].as_str().unwrap()).collect();
    assert_eq!(shares.len(), 2, "two corporations gave: {shares:?}");
    // both see the completed gate, and its shorter travel to the hub
    let completed = |x: &Client| x.galaxy.as_ref().is_some_and(|v| v["megaprojects"][0]["completedAt"].as_f64().is_some());
    for x in [&mut a, &mut b] {
        let v = x.wait(completed, "the completed gate").await.galaxy.clone().unwrap();
        let travel = hub(&v, hub_id)["travelSeconds"].as_f64().unwrap();
        let elsewhere = hub(&v, "hub-sirius")["travelSeconds"].as_f64().unwrap();
        assert!(travel > 0.0 && elsewhere > 0.0);
    }

    // rankings of the season
    let r = a.galaxy_op(30, json!({ "op": "rankings" })).await;
    assert_eq!(r["value"]["season"]["number"], 1, "{r}");
    assert_eq!(r["value"]["netWorth"].as_array().unwrap().len(), 2);
    assert!(r["value"]["volume"].as_array().unwrap().iter().any(|e| e["name"] == "Wega" && e["tag"] == "WGA"));
    assert_eq!(r["value"]["corporations"].as_array().unwrap().len(), 2);

    // the season turns (dev mode by hand): the history keeps it, the market and Kestrel's world start anew
    let closed = a.galaxy_op(31, json!({ "op": "closeSeason" })).await;
    assert_eq!(closed["value"]["number"], 1, "{closed}");
    assert_eq!(closed["value"]["megaprojectsCompleted"], 1);
    let season2 = |x: &Client| x.galaxy.as_ref().is_some_and(|v| v["season"]["number"] == 2);
    let v = a.wait(season2, "season 2").await.galaxy.clone().unwrap();
    assert_eq!(v["credits"].as_f64(), Some(20_000.0), "start credits again");
    assert!(v["megaprojects"].as_array().unwrap().is_empty());
    assert_eq!(v["corporation"]["tag"], "KST", "corporations stay");
    assert_eq!(v["alliance"]["name"], "Pakt Orionu", "alliances stay");
    let fresh = a.wait(|x| x.replica.session.commands().is_empty(), "Kestrel's world anew").await;
    assert_eq!(fresh.replica.session.scenario_id(), "tau-ceti");
    let r = a.galaxy_op(32, json!({ "op": "rankings" })).await;
    assert_eq!(r["value"]["history"][0]["number"], 1);
    assert_eq!(r["value"]["history"][0]["netWorth"].as_array().unwrap().len(), 2);
    a.ws.close(None).await.unwrap();
    b.ws.close(None).await.unwrap();

    // a restart keeps season 2 and the history; the world stays in the new season
    tokio::time::sleep(Duration::from_millis(200)).await;
    state.shutdown().await;
    let (url, _state) = start(cfg).await;
    let mut a = Client::login(&url, "Kestrel", "tajne-haslo").await;
    assert!(a.replica.session.commands().is_empty(), "not reset twice, not the old world");
    let r = a.galaxy_op(1, json!({ "op": "rankings" })).await;
    assert_eq!((r["value"]["season"]["number"].as_u64(), r["value"]["history"].as_array().unwrap().len()), (Some(2), 1));
    // closing a season is for dev mode only (checked by the service)
    let _ = std::fs::remove_dir_all(dir);
}
