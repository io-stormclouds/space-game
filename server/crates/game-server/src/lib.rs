//! Network game server (plan 02 B4): one authoritative world per player, run by `game-session` (the
//! same code as the client's WebAssembly worker), behind a WebSocket that speaks the `GameApi`
//! message protocol of the mock (`api/src/protocol.ts`).
//!
//! Connection: the client's first text frame is `{"type":"hello","protocolVersion":1,"callsign",
//! "password"}`; the server answers `{"type":"welcome",…}` (or `{"type":"error",…}` and closes),
//! then requests `{"id","request"}` and messages `{"type":"reply"|"snapshot"|"events"|"frame",…}`
//! flow as JSON text frames. MessagePack frames (R-3 A) are the next step; the messages stay.

#![forbid(unsafe_code)]

pub mod accounts;
pub mod config;
pub mod repo;
pub mod world;
pub mod ws;

use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::AtomicU64;

use tokio::sync::Mutex;

pub use config::Config;

/// Version of the WebSocket protocol (hello / welcome); the client refuses another.
pub const PROTOCOL_VERSION: u32 = 1;

pub struct AppState {
    pub cfg: Config,
    pub accounts: accounts::AccountStore,
    pub repo: Arc<repo::FileRepository>,
    pub persister: repo::Persister,
    pub worlds: Arc<Mutex<HashMap<String, tokio::sync::mpsc::Sender<world::WorldMsg>>>>,
    pub next_client: AtomicU64,
}

impl AppState {
    pub fn open(cfg: Config) -> std::io::Result<Arc<AppState>> {
        std::fs::create_dir_all(&cfg.data_dir)?;
        let accounts = accounts::AccountStore::open(cfg.data_dir.join("accounts.json"))?;
        let worlds_dir = repo::data_worlds_dir(&cfg.data_dir);
        let persister = repo::Persister::spawn(repo::FileRepository::new(&worlds_dir));
        Ok(Arc::new(AppState {
            cfg,
            accounts,
            repo: Arc::new(repo::FileRepository::new(&worlds_dir)),
            persister,
            worlds: Arc::new(Mutex::new(HashMap::new())),
            next_client: AtomicU64::new(1),
        }))
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
        let w = world::World::open(id, &self.cfg, self.repo.as_ref(), self.persister.clone());
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
        "game-server on {} · data {} · {} · step {} s",
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
