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
}

impl Default for HostOptions {
    fn default() -> HostOptions {
        HostOptions { session: SessionOptions::default(), snapshot_ms: 100.0 }
    }
}

/// Runs a [`GameSession`] behind the message protocol.
pub struct Host {
    pub session: GameSession,
    snapshot_ms: f64,
    last: Option<f64>,
    last_snapshot: f64,
}

impl Host {
    pub fn new(opts: HostOptions) -> Host {
        Host { session: GameSession::new(opts.session), snapshot_ms: opts.snapshot_ms, last: None, last_snapshot: f64::NEG_INFINITY }
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
        })
    }
}
