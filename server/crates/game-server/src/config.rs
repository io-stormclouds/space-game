//! Configuration from the environment (plan 02 §9).

use std::net::SocketAddr;
use std::path::PathBuf;

#[derive(Clone, Debug)]
pub struct Config {
    /// `ADDR` (default 127.0.0.1:8080; 0.0.0.0:8080 in the container).
    pub addr: SocketAddr,
    /// `DATA_DIR`: accounts and worlds (default ./data).
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
}

impl Config {
    pub fn from_env() -> Config {
        let var = |k: &str| std::env::var(k).ok().filter(|v| !v.is_empty());
        let dev_mode = var("DEV_MODE").is_some_and(|v| v == "1" || v.eq_ignore_ascii_case("true"));
        let num = |k: &str, d: f64| var(k).and_then(|v| v.parse::<f64>().ok()).filter(|v| *v > 0.0).unwrap_or(d);
        Config {
            addr: var("ADDR").and_then(|a| a.parse().ok()).unwrap_or_else(|| SocketAddr::from(([127, 0, 0, 1], 8080))),
            data_dir: var("DATA_DIR").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("data")),
            dev_mode,
            step_seconds: num("WORLD_STEP_SECONDS", if dev_mode { 1.0 / 60.0 } else { 1.0 }),
            snapshot_seconds: num("SNAPSHOT_SECONDS", 60.0),
            idle_seconds: num("IDLE_SECONDS", 300.0),
            offline_limit_hours: num("OFFLINE_LIMIT_HOURS", 12.0),
            max_requests_per_second: num("MAX_REQUESTS_PER_SECOND", 20.0),
        }
    }

    /// Loop tick of a running world [ms]: at least one per step (dev: 1/60 s steps), 10 Hz otherwise.
    pub fn tick_ms(&self) -> u64 {
        if self.dev_mode { 16 } else { 100 }
    }
}
