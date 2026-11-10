//! Where the server keeps its state (plan 02 §7, R-26):
//! - files under `DATA_DIR` (the default, one node): `accounts.json`, `sessions.json`,
//!   `galaxy.json`, `worlds/<world>/{world.json, log.jsonl}`;
//! - PostgreSQL with `DATABASE_URL` (`postgres://user:pass@host/db`): tables `accounts`,
//!   `sessions`, `world_snapshots`, `world_log`, `galaxy_state` (`migrations/`, applied at start).
//!
//! The stores keep their data in memory as before and write through: an account or a session row
//! when it changes, a world's snapshot and log through the world I/O thread, the market through the
//! galaxy's writer thread. Those threads are plain threads, so they run the asynchronous client on
//! the server's runtime (`Handle::block_on`). JSON goes into `json` columns as written (floats
//! round-trip exactly). A lost connection stops the server (the supervisor, `restart:
//! unless-stopped` in deploy/, starts it again; worlds continue from their last log entry).

use std::collections::BTreeMap;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use tokio_postgres::{Client, NoTls};

use crate::accounts::{Account, write_atomic};
use crate::repo::{FileRepository, LogEntry, StoredWorld, WorldRepository, data_worlds_dir};
use crate::sessions::Session;

/// Migrations in order (version, SQL); each runs once, in a transaction.
const MIGRATIONS: &[(i32, &str)] = &[(1, include_str!("../migrations/0001_init.sql"))];

pub struct Pg {
    client: Client,
    rt: tokio::runtime::Handle,
}

fn other(e: impl std::fmt::Display) -> io::Error {
    io::Error::other(format!("postgres: {e}"))
}

impl Pg {
    /// From a plain thread (world I/O, galaxy writer): the query on the server's runtime.
    fn block<T>(&self, f: impl std::future::Future<Output = Result<T, tokio_postgres::Error>>) -> io::Result<T> {
        if tokio::runtime::Handle::try_current().is_ok() {
            return Err(io::Error::other("postgres: a blocking call on a runtime thread"));
        }
        self.rt.block_on(f).map_err(other)
    }
}

pub enum Storage {
    Files(PathBuf),
    Postgres(Arc<Pg>),
}

/// A change of the sessions.
pub enum SessionChange<'a> {
    Added { hash: &'a str, session: &'a Session },
    Removed { hash: &'a str },
}

async fn migrate(client: &Client) -> io::Result<()> {
    client
        .batch_execute(
            "CREATE TABLE IF NOT EXISTS schema_migrations (version integer PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
        )
        .await
        .map_err(other)?;
    for (version, sql) in MIGRATIONS {
        let done = client.query_opt("SELECT 1 FROM schema_migrations WHERE version = $1", &[version]).await.map_err(other)?.is_some();
        if !done {
            client
                .batch_execute(&format!("BEGIN;\n{sql}\nINSERT INTO schema_migrations (version) VALUES ({version});\nCOMMIT;"))
                .await
                .map_err(other)?;
            println!("postgres: migration {version} applied");
        }
    }
    Ok(())
}

impl Storage {
    /// Files in `data_dir`, or PostgreSQL at `database_url` (connected and migrated).
    pub async fn open(data_dir: &Path, database_url: Option<&str>) -> io::Result<Storage> {
        let Some(url) = database_url else { return Ok(Storage::Files(data_dir.to_path_buf())) };
        let (client, connection) = tokio_postgres::connect(url, NoTls).await.map_err(other)?;
        tokio::spawn(async move {
            if let Err(e) = connection.await {
                eprintln!("postgres: connection lost ({e}); stopping, the supervisor starts the server again");
                std::process::exit(1);
            }
        });
        migrate(&client).await?;
        Ok(Storage::Postgres(Arc::new(Pg { client, rt: tokio::runtime::Handle::current() })))
    }

    pub fn describe(&self) -> String {
        match self {
            Storage::Files(dir) => format!("files in {}", dir.display()),
            Storage::Postgres(_) => "PostgreSQL".to_string(),
        }
    }

    // ---- accounts ----

    /// Every account by its callsign key.
    pub async fn load_accounts(&self) -> io::Result<BTreeMap<String, Account>> {
        match self {
            Storage::Files(dir) => match std::fs::read_to_string(dir.join("accounts.json")) {
                Ok(text) => serde_json::from_str(&text).map_err(io::Error::other),
                Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(BTreeMap::new()),
                Err(e) => Err(e),
            },
            Storage::Postgres(pg) => {
                let rows = pg.client.query("SELECT callsign_key, account::text FROM accounts", &[]).await.map_err(other)?;
                rows.iter()
                    .map(|r| Ok((r.get::<_, String>(0), serde_json::from_str(r.get::<_, &str>(1)).map_err(io::Error::other)?)))
                    .collect()
            }
        }
    }

    /// A new account (`all` already holds it).
    pub async fn add_account(&self, all: &BTreeMap<String, Account>, key: &str, account: &Account) -> io::Result<()> {
        match self {
            Storage::Files(dir) => {
                std::fs::create_dir_all(dir)?;
                let text = serde_json::to_string_pretty(all).map_err(io::Error::other)?;
                write_atomic(&dir.join("accounts.json"), text.as_bytes())
            }
            Storage::Postgres(pg) => {
                let json = serde_json::to_string(account).map_err(io::Error::other)?;
                pg.client
                    .execute(
                        "INSERT INTO accounts (id, callsign_key, account) VALUES ($1, $2, $3::text::json)",
                        &[&account.id, &key, &json],
                    )
                    .await
                    .map_err(other)?;
                Ok(())
            }
        }
    }

    // ---- sessions ----

    /// Sessions by token hash (expired ones included; the store drops them).
    pub async fn load_sessions(&self) -> io::Result<BTreeMap<String, Session>> {
        match self {
            Storage::Files(dir) => {
                let path = dir.join("sessions.json");
                match std::fs::read_to_string(&path) {
                    Ok(text) => Ok(serde_json::from_str(&text).unwrap_or_else(|e| {
                        // sessions are not worth a server that does not start: everyone logs in again
                        eprintln!("sessions: unreadable {} ({e}), starting empty", path.display());
                        BTreeMap::new()
                    })),
                    Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(BTreeMap::new()),
                    Err(e) => Err(e),
                }
            }
            Storage::Postgres(pg) => {
                let rows = pg.client.query("SELECT token_hash, account_id, created, expires FROM sessions", &[]).await.map_err(other)?;
                Ok(rows
                    .iter()
                    .map(|r| {
                        let session = Session {
                            account: r.get(1),
                            created: r.get::<_, i64>(2).max(0) as u64,
                            expires: r.get::<_, i64>(3).max(0) as u64,
                        };
                        (r.get::<_, String>(0), session)
                    })
                    .collect())
            }
        }
    }

    /// Writes a change (`all` is the sessions after it; files are rewritten whole).
    pub async fn save_sessions(&self, all: &BTreeMap<String, Session>, change: SessionChange<'_>, now: u64) -> io::Result<()> {
        match self {
            Storage::Files(dir) => {
                std::fs::create_dir_all(dir)?;
                let text = serde_json::to_string_pretty(all).map_err(io::Error::other)?;
                write_atomic(&dir.join("sessions.json"), text.as_bytes())
            }
            Storage::Postgres(pg) => {
                match change {
                    SessionChange::Added { hash, session } => {
                        pg.client
                            .execute(
                                "INSERT INTO sessions (token_hash, account_id, created, expires) VALUES ($1, $2, $3, $4)",
                                &[&hash, &session.account, &(session.created as i64), &(session.expires as i64)],
                            )
                            .await
                            .map_err(other)?;
                        pg.client.execute("DELETE FROM sessions WHERE expires <= $1", &[&(now as i64)]).await.map_err(other)?;
                    }
                    SessionChange::Removed { hash } => {
                        pg.client.execute("DELETE FROM sessions WHERE token_hash = $1", &[&hash]).await.map_err(other)?;
                    }
                }
                Ok(())
            }
        }
    }

    // ---- the galaxy ----

    /// The market's saved state (JSON), if any.
    pub async fn load_galaxy(&self) -> io::Result<Option<String>> {
        match self {
            Storage::Files(dir) => match std::fs::read_to_string(dir.join("galaxy.json")) {
                Ok(text) => Ok(Some(text)),
                Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
                Err(e) => Err(e),
            },
            Storage::Postgres(pg) => {
                let row = pg.client.query_opt("SELECT state::text FROM galaxy_state WHERE id = 1", &[]).await.map_err(other)?;
                Ok(row.map(|r| r.get(0)))
            }
        }
    }

    /// Where the galaxy's writer thread puts the market.
    pub fn galaxy_sink(&self) -> GalaxySink {
        match self {
            Storage::Files(dir) => GalaxySink::File(dir.join("galaxy.json")),
            Storage::Postgres(pg) => GalaxySink::Postgres(pg.clone()),
        }
    }

    // ---- worlds ----

    /// A world's snapshot and log tail (from the runtime: the world is about to start).
    pub async fn load_world(&self, world: &str) -> io::Result<Option<(StoredWorld, Vec<LogEntry>)>> {
        match self {
            Storage::Files(dir) => FileRepository::new(data_worlds_dir(dir)).load(world),
            Storage::Postgres(pg) => {
                let Some(row) =
                    pg.client.query_opt("SELECT stored::text FROM world_snapshots WHERE world_id = $1", &[&world]).await.map_err(other)?
                else {
                    return Ok(None);
                };
                let stored: StoredWorld = serde_json::from_str(row.get::<_, &str>(0)).map_err(io::Error::other)?;
                let rows = pg
                    .client
                    .query("SELECT entry::text FROM world_log WHERE world_id = $1 ORDER BY seq", &[&world])
                    .await
                    .map_err(other)?;
                let mut log = Vec::with_capacity(rows.len());
                for r in &rows {
                    log.push(serde_json::from_str(r.get::<_, &str>(0)).map_err(io::Error::other)?);
                }
                Ok(Some((stored, log)))
            }
        }
    }

    /// The repository of the world I/O thread.
    pub fn world_repo(&self) -> Box<dyn WorldRepository> {
        match self {
            Storage::Files(dir) => Box::new(FileRepository::new(data_worlds_dir(dir))),
            Storage::Postgres(pg) => Box::new(PgWorlds { pg: pg.clone() }),
        }
    }
}

/// The market's place for the galaxy's writer thread.
pub enum GalaxySink {
    File(PathBuf),
    Postgres(Arc<Pg>),
}

impl GalaxySink {
    pub fn write(&self, json: &[u8]) -> io::Result<()> {
        match self {
            GalaxySink::File(path) => write_atomic(path, json),
            GalaxySink::Postgres(pg) => {
                let text = std::str::from_utf8(json).map_err(io::Error::other)?;
                pg.block(pg.client.execute(
                    "INSERT INTO galaxy_state (id, state) VALUES (1, $1::text::json) \
                     ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, saved_at = now()",
                    &[&text],
                ))?;
                Ok(())
            }
        }
    }

    pub fn describe(&self) -> String {
        match self {
            GalaxySink::File(path) => path.display().to_string(),
            GalaxySink::Postgres(_) => "PostgreSQL galaxy_state".to_string(),
        }
    }
}

/// Worlds in PostgreSQL, for the world I/O thread (a plain thread: blocking calls).
struct PgWorlds {
    pg: Arc<Pg>,
}

impl WorldRepository for PgWorlds {
    fn load(&self, world: &str) -> io::Result<Option<(StoredWorld, Vec<LogEntry>)>> {
        let storage = Storage::Postgres(self.pg.clone());
        if tokio::runtime::Handle::try_current().is_ok() {
            return Err(io::Error::other("postgres: load worlds with Storage::load_world on the runtime"));
        }
        self.pg.rt.block_on(storage.load_world(world))
    }

    /// The snapshot and the end of the log after it, in one statement (atomic).
    fn write_snapshot(&self, world: &str, stored: &StoredWorld) -> io::Result<()> {
        let json = serde_json::to_string(stored).map_err(io::Error::other)?;
        self.pg.block(self.pg.client.execute(
            "WITH cleared AS (DELETE FROM world_log WHERE world_id = $1) \
             INSERT INTO world_snapshots (world_id, saved_at_ms, stored) VALUES ($1, $2, $3::text::json) \
             ON CONFLICT (world_id) DO UPDATE SET saved_at_ms = EXCLUDED.saved_at_ms, stored = EXCLUDED.stored",
            &[&world, &stored.saved_at_ms, &json],
        ))?;
        Ok(())
    }

    fn append(&self, world: &str, entry: &LogEntry) -> io::Result<()> {
        let json = serde_json::to_string(entry).map_err(io::Error::other)?;
        self.pg.block(self.pg.client.execute("INSERT INTO world_log (world_id, entry) VALUES ($1, $2::text::json)", &[&world, &json]))?;
        Ok(())
    }
}
