//! Configuration from the environment (plan 02 §9).

use std::net::SocketAddr;
use std::path::PathBuf;

use game_session::exchange::{MarketConfig, NpcConfig};

#[derive(Clone, Debug)]
pub struct Config {
    /// `ADDR` (default 127.0.0.1:8080; 0.0.0.0:8080 in the container).
    pub addr: SocketAddr,
    /// `DATA_DIR`: accounts, worlds and the galaxy (default ./data).
    pub data_dir: PathBuf,
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
    ///   dev 2 and 2, so a test ship arrives in seconds).
    pub market: MarketConfig,
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
            npc: if flag("NPC_FACTIONS").unwrap_or(true) { Some(npc) } else { None },
        };
        Config {
            addr: var("ADDR").and_then(|a| a.parse().ok()).unwrap_or_else(|| SocketAddr::from(([127, 0, 0, 1], 8080))),
            data_dir: var("DATA_DIR").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("data")),
            dev_mode,
            step_seconds: num("WORLD_STEP_SECONDS", if dev_mode { 1.0 / 60.0 } else { 1.0 }),
            snapshot_seconds: num("SNAPSHOT_SECONDS", 60.0),
            idle_seconds: num("IDLE_SECONDS", 300.0),
            offline_limit_hours: num("OFFLINE_LIMIT_HOURS", 12.0),
            max_requests_per_second: num("MAX_REQUESTS_PER_SECOND", 20.0),
            market,
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
