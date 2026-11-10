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
pub mod http;
pub mod metrics;
pub mod repo;
pub mod sessions;
pub mod storage;
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
    pub sessions: sessions::SessionStore,
    /// Files under `DATA_DIR` or PostgreSQL (`DATABASE_URL`, R-26).
    pub storage: Arc<storage::Storage>,
    pub persister: repo::Persister,
    pub worlds: Arc<Mutex<HashMap<String, mpsc::Sender<world::WorldMsg>>>>,
    pub galaxy: mpsc::UnboundedSender<galaxy::GalaxyMsg>,
    pub next_client: AtomicU64,
    pub started: std::time::Instant,
}

impl AppState {
    /// Opens the storage (the data dir, or PostgreSQL: connected and migrated), loads accounts,
    /// sessions and the market, and starts the galaxy service (inside a Tokio runtime).
    pub async fn open(cfg: Config) -> std::io::Result<Arc<AppState>> {
        std::fs::create_dir_all(&cfg.data_dir)?;
        let storage = Arc::new(storage::Storage::open(&cfg.data_dir, cfg.database_url.as_deref()).await?);
        let accounts = accounts::AccountStore::open(storage.clone()).await?;
        let sessions = sessions::SessionStore::open(storage.clone(), cfg.auth.session_seconds, cfg.auth.signups_per_minute).await?;
        let persister = repo::Persister::spawn(storage.world_repo());
        let saved_galaxy = storage.load_galaxy().await?;
        let galaxy_sink = storage.galaxy_sink();
        let (galaxy, galaxy_rx) = mpsc::unbounded_channel();
        let state = Arc::new(AppState {
            cfg,
            accounts,
            sessions,
            storage,
            persister,
            worlds: Arc::new(Mutex::new(HashMap::new())),
            galaxy,
            next_client: AtomicU64::new(1),
            started: std::time::Instant::now(),
        });
        galaxy::spawn(&state.cfg, &state, galaxy_rx, saved_galaxy.as_deref(), galaxy_sink);
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
        let loaded = self.storage.load_world(id).await;
        let mut w = world::World::from_loaded(id, &self.cfg, loaded, self.persister.clone());
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
    use axum::routing::{get, post};
    axum::Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/ws", get(ws::upgrade))
        .route("/api/register", post(http::register))
        .route("/api/login", post(http::login))
        .route("/api/guest", post(http::guest))
        .route("/api/logout", post(http::logout))
        .route("/api/session", get(http::session))
        .route("/api/ticket", post(http::ticket))
        .route("/metrics", get(http::metrics))
        .with_state(state)
}

/// Serves until Ctrl-C, then writes the worlds.
pub async fn serve(cfg: Config) -> std::io::Result<()> {
    let state = AppState::open(cfg.clone()).await?;
    let listener = tokio::net::TcpListener::bind(cfg.addr).await?;
    println!(
        "game-server (protocol {PROTOCOL_VERSION}) on {} · data: {} · {} · step {} s",
        listener.local_addr()?,
        state.storage.describe(),
        if cfg.dev_mode { "DEV_MODE" } else { "production" },
        cfg.step_seconds
    );
    let shutdown_state = state.clone();
    axum::serve(listener, router(state))
        .with_graceful_shutdown(async move {
            stop_signal().await;
            println!("shutting down: writing worlds");
            shutdown_state.shutdown().await;
        })
        .await
}

/// Ctrl-C, or SIGTERM (`docker stop`, systemd): both end the server gracefully.
async fn stop_signal() {
    #[cfg(unix)]
    {
        let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()).expect("SIGTERM handler");
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {}
            _ = term.recv() => {}
        }
    }
    #[cfg(not(unix))]
    {
        let _ = tokio::signal::ctrl_c().await;
    }
}
