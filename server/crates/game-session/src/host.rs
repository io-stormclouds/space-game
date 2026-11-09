//! `ServerHost` and the message protocol (`mock-server/src/host.ts`, `api/src/protocol.ts`): requests
//! carry an id and get a `reply` with the same id; pushes (snapshot, events, frame) have none. The
//! host does not own a timer: the caller runs `tick(now_ms)` about every 16 ms and forwards each
//! outgoing message (worker `postMessage`, WebSocket frame).

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

use game_core::economy::EconomyParams;
use game_core::ids::BodyId;
use game_core::models::command::Command;
use game_core::models::event::DomainEvent;
use game_core::sim::flows::NominalFlows;

use crate::contract::*;
use crate::session::{GameSession, SessionOptions};
use crate::sync::SyncMessage;

#[derive(Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Request {
    Start {
        scenario_id: String,
        #[serde(default)]
        economy: Option<EconomyParams>,
    },
    Command {
        command: Command,
    },
    SetTempo {
        tempo: f64,
    },
    Pause,
    Resume,
    StepOnce {
        steps: f64,
    },
    Save,
    Load {
        file: Box<serde_json::Value>,
    },
    Replay {
        file: Box<serde_json::Value>,
    },
    Snapshot,
    Catalog,
    Availability {
        body_id: BodyId,
        kinds: Vec<String>,
    },
    PreviewBuild {
        body_id: BodyId,
        tile_index: usize,
        building_kind: String,
        rotation: i64,
    },
    SuggestTile {
        body_id: BodyId,
        building_kind: String,
        #[serde(default)]
        material: Option<String>,
    },
    TileInfo {
        body_id: BodyId,
        tile_index: usize,
    },
    EconomyReport {
        #[serde(default)]
        economy: Option<EconomyParams>,
    },
    NominalFlows {
        body_id: BodyId,
    },
    /// The galaxy's market: the server's galaxy service answers it; a world alone refuses (NO_TRADE).
    Galaxy {
        op: serde_json::Value,
    },
}

impl Request {
    /// Requests that do not change the game (no snapshot push after them).
    pub fn is_query(&self) -> bool {
        matches!(
            self,
            Request::Snapshot
                | Request::Save
                | Request::Catalog
                | Request::Availability { .. }
                | Request::PreviewBuild { .. }
                | Request::SuggestTile { .. }
                | Request::TileInfo { .. }
                | Request::EconomyReport { .. }
                | Request::NominalFlows { .. }
                | Request::Galaxy { .. }
        )
    }
}

#[derive(Deserialize, Clone, Debug, PartialEq)]
pub struct RequestMessage {
    pub id: u64,
    pub request: Request,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(untagged)]
pub enum ReplyValue {
    Snapshot(Box<GameSnapshot>),
    Command(CommandResult),
    Save(Box<SaveFile>),
    Replay(Box<ReplayResult>),
    Catalog(Box<CatalogView>),
    Availability(Box<IndexMap<String, Availability>>),
    Preview(Box<BuildPreview>),
    Suggestion(Option<TileChoice>),
    Tile(Option<Box<TileInfo>>),
    Economy(Box<EconomyReport>),
    Flows(Box<NominalFlows>),
    Null,
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(untagged)]
pub enum Reply {
    Ok { id: u64, ok: bool, value: ReplyValue },
    Err { id: u64, ok: bool, error: String },
}

/// Everything the host sends: replies and pushes (`WorkerMessage`).
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Outgoing {
    Reply(Reply),
    Snapshot { snapshot: Box<GameSnapshot> },
    Events { events: Vec<DomainEvent> },
    Frame { frame: FrameData },
}

impl Outgoing {
    pub fn ok(id: u64, value: ReplyValue) -> Outgoing {
        Outgoing::Reply(Reply::Ok { id, ok: true, value })
    }

    pub fn err(id: u64, error: impl Into<String>) -> Outgoing {
        Outgoing::Reply(Reply::Err { id, ok: false, error: error.into() })
    }
}

pub struct HostOptions {
    pub session: SessionOptions,
    /// Real ms between pushed snapshots (HUD state).
    pub snapshot_ms: f64,
    /// A galaxy service stands behind the world (the server): commands of the trade with hubs are
    /// accepted. Without it (mock, offline WASM) they are refused: the cargo would have nowhere to go.
    pub trade: bool,
}

impl Default for HostOptions {
    fn default() -> HostOptions {
        HostOptions { session: SessionOptions::default(), snapshot_ms: 100.0, trade: false }
    }
}

/// Reply to a trade command in a world without the galaxy service.
pub const NO_TRADE: &str = "handel z hubami działa tylko w grze na serwerze";

/// Runs a [`GameSession`] behind the message protocol.
pub struct Host {
    pub session: GameSession,
    snapshot_ms: f64,
    trade: bool,
    last: Option<f64>,
    last_snapshot: f64,
    /// Replica: the game changed since the last pushed snapshot.
    dirty: bool,
    /// Replica: step of the last pushed frame.
    frame_step: Option<u64>,
}

impl Host {
    pub fn new(opts: HostOptions) -> Host {
        Host {
            session: GameSession::new(opts.session),
            snapshot_ms: opts.snapshot_ms,
            trade: opts.trade,
            last: None,
            last_snapshot: f64::NEG_INFINITY,
            dirty: true,
            frame_step: None,
        }
    }

    /// Fixed steps for the real time passed since the last call (the server's world loop: no
    /// frame, no snapshot; followers get the changes through [`crate::SyncCursor`]).
    pub fn advance(&mut self, now_ms: f64) -> Vec<DomainEvent> {
        let dt = self.last.map(|l| (now_ms - l) / 1000.0).unwrap_or(0.0);
        self.last = Some(now_ms);
        self.session.advance(dt)
    }

    /// One request → its reply only (the server: pushes go to followers as sync messages).
    pub fn answer(&mut self, msg: RequestMessage) -> Outgoing {
        let mut pushes = Vec::new();
        match self.dispatch(msg.request, &mut pushes) {
            Ok(value) => Outgoing::ok(msg.id, value),
            Err(e) => Outgoing::err(msg.id, e),
        }
    }

    /// Replica (the client's copy of the server's world): applies a sync message; returns the events
    /// of the commands and steps it ran. An error means the copy needs a reset from the server.
    pub fn apply_sync(&mut self, msg: SyncMessage) -> Result<Vec<Outgoing>, String> {
        let reset = matches!(msg, SyncMessage::Reset { .. });
        let events = msg.apply(&mut self.session)?;
        self.dirty = true;
        let mut out = Vec::new();
        if !events.is_empty() {
            out.push(Outgoing::Events { events });
        }
        if reset {
            self.frame_step = None;
        }
        Ok(out)
    }

    /// Replica loop tick: the frame when a step was made, the snapshot (at most every
    /// `snapshot_ms`) when something changed. The replica never steps on its own.
    pub fn view(&mut self, now_ms: f64) -> Vec<Outgoing> {
        let mut out = Vec::new();
        let step = self.session.step_index();
        if self.frame_step != Some(step) {
            self.frame_step = Some(step);
            out.push(Outgoing::Frame { frame: self.session.frame() });
        }
        if self.dirty && now_ms - self.last_snapshot >= self.snapshot_ms {
            self.dirty = false;
            out.push(self.push_snapshot(now_ms));
        }
        out
    }

    /// One loop tick: fixed steps for the real time passed, events, the frame, and a snapshot every `snapshot_ms`.
    pub fn tick(&mut self, now_ms: f64) -> Vec<Outgoing> {
        let dt = self.last.map(|l| (now_ms - l) / 1000.0).unwrap_or(0.0);
        self.last = Some(now_ms);
        let mut out = Vec::with_capacity(3);
        let events = self.session.advance(dt);
        if !events.is_empty() {
            out.push(Outgoing::Events { events });
        }
        out.push(Outgoing::Frame { frame: self.session.frame() });
        if now_ms - self.last_snapshot >= self.snapshot_ms {
            out.push(self.push_snapshot(now_ms));
        }
        out
    }

    pub fn push_snapshot(&mut self, now_ms: f64) -> Outgoing {
        self.last_snapshot = now_ms;
        Outgoing::Snapshot { snapshot: Box::new(self.session.snapshot()) }
    }

    /// A request as JSON (`RequestMessage`); a message that does not parse gets an error reply when its id can be read.
    pub fn handle_json(&mut self, json: &str, now_ms: f64) -> Vec<Outgoing> {
        let value: serde_json::Value = match serde_json::from_str(json) {
            Ok(v) => v,
            Err(e) => return vec![Outgoing::err(0, format!("bad message: {e}"))],
        };
        let id = value.get("id").and_then(|v| v.as_u64()).unwrap_or(0);
        match serde_json::from_value::<RequestMessage>(value) {
            Ok(msg) => self.handle(msg, now_ms),
            Err(e) => vec![Outgoing::err(id, format!("bad request: {e}"))],
        }
    }

    pub fn handle(&mut self, msg: RequestMessage, now_ms: f64) -> Vec<Outgoing> {
        let mut out = Vec::new();
        let query = msg.request.is_query();
        match self.dispatch(msg.request, &mut out) {
            Ok(value) => {
                out.push(Outgoing::ok(msg.id, value));
                if !query {
                    out.push(self.push_snapshot(now_ms));
                }
            }
            Err(e) => out.push(Outgoing::err(msg.id, e)),
        }
        out
    }

    fn dispatch(&mut self, r: Request, out: &mut Vec<Outgoing>) -> Result<ReplyValue, String> {
        let s = &mut self.session;
        Ok(match r {
            Request::Start { scenario_id, economy } => ReplyValue::Snapshot(Box::new(s.start(&scenario_id, economy, None)?)),
            Request::Command { command } => {
                if command.needs_galaxy() && !self.trade {
                    return Err(NO_TRADE.to_string());
                }
                let result = s.command(command);
                if !result.events.is_empty() {
                    out.push(Outgoing::Events { events: result.events.clone() });
                }
                ReplyValue::Command(result)
            }
            Request::SetTempo { tempo } => {
                s.set_tempo(tempo)?;
                ReplyValue::Null
            }
            Request::Pause => {
                s.pause();
                ReplyValue::Null
            }
            Request::Resume => {
                s.resume();
                ReplyValue::Null
            }
            Request::StepOnce { steps } => {
                let n = if steps.is_finite() { steps.floor().max(1.0) as u64 } else { 1 };
                let events = s.step_many(n);
                if !events.is_empty() {
                    out.push(Outgoing::Events { events });
                }
                ReplyValue::Snapshot(Box::new(s.snapshot()))
            }
            Request::Save => ReplyValue::Save(Box::new(s.save())),
            Request::Load { file } => ReplyValue::Snapshot(Box::new(s.load(SaveFile::parse(*file)?)?)),
            Request::Replay { file } => ReplyValue::Replay(Box::new(s.replay(SaveFile::parse(*file)?)?)),
            Request::Snapshot => ReplyValue::Snapshot(Box::new(s.snapshot())),
            Request::Catalog => ReplyValue::Catalog(Box::new(s.catalog())),
            Request::Availability { body_id, kinds } => ReplyValue::Availability(Box::new(s.availability(&body_id, &kinds))),
            Request::PreviewBuild { body_id, tile_index, building_kind, rotation } => {
                ReplyValue::Preview(Box::new(s.preview_build(&body_id, tile_index, &building_kind, rotation)))
            }
            Request::SuggestTile { body_id, building_kind, material } => {
                ReplyValue::Suggestion(s.suggest_tile(&body_id, &building_kind, material.as_deref())?)
            }
            Request::TileInfo { body_id, tile_index } => ReplyValue::Tile(s.tile_info(&body_id, tile_index).map(Box::new)),
            Request::EconomyReport { economy } => ReplyValue::Economy(Box::new(s.economy_report(economy))),
            Request::NominalFlows { body_id } => ReplyValue::Flows(Box::new(s.nominal_flows(&body_id))),
            Request::Galaxy { .. } => return Err(NO_TRADE.to_string()),
        })
    }
}
