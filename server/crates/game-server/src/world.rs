//! World scheduler (plan 02 §3, §4): one task per player's world. A world runs while someone is
//! connected (and `idle_seconds` after), then it is written to the repository and stopped; the next
//! connection restores it from the snapshot and the log tail and catches up the time it slept
//! (1 model minute per step, up to the offline limit; the tempo change goes into the schedule, so
//! the replay stays exact).
//!
//! Clients keep a replica of the world (plan 02 §6): on attach they get a checkpoint, then only
//! what changed — commands and tempo changes at their steps, how far the steps went — and a state
//! hash every few seconds. Replies go to the client that asked, after the changes they caused.

use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use tokio::sync::{Mutex, mpsc, oneshot};

use game_core::models::command::Command;
use game_core::models::event::DomainEvent;
use game_core::models::resource::Qty;
use game_core::sim::systems::hub;
use game_session::exchange::{DEFAULT_HOME_STAR, is_hub};
use game_session::{
    Checkpoint, GameSession, Host, HostOptions, Outgoing, RecordedCommand, Reply, ReplyValue, Request, RequestMessage, SessionOptions,
    SyncCursor, SyncMessage, TempoChange,
};

use crate::config::Config;
use crate::galaxy::GalaxyMsg;
use crate::repo::{LogEntry, Persister, RepoOp, StoredWorld, WorldRepository, combine};

pub type ClientId = u64;

/// A message for one client (JSON text).
pub type Wire = Arc<str>;

/// How often clients get the state hash to compare with their replica [s].
const HASH_SECONDS: f64 = 5.0;

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
    /// The client's replica no longer matches: send it a checkpoint.
    Resync {
        client: ClientId,
    },
    /// A shipment from a hub arrived (the galaxy service): `done` says whether the world took it.
    Deliver {
        shipment_id: String,
        body_id: String,
        cargo: Qty,
        done: oneshot::Sender<bool>,
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
        // the galaxy service has the players and the hubs (R-7), not each world
        galaxy: None,
        ..SessionOptions::default()
    }
}

fn new_host(cfg: &Config) -> Host {
    Host::new(HostOptions { session: session_options(cfg), trade: true, ..HostOptions::default() })
}

/// What the log adds after the snapshot: tempo changes, commands, and the last step they reach.
fn tail(stored: &StoredWorld, log: &[LogEntry]) -> (Vec<TempoChange>, Vec<RecordedCommand>, u64) {
    let (mut tempos, mut commands, mut step) = (Vec::new(), Vec::new(), stored.save.step);
    for e in log {
        match e {
            LogEntry::Command { step: s, command } => {
                commands.push(RecordedCommand { step: *s, command: command.clone() });
                step = step.max(*s);
            }
            LogEntry::Tempo { step: s, tempo } => {
                tempos.push(TempoChange { step: *s, tempo: *tempo });
                step = step.max(*s);
            }
        }
    }
    (tempos, commands, step)
}

/// Restores a world: the snapshot's checkpoint followed by the log tail (the cost does not grow with
/// the world's age). Snapshots without the step state (older files) and failures fall back to the
/// replay of the whole log from the scenario's start, then to the snapshot's world alone.
pub fn restore(cfg: &Config, stored: &StoredWorld, log: &[LogEntry]) -> Host {
    if let Some(sim) = &stored.sim {
        let mut host = new_host(cfg);
        let (tempos, commands, step) = tail(stored, log);
        let cp = Checkpoint { save: stored.save.clone(), sim: sim.clone() };
        match host.session.restore(cp).and_then(|_| host.session.follow(step, &tempos, &commands)) {
            Ok(_) => return host,
            Err(e) => eprintln!("restore from the snapshot failed ({e}); replaying from the start"),
        }
    }
    let mut host = new_host(cfg);
    if let Err(e) = host.session.replay(combine(stored, log)) {
        eprintln!("restore by replay failed ({e}); continuing from the snapshot's world");
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

fn wire(id: &str, m: &impl serde::Serialize) -> Option<Wire> {
    match serde_json::to_string(m) {
        Ok(j) => Some(j.into()),
        Err(e) => {
            eprintln!("world {id}: cannot serialise a message: {e}");
            None
        }
    }
}

pub struct World {
    id: String,
    cfg: Config,
    host: Host,
    persister: Persister,
    clients: HashMap<ClientId, mpsc::UnboundedSender<Wire>>,
    cursor: SyncCursor,
    logged_generation: u64,
    logged_commands: usize,
    logged_tempos: Vec<TempoChange>,
    last_snapshot_ms: f64,
    last_hash_ms: f64,
    idle_since_ms: Option<f64>,
    galaxy: Option<mpsc::UnboundedSender<GalaxyMsg>>,
}

impl World {
    /// Loads the world from the repository (or starts the default scenario) and catches up.
    pub fn open(id: &str, cfg: &Config, repo: &dyn WorldRepository, persister: Persister) -> World {
        let (mut host, fresh) = match repo.load(id) {
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
            Ok(None) => (new_host(cfg), true),
            Err(e) => {
                eprintln!("world {id}: cannot read ({e}); starting fresh");
                (new_host(cfg), true)
            }
        };
        // a data dir from another mode (dev ↔ production): continue at this server's step length
        let resized = host.session.step_seconds != cfg.step_seconds;
        host.session.step_seconds = cfg.step_seconds;
        let mut w = World {
            id: id.to_string(),
            cfg: cfg.clone(),
            cursor: SyncCursor::new(&host.session),
            logged_generation: host.session.generation(),
            logged_commands: host.session.commands().len(),
            logged_tempos: host.session.tempos().to_vec(),
            host,
            persister,
            clients: HashMap::new(),
            last_snapshot_ms: mono_ms(),
            last_hash_ms: mono_ms(),
            // no client yet (a world woken for a delivery goes back to sleep on its own)
            idle_since_ms: Some(mono_ms()),
            galaxy: None,
        };
        if fresh || resized || !cfg.dev_mode {
            w.snapshot();
        }
        w
    }

    pub fn host(&self) -> &Host {
        &self.host
    }

    fn home_star(&self) -> String {
        hub::home_star(self.host.session.world()).unwrap_or(DEFAULT_HOME_STAR).to_string()
    }

    /// Connects the world to the galaxy service, telling it where the colony is.
    pub fn set_galaxy(&mut self, galaxy: mpsc::UnboundedSender<GalaxyMsg>) {
        let _ = galaxy.send(GalaxyMsg::Home { account: self.id.clone(), star: self.home_star() });
        self.galaxy = Some(galaxy);
    }

    /// A shipment from a hub: the `HUB_DELIVERY` command goes into the log once per shipment (a
    /// shipment already in the log is taken again without a second command). False when it cannot
    /// land (no such body): the galaxy gives the goods back to the hub.
    pub fn deliver(&mut self, shipment_id: &str, body_id: &str, cargo: &Qty) -> bool {
        let s = &mut self.host.session;
        let taken = s.commands().iter().any(|c| matches!(&c.command, Command::HubDelivery { shipment_id: id, .. } if id == shipment_id));
        if taken {
            return true;
        }
        if !hub::can_deliver(s.world(), body_id, cargo) {
            return false;
        }
        let cmd = Command::HubDelivery { shipment_id: shipment_id.to_string(), body_id: body_id.to_string(), cargo: cargo.clone() };
        let ok = s.command(cmd).ok;
        self.log_changes();
        ok
    }

    /// Cargo sent to hubs by a command's events goes to the galaxy service.
    fn report_departures(&self, reply: &Outgoing) {
        let (Some(galaxy), Outgoing::Reply(Reply::Ok { value: ReplyValue::Command(result), .. })) = (&self.galaxy, reply) else { return };
        for e in &result.events {
            if let DomainEvent::ShipmentDeparted { shipment_id, body_id, hub_id, cargo } = e {
                let _ = galaxy.send(GalaxyMsg::Departed {
                    account: self.id.clone(),
                    shipment_id: shipment_id.clone(),
                    body_id: body_id.clone(),
                    hub_id: hub_id.clone(),
                    cargo: cargo.clone(),
                });
            }
        }
    }

    fn snapshot(&mut self) {
        let cp = self.host.session.checkpoint();
        let stored = StoredWorld { saved_at_ms: wall_ms(), save: cp.save, sim: Some(cp.sim) };
        self.persister.send(RepoOp::Snapshot { world: self.id.clone(), stored: Box::new(stored) });
        self.logged_generation = self.host.session.generation();
        self.logged_commands = self.host.session.commands().len();
        self.logged_tempos = self.host.session.tempos().to_vec();
        self.last_snapshot_ms = mono_ms();
    }

    /// Commands and tempo changes since the last snapshot or append go to the log.
    fn log_changes(&mut self) {
        let s = &self.host.session;
        if s.generation() != self.logged_generation {
            // the world was replaced (start, load, replay): a new baseline, maybe at another star
            self.snapshot();
            if let Some(g) = &self.galaxy {
                let _ = g.send(GalaxyMsg::Home { account: self.id.clone(), star: self.home_star() });
            }
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

    /// What changed since the last call, for every replica (also with no client, to keep the cursor current).
    pub fn sync(&mut self) -> Option<SyncMessage> {
        self.cursor.diff(&self.host.session)
    }

    fn send_all(&self, m: &impl serde::Serialize) {
        if self.clients.is_empty() {
            return;
        }
        if let Some(json) = wire(&self.id, m) {
            for tx in self.clients.values() {
                let _ = tx.send(json.clone());
            }
        }
    }

    fn send_to(&self, client: ClientId, m: &impl serde::Serialize) {
        if let (Some(tx), Some(json)) = (self.clients.get(&client), wire(&self.id, m)) {
            let _ = tx.send(json);
        }
    }

    /// One request of a client; returns its reply (also used by tests without sockets). The changes
    /// it made are in the next [`World::sync`].
    pub fn request(&mut self, json: &str) -> Outgoing {
        let msg: RequestMessage = match serde_json::from_str(json) {
            Ok(m) => m,
            Err(e) => {
                let id = serde_json::from_str::<serde_json::Value>(json).ok().and_then(|v| v.get("id")?.as_u64()).unwrap_or(0);
                return Outgoing::err(id, format!("bad request: {e}"));
            }
        };
        if !self.cfg.dev_mode {
            let kind = serde_json::from_str::<serde_json::Value>(json)
                .ok()
                .and_then(|v| v.get("request")?.get("kind")?.as_str().map(String::from))
                .unwrap_or_default();
            if DEV_ONLY.contains(&kind.as_str()) {
                return Outgoing::err(msg.id, "niedostępne w świecie na serwerze (tylko tryb deweloperski)");
            }
            // a production world is never restarted from the client: `start` attaches to it
            if kind == "start" && (self.host.session.step_index() > 0 || !self.host.session.commands().is_empty()) {
                return Outgoing::ok(msg.id, game_session::ReplyValue::Snapshot(Box::new(self.host.session.snapshot())));
            }
        }
        if let Request::Command { command } = &msg.request {
            if command.is_system() {
                return Outgoing::err(msg.id, "rozkaz systemowy: wydaje go tylko serwer");
            }
            if let Command::ShipToHub { hub_id, .. } = command
                && !is_hub(hub_id)
            {
                return Outgoing::err(msg.id, format!("nieznany hub {hub_id}"));
            }
        }
        let reply = self.host.answer(msg);
        self.log_changes();
        self.report_departures(&reply);
        reply
    }

    pub async fn run(mut self, mut rx: mpsc::Receiver<WorldMsg>, registry: Arc<Mutex<HashMap<String, mpsc::Sender<WorldMsg>>>>) {
        let mut tick = tokio::time::interval(Duration::from_millis(self.cfg.tick_ms()));
        tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            tokio::select! {
                _ = tick.tick() => {
                    let now = mono_ms();
                    self.host.advance(now);
                    if let Some(m) = self.sync() {
                        self.send_all(&m);
                    }
                    if !self.clients.is_empty() && now - self.last_hash_ms >= HASH_SECONDS * 1000.0 {
                        self.last_hash_ms = now;
                        self.send_all(&SyncMessage::hash(&self.host.session));
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
                        // the cursor is current (synced after every tick and request): the checkpoint is its baseline
                        self.clients.insert(client, tx);
                        self.idle_since_ms = None;
                        self.send_to(client, &SyncMessage::reset(&self.host.session));
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
                        let reply = self.request(&json);
                        if let Some(m) = self.sync() {
                            self.send_all(&m);
                        }
                        self.send_to(client, &reply);
                    }
                    Some(WorldMsg::Resync { client }) => {
                        println!("world {}: client {client} resyncs at step {}", self.id, self.host.session.step_index());
                        self.send_to(client, &SyncMessage::reset(&self.host.session));
                    }
                    Some(WorldMsg::Deliver { shipment_id, body_id, cargo, done }) => {
                        let taken = self.deliver(&shipment_id, &body_id, &cargo);
                        if let Some(m) = self.sync() {
                            self.send_all(&m);
                        }
                        let _ = done.send(taken);
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
            max_requests_per_second: 20.0,
            market: game_session::exchange::MarketConfig::default(),
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

    fn world_of(h: &Host) -> serde_json::Value {
        serde_json::to_value((h.session.world(), h.session.simulation().export_state(), h.session.step_index(), h.session.tempo())).unwrap()
    }

    /// The world restored from the repository equals the uninterrupted one: snapshot + log tail =
    /// the live world; an old snapshot without the step state restores by the full replay.
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
        w.request(&req(8, r#"{"kind":"command","command":{"type":"CHOOSE_COLONY_SITE","bodyId":"tc-e"}}"#));
        persister.flush();

        let (stored, log) = repo.load("acc-1").unwrap().unwrap();
        assert!(stored.sim.is_some());
        assert_eq!(log.len(), 3, "two commands and a tempo change after the snapshot: {log:?}");
        let restored = restore(&c, &stored, &log);
        assert_eq!(restored.session.step_index(), w.host().session.step_index());
        assert_eq!(world_of(&restored), world_of(w.host()));
        assert_eq!(restored.session.commands().len(), 3);
        assert_eq!(restored.session.state_hash(), w.host().session.state_hash());

        let old = StoredWorld { sim: None, ..stored };
        let replayed = restore(&c, &old, &log);
        assert_eq!(world_of(&replayed), world_of(w.host()));
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
        assert!(matches!(&out, Outgoing::Reply(game_session::Reply::Err { .. })));
        w.request(&req(2, r#"{"kind":"command","command":{"type":"SCAN_SYSTEM","shipId":"arka-1"}}"#));
        let before = w.host().session.commands().len();
        w.request(&req(3, r#"{"kind":"start","scenarioId":"planeta-matka"}"#));
        assert_eq!(w.host().session.commands().len(), before, "start attaches, does not reset");
        assert_eq!(w.host().session.scenario_id(), "tau-ceti");
        let _ = std::fs::remove_dir_all(dir);
    }

    /// A replica fed with the world's reset and sync messages (as JSON) stays equal to it.
    #[test]
    fn replica_follows_the_world() {
        let dir = tmp("replica");
        let c = cfg(&dir, true);
        let persister = Persister::spawn(FileRepository::new(&dir));
        let mut w = World::open("acc-3", &c, &FileRepository::new(&dir), persister);
        let mut replica = Host::new(HostOptions::default());
        let feed = |m: SyncMessage, r: &mut Host| {
            let m = SyncMessage::from_json(&serde_json::to_string(&m).unwrap()).unwrap();
            r.apply_sync(m).unwrap()
        };
        feed(SyncMessage::reset(&w.host().session), &mut replica);
        w.request(&req(1, r#"{"kind":"start","scenarioId":"tau-ceti"}"#));
        feed(w.sync().expect("start replaces the world"), &mut replica);
        w.request(&req(2, r#"{"kind":"setTempo","tempo":600}"#));
        w.request(&req(3, r#"{"kind":"command","command":{"type":"SCAN_SYSTEM","shipId":"arka-1"}}"#));
        let out = feed(w.sync().unwrap(), &mut replica);
        assert!(matches!(&out[0], Outgoing::Events { .. }), "the scan's events come from the replica");
        for t in 0..300 {
            w.host.advance(t as f64 * 16.0);
            if let Some(m) = w.sync() {
                feed(m, &mut replica);
            }
        }
        assert!(w.host().session.step_index() > 200);
        assert_eq!(world_of(&replica), world_of(w.host()));
        feed(SyncMessage::hash(&w.host().session), &mut replica);
        assert!(w.sync().is_none());
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

    /// The bridge to the galaxy: the world reports its star and its departures, takes a delivery
    /// once (a repeated one is not logged again), refuses one that cannot land, and the replica
    /// (with its own galaxy switched on) follows the server's world without one.
    #[test]
    fn trade_crosses_into_the_galaxy_and_back_once() {
        let dir = tmp("trade");
        let c = cfg(&dir, true);
        let persister = Persister::spawn(FileRepository::new(&dir));
        let mut w = World::open("acc-5", &c, &FileRepository::new(&dir), persister);
        let (tx, mut rx) = mpsc::unbounded_channel();
        w.set_galaxy(tx);
        assert!(matches!(rx.try_recv(), Ok(GalaxyMsg::Home { star, .. }) if star == "Tau Ceti"));
        let mut replica = Host::new(HostOptions::default());
        let feed =
            |m: SyncMessage, r: &mut Host| r.apply_sync(SyncMessage::from_json(&serde_json::to_string(&m).unwrap()).unwrap()).unwrap();
        w.request(&req(1, r#"{"kind":"start","scenarioId":"planeta-matka"}"#));
        feed(SyncMessage::reset(&w.host().session), &mut replica);
        while rx.try_recv().is_ok() {}

        let world = w.host().session.world();
        let body = world.structures.iter().find(|s| s.kind == "HQ" && s.is_working()).unwrap().body_id.clone();
        let (mat, _) = world.storage_of(&body).into_iter().find(|(_, q)| *q >= 5.0).unwrap();
        let ship =
            format!(r#"{{"kind":"command","command":{{"type":"SHIP_TO_HUB","bodyId":"{body}","hubId":"hub-sol","cargo":{{"{mat}":5}}}}}}"#);
        w.request(&req(2, &ship));
        assert!(matches!(rx.try_recv(), Ok(GalaxyMsg::Departed { hub_id, cargo, .. }) if hub_id == "hub-sol" && cargo[&mat] == 5.0));

        let cargo: Qty = [("FER".to_string(), 7.0)].into_iter().collect();
        assert!(w.deliver("acc-5:freight-1", &body, &cargo));
        assert!(w.deliver("acc-5:freight-1", &body, &cargo), "taken again: no second command");
        assert!(!w.deliver("acc-5:freight-2", "nowhere", &cargo));
        let logged = w.host().session.commands().iter().filter(|c| matches!(c.command, Command::HubDelivery { .. })).count();
        assert_eq!(logged, 1);
        feed(w.sync().unwrap(), &mut replica);
        assert_eq!(world_of(&replica), world_of(w.host()));
        assert_eq!(replica.session.state_hash(), w.host().session.state_hash());
        assert!(replica.session.snapshot().players.is_empty(), "no galaxy of its own, as the server's world");
        let _ = std::fs::remove_dir_all(dir);
    }
}
