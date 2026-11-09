//! WebSocket gateway: hello (login) → welcome → requests and pushes of the player's world.

use std::sync::Arc;
use std::sync::atomic::Ordering;
use std::time::Duration;

use axum::extract::State;
use axum::extract::ws::{CloseFrame, Message, Utf8Bytes, WebSocket, WebSocketUpgrade};
use axum::response::Response;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use tokio::sync::{mpsc, oneshot};

use crate::world::{WorldMsg, wall_ms};
use crate::{AppState, PROTOCOL_VERSION};

/// Most bytes of one client frame (plan 02 §6: ≤ 1 MB; a save file for `load` fits).
const MAX_FRAME: usize = 4 << 20;

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
    let (tx, mut rx) = mpsc::unbounded_channel();
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
    println!("{} connected (client {client})", account.callsign);

    // 3. requests in, messages out
    let (mut sink, mut stream) = socket.split();
    let writer = tokio::spawn(async move {
        while let Some(json) = rx.recv().await {
            if sink.send(Message::Text(Utf8Bytes::from(json.as_ref()))).await.is_err() {
                break;
            }
        }
    });
    while let Some(Ok(msg)) = stream.next().await {
        match msg {
            Message::Text(t) => {
                if world.send(WorldMsg::Request { client, json: t.to_string() }).await.is_err() {
                    break;
                }
            }
            Message::Close(_) => break,
            _ => {}
        }
    }
    let _ = world.send(WorldMsg::Detach { client }).await;
    writer.abort();
    println!("{} disconnected (client {client})", account.callsign);
}
