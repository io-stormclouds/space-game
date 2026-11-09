//! WebSocket gateway: hello (login) → welcome → the world's checkpoint and the galaxy's view, then
//! requests in, replies and sync messages out; `{"type":"resync"}` asks for a new checkpoint;
//! `{"id","galaxy":{…}}` goes to the galaxy service. Requests are rate-limited.

use std::sync::Arc;
use std::sync::atomic::Ordering;
use std::time::Duration;

use axum::extract::State;
use axum::extract::ws::{CloseFrame, Message, Utf8Bytes, WebSocket, WebSocketUpgrade};
use axum::response::Response;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::{mpsc, oneshot};

use crate::galaxy::GalaxyMsg;
use crate::world::{Wire, WorldMsg, wall_ms};
use crate::{AppState, PROTOCOL_VERSION};

/// Most bytes of one client frame (plan 02 §6: ≤ 1 MB; a save file for `load` fits).
const MAX_FRAME: usize = 4 << 20;

/// Token bucket of one connection: `rate` per second, bursts up to twice that.
struct Bucket {
    rate: f64,
    tokens: f64,
    last: std::time::Instant,
}

impl Bucket {
    fn new(rate: f64) -> Bucket {
        Bucket { rate, tokens: 2.0 * rate, last: std::time::Instant::now() }
    }

    fn take(&mut self, cost: f64) -> bool {
        let now = std::time::Instant::now();
        self.tokens = (self.tokens + now.duration_since(self.last).as_secs_f64() * self.rate).min(2.0 * self.rate);
        self.last = now;
        if self.tokens >= cost {
            self.tokens -= cost;
            true
        } else {
            false
        }
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Hello {
    #[serde(rename = "type")]
    kind: String,
    protocol_version: u32,
    callsign: String,
    password: String,
    /// Create the account (always allowed in dev mode, where the first login creates it).
    #[serde(default)]
    register: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Welcome<'a> {
    #[serde(rename = "type")]
    kind: &'static str,
    protocol_version: u32,
    account_id: &'a str,
    callsign: &'a str,
    world_id: &'a str,
    dev_mode: bool,
    step_seconds: f64,
    /// Unix ms, for the client's clock offset.
    server_time: f64,
}

pub async fn upgrade(ws: WebSocketUpgrade, State(state): State<Arc<AppState>>) -> Response {
    ws.max_message_size(MAX_FRAME).on_upgrade(move |socket| session(socket, state))
}

async fn refuse(mut socket: WebSocket, error: String) {
    let msg = serde_json::json!({ "type": "error", "error": error }).to_string();
    let _ = socket.send(Message::Text(msg.into())).await;
    let _ = socket.send(Message::Close(Some(CloseFrame { code: 4001, reason: Utf8Bytes::from_static("refused") }))).await;
}

async fn session(mut socket: WebSocket, state: Arc<AppState>) {
    // 1. hello within 10 s
    let first = tokio::time::timeout(Duration::from_secs(10), socket.recv()).await;
    let hello: Hello = match first {
        Ok(Some(Ok(Message::Text(t)))) => match serde_json::from_str(t.as_str()) {
            Ok(h) => h,
            Err(e) => return refuse(socket, format!("bad hello: {e}")).await,
        },
        _ => return refuse(socket, "expected hello".into()).await,
    };
    if hello.kind != "hello" || hello.protocol_version != PROTOCOL_VERSION {
        return refuse(socket, format!("protocol {} expected, got {}", PROTOCOL_VERSION, hello.protocol_version)).await;
    }
    let account = match state.accounts.authenticate(&hello.callsign, &hello.password, state.cfg.dev_mode || hello.register).await {
        Ok(a) => a,
        Err(e) => return refuse(socket, e.to_string()).await,
    };

    // 2. the player's world (one per account, Model C)
    let world_id = account.id.clone();
    let client = state.next_client.fetch_add(1, Ordering::Relaxed);
    let (tx, mut rx) = mpsc::unbounded_channel::<Wire>();
    let own_tx = tx.clone();
    let mut world = state.world(&world_id).await;
    let welcome = Welcome {
        kind: "welcome",
        protocol_version: PROTOCOL_VERSION,
        account_id: &account.id,
        callsign: &account.callsign,
        world_id: &world_id,
        dev_mode: state.cfg.dev_mode,
        step_seconds: state.cfg.step_seconds,
        server_time: wall_ms(),
    };
    let welcome = serde_json::to_string(&welcome).expect("welcome serialises");
    if socket.send(Message::Text(welcome.into())).await.is_err() {
        return;
    }
    let (done, attached) = oneshot::channel();
    if world.send(WorldMsg::Attach { client, tx: tx.clone(), done }).await.is_err() {
        // the world just went to sleep: start it again
        world = state.world(&world_id).await;
        let (done, again) = oneshot::channel();
        let _ = world.send(WorldMsg::Attach { client, tx, done }).await;
        let _ = again.await;
    } else {
        let _ = attached.await;
    }
    let _ = state.galaxy.send(GalaxyMsg::Connect {
        account: account.id.clone(),
        callsign: account.callsign.clone(),
        client,
        tx: own_tx.clone(),
    });
    println!("{} connected (client {client})", account.callsign);

    // 3. requests in, messages out
    let (mut sink, mut stream) = socket.split();
    let mut writer = tokio::spawn(async move {
        while let Some(json) = rx.recv().await {
            if sink.send(Message::Text(Utf8Bytes::from(json.as_ref()))).await.is_err() {
                break;
            }
        }
    });
    let mut bucket = Bucket::new(state.cfg.max_requests_per_second);
    loop {
        let msg = tokio::select! {
            // the world's task ended (stopped, or a panic in it): close, the client reconnects to a restored world
            _ = world.closed() => {
                println!("{}: world {world_id} ended, closing (client {client})", account.callsign);
                break;
            }
            _ = &mut writer => break,
            msg = stream.next() => match msg {
                Some(Ok(m)) => m,
                _ => break,
            },
        };
        match msg {
            Message::Text(t) => {
                let parsed: Option<serde_json::Value> = serde_json::from_str(t.as_str()).ok();
                let resync = parsed.as_ref().is_some_and(|v| v.get("type").and_then(|k| k.as_str()) == Some("resync"));
                // a resync costs a whole checkpoint: it counts as ten requests
                if !bucket.take(if resync { 10.0 } else { 1.0 }) {
                    if let Some(id) = parsed.as_ref().and_then(|v| v.get("id")?.as_u64()) {
                        let reply = game_session::Outgoing::err(id, "za dużo żądań na sekundę: zwolnij");
                        let _ = own_tx.send(serde_json::to_string(&reply).expect("reply serialises").into());
                    }
                    continue;
                }
                if let Some(op) = parsed.as_ref().and_then(|v| v.get("galaxy")) {
                    let id = parsed.as_ref().and_then(|v| v.get("id")?.as_u64()).unwrap_or(0);
                    let _ = state.galaxy.send(GalaxyMsg::Op { account: account.id.clone(), client, id, op: op.clone() });
                    continue;
                }
                let m = if resync { WorldMsg::Resync { client } } else { WorldMsg::Request { client, json: t.to_string() } };
                if world.send(m).await.is_err() {
                    break;
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }
    let _ = world.send(WorldMsg::Detach { client }).await;
    let _ = state.galaxy.send(GalaxyMsg::Disconnect { client });
    writer.abort();
    println!("{} disconnected (client {client})", account.callsign);
}
