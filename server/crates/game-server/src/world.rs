//! World scheduler (plan 02 §3, §4): one task per player's world. A world runs while someone is
//! connected (and `idle_seconds` after), then it is written to the repository and stopped; the next
//! connection restores it from the snapshot and the command log and catches up the time it slept
//! (1 model minute per step, up to the offline limit; the tempo change goes into the schedule, so
//! the replay stays exact).

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::{Mutex, mpsc, oneshot};

use game_session::{GameSession, Host, HostOptions, Outgoing, RequestMessage, SessionOptions};

use crate::config::Config;
use crate::repo::{LogEntry, Persister, RepoOp, StoredWorld, WorldRepository, combine};

pub type ClientId = u64;

/// A message for one client (JSON text of an `Outgoing` or of a server message).
pub type Wire = Arc<str>;

pub enum WorldMsg {
    Attach {
        client: ClientId,
        tx: mpsc::UnboundedSender<Wire>,
        done: oneshot::Sender<()>,
    },
    Detach {
        client: ClientId,
    },
    Request {
        client: ClientId,
        json: String,
    },
    /// Write the world now and stop (shutdown).
    Stop {
        done: oneshot::Sender<()>,
    },
}

/// Requests a production world refuses: they bend time or replace the world (dev mode only).
const DEV_ONLY: [&str; 6] = ["setTempo", "pause", "resume", "stepOnce", "load", "replay"];

pub fn wall_ms() -> f64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs_f64() * 1000.0).unwrap_or(0.0)
}

fn mono_ms() -> f64 {
    static START: std::sync::OnceLock<std::time::Instant> = std::sync::OnceLock::new();
    START.get_or_init(std::time::Instant::now).elapsed().as_secs_f64() * 1000.0
}

fn session_options(cfg: &Config) -> SessionOptions {
    SessionOptions {
        step_seconds: cfg.step_seconds,
        clock: mono_ms,
        // production runs at ×1 (R-4); dev starts at ×60 as the mock
        start_tempo: if cfg.dev_mode { 60.0 } else { 1.0 },
        ..SessionOptions::default()
    }
}

/// Restores a world: the scenario replayed with every logged command and tempo change (exact by
/// construction). Falls back to the snapshot's world when the replay fails.
pub fn restore(cfg: &Config, stored: &StoredWorld, log: &[LogEntry]) -> Host {
    let mut host = Host::new(HostOptions { session: session_options(cfg), ..HostOptions::default() });
    let save = combine(stored, log);
    if let Err(e) = host.session.replay(save) {
        eprintln!("restore by replay failed ({e}); continuing from the snapshot");
        let _ = host.session.load(stored.save.clone());
    }
    host
}

/// Steps a sleeping world through `real_seconds` (production): whole model minutes at tempo 60, the
/// rest at ×1. Returns the steps run.
pub fn catch_up(session: &mut GameSession, real_seconds: f64, limit_hours: f64) -> u64 {
    let steps = (real_seconds.min(limit_hours * 3600.0) / session.step_seconds).floor().max(0.0) as u64;
    if steps == 0 {
        return 0;
    }
    let base = session.tempo();
    let fast = steps / 60;
    let rest = steps % 60;
    if fast > 0 {
        let _ = session.set_tempo(base * 60.0);
        session.step_many(fast);
        let _ = session.set_tempo(base);
    }
    session.step_many(rest);
    fast + rest
}

pub struct World {
    id: String,
    cfg: Config,
    host: Host,
    persister: Persister,
    clients: HashMap<ClientId, mpsc::UnboundedSender<Wire>>,
    logged_commands: usize,
    logged_tempos: Vec<game_session::TempoChange>,
    last_snapshot_ms: f64,
    idle_since_ms: Option<f64>,
}

impl World {
    /// Loads the world from the repository (or starts the default scenario) and catches up.
    pub fn open(id: &str, cfg: &Config, repo: &dyn WorldRepository, persister: Persister) -> World {
        let (host, fresh) = match repo.load(id) {
            Ok(Some((stored, log))) => {
                let mut host = restore(cfg, &stored, &log);
                if !cfg.dev_mode {
                    let slept = (wall_ms() - stored.saved_at_ms) / 1000.0
                        - (host.session.step_index().saturating_sub(stored.save.step)) as f64 * cfg.step_seconds;
                    let n = catch_up(&mut host.session, slept, cfg.offline_limit_hours);
                    if n > 0 {
                        println!("world {id}: caught up {n} steps after {:.0} s asleep", slept);
                    }
                }
                (host, false)
            }
            Ok(None) => (Host::new(HostOptions { session: session_options(cfg), ..HostOptions::default() }), true),
            Err(e) => {
                eprintln!("world {id}: cannot read ({e}); starting fresh");
                (Host::new(HostOptions { session: session_options(cfg), ..HostOptions::default() }), true)
            }
        };
        let mut w = World {
            id: id.to_string(),
            cfg: cfg.clone(),
            logged_commands: host.session.commands().len(),
            logged_tempos: host.session.tempos().to_vec(),
            host,
            persister,
            clients: HashMap::new(),
            last_snapshot_ms: mono_ms(),
            idle_since_ms: None,
        };
        if fresh || !cfg.dev_mode {
            w.snapshot();
        }
        w
    }

    pub fn host(&self) -> &Host {
        &self.host
    }

    fn snapshot(&mut self) {
        let stored = StoredWorld { saved_at_ms: wall_ms(), save: self.host.session.save() };
        self.persister.send(RepoOp::Snapshot { world: self.id.clone(), stored: Box::new(stored) });
        self.logged_commands = self.host.session.commands().len();
        self.logged_tempos = self.host.session.tempos().to_vec();
        self.last_snapshot_ms = mono_ms();
    }

    /// Commands and tempo changes since the last snapshot or append go to the log.
    fn log_changes(&mut self) {
        let s = &self.host.session;
        if s.commands().len() < self.logged_commands
            || s.tempos().len() < self.logged_tempos.len()
            || s.tempos().first() != self.logged_tempos.first()
        {
            // the world was replaced (start, load, replay): a new baseline
            self.snapshot();
            return;
        }
        for c in &s.commands()[self.logged_commands..] {
            self.persister
                .send(RepoOp::Append { world: self.id.clone(), entry: LogEntry::Command { step: c.step, command: c.command.clone() } });
        }
        self.logged_commands = s.commands().len();
        let tempos = s.tempos();
        let changed: Vec<_> = tempos.iter().enumerate().filter(|(i, t)| self.logged_tempos.get(*i) != Some(t)).map(|(_, t)| *t).collect();
        for t in changed {
            self.persister.send(RepoOp::Append { world: self.id.clone(), entry: LogEntry::Tempo { step: t.step, tempo: t.tempo } });
        }
        self.logged_tempos = tempos.to_vec();
    }

    fn broadcast(&self, out: &[Outgoing], requester: Option<ClientId>) {
        for m in out {
            let json: Wire = match serde_json::to_string(m) {
                Ok(j) => j.into(),
                Err(e) => {
                    eprintln!("world {}: cannot serialise a message: {e}", self.id);
                    continue;
                }
            };
            let is_reply = matches!(m, Outgoing::Reply(_));
            for (id, tx) in &self.clients {
                if !is_reply || Some(*id) == requester {
                    let _ = tx.send(json.clone());
                }
            }
        }
    }

    /// One request of a client; returns the outgoing messages (also used by tests without sockets).
    pub fn request(&mut self, json: &str) -> Vec<Outgoing> {
        let parsed: Option<RequestMessage> = serde_json::from_str(json).ok();
        let kind = serde_json::from_str::<serde_json::Value>(json)
            .ok()
            .and_then(|v| v.get("request").and_then(|r| r.get("kind")).and_then(|k| k.as_str()).map(String::from));
        if !self.cfg.dev_mode
            && let (Some(msg), Some(kind)) = (&parsed, &kind)
        {
            if DEV_ONLY.contains(&kind.as_str()) {
                return vec![Outgoing::err(msg.id, "niedostępne w świecie na serwerze (tylko tryb deweloperski)")];
            }
            // a production world is never restarted from the client: `start` attaches to it
            if kind == "start" && (self.host.session.step_index() > 0 || !self.host.session.commands().is_empty()) {
                return vec![Outgoing::ok(msg.id, game_session::ReplyValue::Snapshot(Box::new(self.host.session.snapshot())))];
            }
        }
        let out = self.host.handle_json(json, mono_ms());
        self.log_changes();
        out
    }

    pub async fn run(mut self, mut rx: mpsc::Receiver<WorldMsg>, registry: Arc<Mutex<HashMap<String, mpsc::Sender<WorldMsg>>>>) {
        let mut tick = tokio::time::interval(Duration::from_millis(self.cfg.tick_ms()));
        tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            tokio::select! {
                _ = tick.tick() => {
                    let now = mono_ms();
                    let out = self.host.tick(now);
                    if !self.clients.is_empty() {
                        self.broadcast(&out, None);
                    }
                    if now - self.last_snapshot_ms >= self.cfg.snapshot_seconds * 1000.0 {
                        self.snapshot();
                    }
                    if let Some(since) = self.idle_since_ms
                        && now - since >= self.cfg.idle_seconds * 1000.0
                    {
                        // remove first, so a new connection starts a fresh task from the saved state
                        let mut reg = registry.lock().await;
                        if self.clients.is_empty() && rx.is_empty() {
                            reg.remove(&self.id);
                            drop(reg);
                            self.snapshot();
                            println!("world {}: asleep at step {}", self.id, self.host.session.step_index());
                            return;
                        }
                    }
                }
                msg = rx.recv() => match msg {
                    None => { self.snapshot(); return; }
                    Some(WorldMsg::Attach { client, tx, done }) => {
                        self.clients.insert(client, tx);
                        self.idle_since_ms = None;
                        let snap = self.host.push_snapshot(mono_ms());
                        self.broadcast(&[snap], None);
                        let _ = done.send(());
                    }
                    Some(WorldMsg::Detach { client }) => {
                        self.clients.remove(&client);
                        if self.clients.is_empty() {
                            self.idle_since_ms = Some(mono_ms());
                            self.snapshot();
                        }
                    }
                    Some(WorldMsg::Request { client, json }) => {
                        let out = self.request(&json);
                        self.broadcast(&out, Some(client));
                    }
                    Some(WorldMsg::Stop { done }) => {
                        self.snapshot();
                        let _ = done.send(());
                        return;
                    }
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repo::FileRepository;

    fn cfg(dir: &std::path::Path, dev: bool) -> Config {
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

    fn tmp(name: &str) -> std::path::PathBuf {
        let d = std::env::temp_dir().join(format!("sg-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        d
    }

    fn req(id: u64, request: &str) -> String {
        format!(r#"{{"id":{id},"request":{request}}}"#)
    }

    /// The world restored from the repository equals the uninterrupted one: snapshot + log = replay.
    #[test]
    fn restored_world_is_the_replay_of_its_log() {
        let dir = tmp("restore");
        let c = cfg(&dir, true);
        let persister = Persister::spawn(FileRepository::new(&dir));
        let repo = FileRepository::new(&dir);
        let mut w = World::open("acc-1", &c, &repo, persister.clone());
        w.request(&req(1, r#"{"kind":"start","scenarioId":"tau-ceti"}"#));
        w.request(&req(2, r#"{"kind":"setTempo","tempo":600}"#));
        w.request(&req(3, r#"{"kind":"command","command":{"type":"SCAN_SYSTEM","shipId":"arka-1"}}"#));
        w.request(&req(4, r#"{"kind":"stepOnce","steps":500}"#));
        w.snapshot();
        w.request(&req(5, r#"{"kind":"command","command":{"type":"MOVE_SHIP","shipId":"nope","to":"x"}}"#));
        w.request(&req(6, r#"{"kind":"stepOnce","steps":800}"#));
        w.request(&req(7, r#"{"kind":"setTempo","tempo":60}"#));
        w.request(&req(8, r#"{"kind":"command","command":{"type":"CHOOSE_COLONY_SITE","bodyId":"tau-ceti-e"}}"#));
        persister.flush();

        let (stored, log) = repo.load("acc-1").unwrap().unwrap();
        assert_eq!(log.len(), 3, "two commands and a tempo change after the snapshot: {log:?}");
        let restored = restore(&c, &stored, &log);
        let a = serde_json::to_value(w.host().session.world()).unwrap();
        let b = serde_json::to_value(restored.session.world()).unwrap();
        assert_eq!(restored.session.step_index(), w.host().session.step_index());
        assert_eq!(a, b);
        assert_eq!(restored.session.commands().len(), 3);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn production_refuses_time_bending_and_keeps_the_world() {
        let dir = tmp("prod");
        let c = cfg(&dir, false);
        let persister = Persister::spawn(FileRepository::new(&dir));
        let repo = FileRepository::new(&dir);
        let mut w = World::open("acc-2", &c, &repo, persister.clone());
        let out = w.request(&req(1, r#"{"kind":"setTempo","tempo":600}"#));
        assert!(matches!(&out[0], Outgoing::Reply(game_session::Reply::Err { .. })));
        w.request(&req(2, r#"{"kind":"command","command":{"type":"SCAN_SYSTEM","shipId":"arka-1"}}"#));
        let before = w.host().session.commands().len();
        w.request(&req(3, r#"{"kind":"start","scenarioId":"planeta-matka"}"#));
        assert_eq!(w.host().session.commands().len(), before, "start attaches, does not reset");
        assert_eq!(w.host().session.scenario_id(), "tau-ceti");
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn catch_up_runs_model_minutes_and_records_the_tempo() {
        let mut s = GameSession::new(SessionOptions { step_seconds: 1.0, start_tempo: 1.0, ..SessionOptions::default() });
        let t0 = s.simulation().time();
        let n = catch_up(&mut s, 8.0 * 3600.0, 12.0);
        assert_eq!(n, 480);
        assert!((s.simulation().time() - t0 - 480.0).abs() < 1e-6, "8 h = 480 model minutes");
        assert_eq!(s.tempo(), 1.0);
        assert_eq!(s.tempos().len(), 2, "×60 from step 0 (same step: replaced), ×1 from step 480: {:?}", s.tempos());
        let capped = catch_up(&mut s, 100.0 * 3600.0, 12.0);
        assert_eq!(capped, 720);
    }
}
