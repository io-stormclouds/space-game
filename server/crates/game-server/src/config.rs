//! Configuration from the environment (plan 02 §9).

use std::net::SocketAddr;
use std::path::PathBuf;

use game_session::exchange::{CorpConfig, MarketConfig, NpcConfig};

#[derive(Clone, Debug)]
pub struct Config {
    /// `ADDR` (default 127.0.0.1:8080; 0.0.0.0:8080 in the container).
    pub addr: SocketAddr,
    /// `DATA_DIR`: accounts, worlds and the galaxy (default ./data).
    pub data_dir: PathBuf,
    /// `DATABASE_URL` (`postgres://user:password@host:port/db`): accounts, sessions, worlds and
    /// the market in PostgreSQL instead of files (R-26); `DATA_DIR` then keeps only what cannot be
    /// read back (a broken market's copy).
    pub database_url: Option<String>,
    /// `DEV_MODE=true`: test tempos, pause, step, load/replay, scenario restarts, and accounts made on
    /// first login (the mock's behaviour, for the designer panel and the e2e tests).
    pub dev_mode: bool,
    /// `WORLD_STEP_SECONDS`: real seconds per fixed step (production 1, R-4; dev default 1/60 as the mock).
    pub step_seconds: f64,
    /// `SNAPSHOT_SECONDS`: how often a running world is written to the repository (default 60).
    pub snapshot_seconds: f64,
    /// `IDLE_SECONDS`: a world without a connection is saved and put to sleep after this (default 300).
    pub idle_seconds: f64,
    /// `OFFLINE_LIMIT_HOURS`: most model time a sleeping world catches up on wake-up (R-5, default 12).
    pub offline_limit_hours: f64,
    /// `MAX_REQUESTS_PER_SECOND`: requests one connection may send per second on average (plan 02 §6:
    /// ≤ 20 commands/s; queries run on the client's replica). Bursts up to twice that pass.
    pub max_requests_per_second: f64,
    /// The galaxy's market (B6, 05-SOCIAL §3–4):
    /// - `NPC_FACTIONS` (default on; `0`, `false` or `off` switch them off, R-7): the factions that
    ///   host the hubs and make the market, with `NPC_SEED`, `NPC_PLAYERS` (their commanders on the
    ///   map, default 6), `NPC_UPDATE_SECONDS` (prices and depth; production 600, dev 10) and
    ///   `NPC_DEPTH` (units per material and update each way, default 50);
    /// - `HUB_FEE` (each side's fee, default 0.02), `START_CREDITS` (default 1000), `ORDER_HOURS`
    ///   (order lifetime, default 168);
    /// - `SHIPPING_SECONDS_PER_LY` and `SHIPPING_HANDLING_SECONDS` (production 7200 = 2 h/ly and 1800;
    ///   dev 2 and 2, so a test ship arrives in seconds);
    /// - `CONTRACT_HOURS` (factions' contracts: open and to deliver once taken; production 48, dev 1)
    ///   and `CONTRACTS_PER_HUB` (default 3, one of them premium);
    /// - corporations: `CORP_FOUNDING_CREDITS` and `CORP_FOUNDING_STA` (founding cost, the steel in
    ///   the seat hub; production 5000 and 100, dev 500 and 0), `CORP_MAX_MEMBERS` (20).
    pub market: MarketConfig,
    /// Accounts and sessions (R-25):
    /// - `REGISTRATION` (default on): `POST /api/register` makes accounts;
    /// - `GUEST_ACCOUNTS` (default: dev on, production off): `POST /api/guest` makes an account with a
    ///   random callsign, reached only through its session cookie;
    /// - `PASSWORD_HELLO` (default: dev on, production off): the WebSocket hello may carry a callsign
    ///   and a password (tools and tests); otherwise only a ticket of `POST /api/ticket`;
    /// - `COOKIE_SECURE` (default: production on, dev off): the session cookie only over HTTPS;
    /// - `SESSION_DAYS` (default 30) and `SIGNUPS_PER_MINUTE` (new accounts on the whole server;
    ///   production 30, dev 0 = no limit);
    /// - `METRICS_TOKEN`: `GET /metrics` (Prometheus) wants `Authorization: Bearer <token>`; without
    ///   it the endpoint is open in dev mode and off in production.
    pub auth: AuthConfig,
}

#[derive(Clone, Debug)]
pub struct AuthConfig {
    pub registration: bool,
    pub guest_accounts: bool,
    pub password_hello: bool,
    pub cookie_secure: bool,
    pub session_seconds: u64,
    pub signups_per_minute: u32,
    pub metrics_token: Option<String>,
}

impl AuthConfig {
    /// The defaults of a mode.
    pub fn for_mode(dev_mode: bool) -> AuthConfig {
        AuthConfig {
            registration: true,
            guest_accounts: dev_mode,
            password_hello: dev_mode,
            cookie_secure: !dev_mode,
            session_seconds: 30 * 24 * 3600,
            signups_per_minute: if dev_mode { 0 } else { 30 },
            metrics_token: None,
        }
    }
}

impl Config {
    pub fn from_env() -> Config {
        let var = |k: &str| std::env::var(k).ok().filter(|v| !v.is_empty());
        let flag = |k: &str| var(k).map(|v| v == "1" || v.eq_ignore_ascii_case("true") || v.eq_ignore_ascii_case("on"));
        let dev_mode = flag("DEV_MODE").unwrap_or(false);
        let num = |k: &str, d: f64| var(k).and_then(|v| v.parse::<f64>().ok()).filter(|v| *v > 0.0).unwrap_or(d);
        let non_negative = |k: &str, d: f64| var(k).and_then(|v| v.parse::<f64>().ok()).filter(|v| *v >= 0.0).unwrap_or(d);
        let prod = MarketConfig::default();
        let npc_default = prod.npc.expect("production has factions");
        let npc = NpcConfig {
            seed: var("NPC_SEED").and_then(|v| v.parse().ok()).unwrap_or(npc_default.seed),
            players: var("NPC_PLAYERS").and_then(|v| v.parse().ok()).unwrap_or(npc_default.players),
            update_seconds: num("NPC_UPDATE_SECONDS", if dev_mode { 10.0 } else { npc_default.update_seconds }),
            depth: num("NPC_DEPTH", npc_default.depth),
        };
        let market = MarketConfig {
            fee: non_negative("HUB_FEE", prod.fee),
            start_credits: non_negative("START_CREDITS", prod.start_credits),
            seconds_per_ly: non_negative("SHIPPING_SECONDS_PER_LY", if dev_mode { 2.0 } else { prod.seconds_per_ly }),
            handling_seconds: non_negative("SHIPPING_HANDLING_SECONDS", if dev_mode { 2.0 } else { prod.handling_seconds }),
            order_seconds: num("ORDER_HOURS", prod.order_seconds / 3600.0) * 3600.0,
            max_orders: prod.max_orders,
            contract_seconds: num("CONTRACT_HOURS", if dev_mode { 1.0 } else { prod.contract_seconds / 3600.0 }) * 3600.0,
            contracts_per_hub: var("CONTRACTS_PER_HUB").and_then(|v| v.parse().ok()).unwrap_or(prod.contracts_per_hub),
            corp: {
                let sta = non_negative(
                    "CORP_FOUNDING_STA",
                    if dev_mode { 0.0 } else { prod.corp.founding_goods.get("STA").copied().unwrap_or(0.0) },
                );
                CorpConfig {
                    founding_credits: non_negative("CORP_FOUNDING_CREDITS", if dev_mode { 500.0 } else { prod.corp.founding_credits }),
                    founding_goods: if sta > 0.0 { [("STA".to_string(), sta)].into_iter().collect() } else { Default::default() },
                    max_members: var("CORP_MAX_MEMBERS").and_then(|v| v.parse().ok()).filter(|n| *n >= 2).unwrap_or(prod.corp.max_members),
                    max_officers: prod.corp.max_officers,
                }
            },
            npc: if flag("NPC_FACTIONS").unwrap_or(true) { Some(npc) } else { None },
        };
        let auth_default = AuthConfig::for_mode(dev_mode);
        let auth = AuthConfig {
            registration: flag("REGISTRATION").unwrap_or(auth_default.registration),
            guest_accounts: flag("GUEST_ACCOUNTS").unwrap_or(auth_default.guest_accounts),
            password_hello: flag("PASSWORD_HELLO").unwrap_or(auth_default.password_hello),
            cookie_secure: flag("COOKIE_SECURE").unwrap_or(auth_default.cookie_secure),
            session_seconds: (num("SESSION_DAYS", 30.0) * 24.0 * 3600.0) as u64,
            signups_per_minute: var("SIGNUPS_PER_MINUTE").and_then(|v| v.parse().ok()).unwrap_or(auth_default.signups_per_minute),
            metrics_token: var("METRICS_TOKEN"),
        };
        Config {
            addr: var("ADDR").and_then(|a| a.parse().ok()).unwrap_or_else(|| SocketAddr::from(([127, 0, 0, 1], 8080))),
            data_dir: var("DATA_DIR").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("data")),
            database_url: var("DATABASE_URL"),
            dev_mode,
            step_seconds: num("WORLD_STEP_SECONDS", if dev_mode { 1.0 / 60.0 } else { 1.0 }),
            snapshot_seconds: num("SNAPSHOT_SECONDS", 60.0),
            idle_seconds: num("IDLE_SECONDS", 300.0),
            offline_limit_hours: num("OFFLINE_LIMIT_HOURS", 12.0),
            max_requests_per_second: num("MAX_REQUESTS_PER_SECOND", 20.0),
            market,
            auth,
        }
    }

    /// Loop tick of a running world [ms]: at least one per step (dev: 1/60 s steps), 10 Hz otherwise.
    pub fn tick_ms(&self) -> u64 {
        if self.dev_mode { 16 } else { 100 }
    }

    /// Loop tick of the galaxy service [ms]: arrivals, expiries and the factions' updates.
    pub fn galaxy_tick_ms(&self) -> u64 {
        if self.dev_mode { 250 } else { 1000 }
    }
}
