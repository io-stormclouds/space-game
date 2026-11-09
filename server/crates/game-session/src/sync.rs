//! Keeping a copy of a game in step with the original (plan 02 §6, reconciliation): the client's
//! replica in WebAssembly follows the server's world, and a world restored from a snapshot follows
//! its log tail. The simulation is deterministic, so the follower needs only what the player
//! changed (commands, tempo changes, pause) and how far the steps went. The world itself travels
//! once, as a [`Checkpoint`], and a state hash now and then proves both copies are still equal.

use serde::{Deserialize, Serialize};

use crate::contract::{RecordedCommand, TempoChange};
use crate::session::{Checkpoint, GameSession};

/// Server → follower. Parsed with [`SyncMessage::from_json`] (no `Deserialize` derive: an internally
/// tagged enum would buffer the whole checkpoint and compile a second deserializer of the world into
/// the WebAssembly module).
#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum SyncMessage {
    /// The whole game: on attach, after the world was replaced (start, load, replay), on resync.
    Reset { checkpoint: Box<Checkpoint>, paused: bool },
    /// What happened since the previous message: tempo changes and commands at their steps, steps up to `step`.
    Sync {
        step: u64,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        tempos: Vec<TempoChange>,
        #[serde(default, skip_serializing_if = "Vec::is_empty")]
        commands: Vec<RecordedCommand>,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        paused: Option<bool>,
    },
    /// [`GameSession::state_hash`] at `step`; a follower at that step with another hash asks for a reset.
    Hash { step: u64, hash: String },
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SyncBody {
    step: u64,
    #[serde(default)]
    tempos: Vec<TempoChange>,
    #[serde(default)]
    commands: Vec<RecordedCommand>,
    #[serde(default)]
    paused: Option<bool>,
}

#[derive(Deserialize)]
struct HashBody {
    step: u64,
    hash: String,
}

impl SyncMessage {
    /// Parses a message of the server by its `type`.
    pub fn from_json(text: &str) -> Result<SyncMessage, String> {
        Self::from_value(serde_json::from_str(text).map_err(|e| format!("bad sync message: {e}"))?)
    }

    pub fn from_value(mut v: serde_json::Value) -> Result<SyncMessage, String> {
        let bad = |e: serde_json::Error| format!("bad sync message: {e}");
        match v.get("type").and_then(|t| t.as_str()) {
            Some("reset") => {
                let paused = v.get("paused").and_then(|p| p.as_bool()).unwrap_or(false);
                let cp = v.get_mut("checkpoint").map(serde_json::Value::take).unwrap_or_default();
                Ok(SyncMessage::Reset { checkpoint: Box::new(serde_json::from_value(cp).map_err(bad)?), paused })
            }
            Some("sync") => {
                let b: SyncBody = serde_json::from_value(v).map_err(bad)?;
                Ok(SyncMessage::Sync { step: b.step, tempos: b.tempos, commands: b.commands, paused: b.paused })
            }
            Some("hash") => {
                let b: HashBody = serde_json::from_value(v).map_err(bad)?;
                Ok(SyncMessage::Hash { step: b.step, hash: b.hash })
            }
            other => Err(format!("unknown sync message {other:?}")),
        }
    }

    pub fn reset(session: &GameSession) -> SyncMessage {
        SyncMessage::Reset { checkpoint: Box::new(session.checkpoint()), paused: session.is_paused() }
    }

    pub fn hash(session: &GameSession) -> SyncMessage {
        SyncMessage::Hash { step: session.step_index(), hash: session.state_hash() }
    }

    /// Applies a message to a follower; returns the events of the steps and commands it ran.
    /// An error means the follower can no longer follow (a gap, another hash): it needs a reset.
    pub fn apply(self, session: &mut GameSession) -> Result<Vec<game_core::models::event::DomainEvent>, String> {
        match self {
            SyncMessage::Reset { checkpoint, paused } => {
                session.restore(*checkpoint)?;
                set_paused(session, paused);
                Ok(Vec::new())
            }
            SyncMessage::Sync { step, tempos, commands, paused } => {
                let events = session.follow(step, &tempos, &commands)?;
                if let Some(p) = paused {
                    set_paused(session, p);
                }
                Ok(events)
            }
            SyncMessage::Hash { step, hash } => {
                if session.step_index() == step && session.state_hash() != hash {
                    return Err(format!("state differs from the server at step {step}"));
                }
                Ok(Vec::new())
            }
        }
    }
}

fn set_paused(session: &mut GameSession, paused: bool) {
    if paused {
        session.pause();
    } else {
        session.resume();
    }
}

/// What the followers have been told; [`SyncCursor::diff`] gives the next message.
pub struct SyncCursor {
    generation: u64,
    step: u64,
    commands: usize,
    tempos: Vec<TempoChange>,
    paused: bool,
}

impl SyncCursor {
    /// Followers start from a [`SyncMessage::reset`] of the session as it is now.
    pub fn new(session: &GameSession) -> SyncCursor {
        SyncCursor {
            generation: session.generation(),
            step: session.step_index(),
            commands: session.commands().len(),
            tempos: session.tempos().to_vec(),
            paused: session.is_paused(),
        }
    }

    /// The changes since the last call (or a reset when the world was replaced); `None` when nothing changed.
    pub fn diff(&mut self, session: &GameSession) -> Option<SyncMessage> {
        if session.generation() != self.generation {
            *self = SyncCursor::new(session);
            return Some(SyncMessage::reset(session));
        }
        let commands = session.commands().get(self.commands..).unwrap_or_default().to_vec();
        let tempos: Vec<TempoChange> =
            session.tempos().iter().enumerate().filter(|(i, t)| self.tempos.get(*i) != Some(t)).map(|(_, t)| *t).collect();
        let paused = (session.is_paused() != self.paused).then_some(session.is_paused());
        let step = session.step_index();
        if step == self.step && commands.is_empty() && tempos.is_empty() && paused.is_none() {
            return None;
        }
        self.step = step;
        self.commands = session.commands().len();
        self.tempos = session.tempos().to_vec();
        self.paused = session.is_paused();
        Some(SyncMessage::Sync { step, tempos, commands, paused })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::session::SessionOptions;
    use game_core::models::command::Command;

    fn session() -> GameSession {
        GameSession::new(SessionOptions::default())
    }

    fn world_json(s: &GameSession) -> serde_json::Value {
        serde_json::to_value((s.world(), s.save().meta, s.simulation().export_state(), s.step_index(), s.tempo())).unwrap()
    }

    /// Paths where two JSON values differ (first 12).
    fn differences(a: &serde_json::Value, b: &serde_json::Value) -> Vec<String> {
        fn walk(a: &serde_json::Value, b: &serde_json::Value, path: String, out: &mut Vec<String>) {
            use serde_json::Value::{Array, Null, Object};
            if out.len() >= 12 {
                return;
            }
            match (a, b) {
                (Object(x), Object(y)) => {
                    for k in x.keys().chain(y.keys().filter(|k| !x.contains_key(*k))) {
                        walk(x.get(k).unwrap_or(&Null), y.get(k).unwrap_or(&Null), format!("{path}.{k}"), out);
                    }
                }
                (Array(x), Array(y)) if x.len() == y.len() => {
                    for (i, (p, q)) in x.iter().zip(y).enumerate() {
                        walk(p, q, format!("{path}[{i}]"), out);
                    }
                }
                _ if a != b => {
                    let s = |v: &serde_json::Value| v.to_string().chars().take(120).collect::<String>();
                    out.push(format!("{path}: {} vs {}", s(a), s(b)));
                }
                _ => {}
            }
        }
        let mut out = Vec::new();
        walk(a, b, String::new(), &mut out);
        out
    }

    fn assert_same(a: &GameSession, b: &GameSession, what: &str) {
        let d = differences(&world_json(a), &world_json(b));
        assert!(d.is_empty(), "{what}:\n{}", d.join("\n"));
    }

    fn cmd(json: &str) -> Command {
        serde_json::from_str(json).unwrap()
    }

    /// The recorded games of the conformance suite (server/conformance/replays/*/save.json).
    fn replays() -> Vec<(String, crate::SaveFile)> {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../conformance/replays");
        let mut out = Vec::new();
        for entry in std::fs::read_dir(&dir).expect("conformance replays") {
            let path = entry.unwrap().path().join("save.json");
            if let Ok(text) = std::fs::read_to_string(&path) {
                let file = crate::SaveFile::parse(serde_json::from_str(&text).unwrap()).unwrap();
                out.push((path.parent().unwrap().file_name().unwrap().to_string_lossy().into_owned(), file));
            }
        }
        out.sort_by(|a, b| a.0.cmp(&b.0));
        assert!(out.len() >= 5, "replays found in {}", dir.display());
        out
    }

    /// Plays a recorded game from its start in chunks of `chunk` steps (like the server's ticks),
    /// calling `each` after every chunk.
    fn play(s: &mut GameSession, file: &crate::SaveFile, chunk: u64, mut each: impl FnMut(&mut GameSession)) {
        s.start(&file.scenario_id, file.economy.clone(), file.tempos.first().map(|t| t.tempo)).unwrap();
        let (mut ti, mut ci) = (1usize, 0usize);
        while s.step_index() < file.step {
            let to = (s.step_index() + chunk).min(file.step);
            let t0 = ti;
            while ti < file.tempos.len() && file.tempos[ti].step <= to {
                ti += 1;
            }
            let c0 = ci;
            while ci < file.commands.len() && file.commands[ci].step <= to {
                ci += 1;
            }
            s.follow(to, &file.tempos[t0..ti], &file.commands[c0..ci]).unwrap();
            each(s);
        }
    }

    /// A checkpoint taken at any step continues exactly like the uninterrupted game.
    #[test]
    fn checkpoint_resumes_exactly() {
        for (name, file) in replays() {
            let mut original = session();
            let mut taken = Vec::new();
            let mut n = 0;
            // ~40 chunks, a checkpoint every 5th
            play(&mut original, &file, (file.step / 40).max(1), |s| {
                n += 1;
                if n % 5 == 0 {
                    taken.push(s.checkpoint());
                }
            });
            assert!(!taken.is_empty(), "{name}: steps {}", file.step);
            assert_eq!(original.commands().len(), file.commands.len(), "{name}");
            let target = original.step_index();
            for cp in taken {
                let at = cp.save.step;
                // what happened after the checkpoint, as the server log has it
                let rest = original.commands()[cp.save.commands.len()..].to_vec();
                let saved_tempos = cp.save.tempos.clone();
                let tempos: Vec<_> =
                    original.tempos().iter().enumerate().filter(|(i, t)| saved_tempos.get(*i) != Some(t)).map(|(_, t)| *t).collect();
                // through JSON, as stored
                let cp: Checkpoint = serde_json::from_str(&serde_json::to_string(&cp).unwrap()).unwrap();
                let mut copy = session();
                copy.restore(cp).unwrap();
                copy.follow(target, &tempos, &rest).unwrap();
                assert_same(&copy, &original, &format!("{name}: resumed at step {at}"));
                assert_eq!(copy.state_hash(), original.state_hash());
            }
        }
    }

    /// A follower fed by the cursor after every chunk of steps stays equal, also across a pause, tempo
    /// changes and a restart of the world; a wrong hash is detected.
    #[test]
    fn follower_stays_in_step_with_the_cursor() {
        let (name, file) = replays().into_iter().find(|(n, _)| n == "kanwa-pierwsza-sesja").expect("the canvas replay");
        let mut server = session();
        server.start("tau-ceti", None, None).unwrap();
        let mut cursor = SyncCursor::new(&server);
        let mut client = session();
        SyncMessage::reset(&server).apply(&mut client).unwrap();
        let mut messages = 0;
        let mut sync = |server: &GameSession, client: &mut GameSession, cursor: &mut SyncCursor| {
            if let Some(m) = cursor.diff(server) {
                messages += 1;
                // through JSON, as on the wire
                let wire = SyncMessage::from_json(&serde_json::to_string(&m).unwrap()).unwrap();
                wire.apply(client).unwrap();
            }
        };
        let mut i = 0;
        play(&mut server, &file, 3, |s| {
            i += 1;
            if i == 70 {
                s.pause();
            }
            if i == 71 {
                s.resume();
                let t = s.tempo();
                s.set_tempo(t * 2.0).unwrap();
                s.set_tempo(t).unwrap();
            }
            sync(s, &mut client, &mut cursor);
        });
        sync(&server, &mut client, &mut cursor);
        assert_same(&client, &server, &name);
        assert!(SyncMessage::hash(&server).apply(&mut client).is_ok());
        assert_eq!(client.commands(), server.commands());
        assert_eq!(client.tempos(), server.tempos());

        server.start("planeta-matka", None, None).unwrap();
        let reset = cursor.diff(&server).unwrap();
        assert!(matches!(reset, SyncMessage::Reset { .. }));
        reset.apply(&mut client).unwrap();
        assert_eq!(client.scenario_id(), "planeta-matka");
        assert!(cursor.diff(&server).is_none());

        server.step();
        let wrong = SyncMessage::Hash { step: server.step_index(), hash: "0".into() };
        cursor.diff(&server).unwrap().apply(&mut client).unwrap();
        assert!(wrong.apply(&mut client).is_err());
        assert!(messages > 10, "{messages} messages");
    }

    #[test]
    fn follow_refuses_gaps() {
        let mut s = session();
        s.step_many(10);
        assert!(s.follow(5, &[], &[]).is_err());
        let early = RecordedCommand { step: 3, command: cmd(r#"{"type":"SCAN_SYSTEM","shipId":"arka-1"}"#) };
        assert!(s.follow(20, &[], &[early]).is_err());
        assert!(s.follow(20, &[], &[]).is_ok());
        assert_eq!(s.step_index(), 20);
    }
}
