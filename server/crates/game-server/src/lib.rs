//! Network game server (plan 02 B4, B6): one authoritative world per player, run by `game-session`
//! (the same code as the client's WebAssembly worker), and the shared galaxy, behind a WebSocket.
//!
//! Connection (JSON text frames): the client's first frame is `{"type":"hello","protocolVersion":3,
//! "callsign","password"}`; the server answers `{"type":"welcome",…}` (or `{"type":"error",…}` and
//! closes), then `{"type":"reset","checkpoint"}`. The client keeps a replica of the world in
//! WebAssembly and answers the UI's queries itself; it sends requests that change the game
//! (`{"id","request"}` of `api/src/protocol.ts`) and gets `{"type":"sync"}` (commands, tempo changes,
//! steps) before the `{"type":"reply"}`, and `{"type":"hash"}` every 5 s; on a mismatch it sends
//! `{"type":"resync"}` and gets a new reset. No snapshots or frames travel: the replica makes them.
//!
//! The galaxy (B6): `{"id","galaxy":{"op":…}}` goes to the galaxy service (market, shipments) and
//! gets a reply the same way; `{"type":"galaxy","view"}` comes after every change of the market.
//! Worlds on the server have no simulated players or hubs of their own (R-7): the service has them.

#![forbid(unsafe_code)]

pub mod accounts;
pub mod config;
pub mod galaxy;
pub mod repo;
pub mod world;
pub mod ws;

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::AtomicU64;

use tokio::sync::{Mutex, mpsc};

pub use config::Config;

/// Version of the WebSocket protocol (hello / welcome); 2: the client keeps a replica; 3: the galaxy
/// service (requests and views), and worlds without their own galaxy.
pub const PROTOCOL_VERSION: u32 = 3;

pub struct AppState {
    pub cfg: Config,
    pub accounts: accounts::AccountStore,
    pub repo: Arc<repo::FileRepository>,
    pub persister: repo::Persister,
    pub worlds: Arc<Mutex<HashMap<String, mpsc::Sender<world::WorldMsg>>>>,
    pub galaxy: mpsc::UnboundedSender<galaxy::GalaxyMsg>,
    pub next_client: AtomicU64,
}

impl AppState {
    /// Opens the data dir and starts the galaxy service (inside a Tokio runtime).
    pub fn open(cfg: Config) -> std::io::Result<Arc<AppState>> {
        std::fs::create_dir_all(&cfg.data_dir)?;
        let accounts = accounts::AccountStore::open(cfg.data_dir.join("accounts.json"))?;
        let worlds_dir = repo::data_worlds_dir(&cfg.data_dir);
        let persister = repo::Persister::spawn(repo::FileRepository::new(&worlds_dir));
        let (galaxy, galaxy_rx) = mpsc::unbounded_channel();
        let state = Arc::new(AppState {
            cfg,
            accounts,
            repo: Arc::new(repo::FileRepository::new(&worlds_dir)),
            persister,
            worlds: Arc::new(Mutex::new(HashMap::new())),
            galaxy,
            next_client: AtomicU64::new(1),
        });
        galaxy::spawn(&state.cfg, &state, galaxy_rx);
        Ok(state)
    }

    /// The running world of an account, started (restored) when asleep.
    pub async fn world(&self, id: &str) -> tokio::sync::mpsc::Sender<world::WorldMsg> {
        let mut worlds = self.worlds.lock().await;
        if let Some(tx) = worlds.get(id)
            && !tx.is_closed()
        {
            return tx.clone();
        }
        let (tx, rx) = tokio::sync::mpsc::channel(256);
        let mut w = world::World::open(id, &self.cfg, self.repo.as_ref(), self.persister.clone());
        w.set_galaxy(self.galaxy.clone());
        println!("world {id}: running at step {}", w.host().session.step_index());
        tokio::spawn(w.run(rx, self.worlds.clone()));
        worlds.insert(id.to_string(), tx.clone());
        tx
    }

    /// Writes every running world and waits for the disk (shutdown).
    pub async fn shutdown(&self) {
        let worlds: Vec<_> = self.worlds.lock().await.drain().map(|(_, tx)| tx).collect();
        for tx in worlds {
            let (done, wait) = tokio::sync::oneshot::channel();
            if tx.send(world::WorldMsg::Stop { done }).await.is_ok() {
                let _ = wait.await;
            }
        }
        let (done, wait) = tokio::sync::oneshot::channel();
        if self.galaxy.send(galaxy::GalaxyMsg::Stop { done }).is_ok() {
            let _ = wait.await;
        }
        let p = self.persister.clone();
        let _ = tokio::task::spawn_blocking(move || p.flush()).await;
    }
}

pub fn router(state: Arc<AppState>) -> axum::Router {
    use axum::routing::get;
    axum::Router::new().route("/health", get(|| async { "ok" })).route("/ws", get(ws::upgrade)).with_state(state)
}

/// Serves until Ctrl-C, then writes the worlds.
pub async fn serve(cfg: Config) -> std::io::Result<()> {
    let state = AppState::open(cfg.clone())?;
    let listener = tokio::net::TcpListener::bind(cfg.addr).await?;
    println!(
        "game-server (protocol {PROTOCOL_VERSION}) on {} · data {} · {} · step {} s",
        listener.local_addr()?,
        cfg.data_dir.display(),
        if cfg.dev_mode { "DEV_MODE" } else { "production" },
        cfg.step_seconds
    );
    let shutdown_state = state.clone();
    axum::serve(listener, router(state))
        .with_graceful_shutdown(async move {
            let _ = tokio::signal::ctrl_c().await;
            println!("shutting down: writing worlds");
            shutdown_state.shutdown().await;
        })
        .await
}
