//! Metrics in the Prometheus text format (plan 02 §10): `GET /metrics`. Counters and the histogram of
//! world ticks are atomics updated where things happen; gauges of the moment (worlds, accounts,
//! sessions) are read at the scrape. In production the endpoint answers only with `METRICS_TOKEN`
//! (`Authorization: Bearer …`); without a token it is off. Caddy (deploy/) does not pass it out.

use std::fmt::Write as _;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

/// Upper bounds of the tick histogram [s]: a world's step is ~0.1–1 ms (plan 02 §10 targets ≤ 1 ms
/// mean, ≤ 3 ms p99 for L).
const TICK_BOUNDS: [f64; 10] = [0.0001, 0.00025, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.025, 0.1, 1.0];

pub struct Histogram {
    buckets: [AtomicU64; TICK_BOUNDS.len()],
    count: AtomicU64,
    sum_nanos: AtomicU64,
}

impl Histogram {
    const fn new() -> Histogram {
        Histogram { buckets: [const { AtomicU64::new(0) }; TICK_BOUNDS.len()], count: AtomicU64::new(0), sum_nanos: AtomicU64::new(0) }
    }

    pub fn observe(&self, d: Duration) {
        let s = d.as_secs_f64();
        if let Some(i) = TICK_BOUNDS.iter().position(|b| s <= *b) {
            self.buckets[i].fetch_add(1, Ordering::Relaxed);
        }
        self.count.fetch_add(1, Ordering::Relaxed);
        self.sum_nanos.fetch_add(d.as_nanos() as u64, Ordering::Relaxed);
    }

    fn render(&self, out: &mut String, name: &str, help: &str) {
        let _ = writeln!(out, "# HELP {name} {help}\n# TYPE {name} histogram");
        let mut cumulative = 0;
        for (b, n) in TICK_BOUNDS.iter().zip(&self.buckets) {
            cumulative += n.load(Ordering::Relaxed);
            let _ = writeln!(out, "{name}_bucket{{le=\"{b}\"}} {cumulative}");
        }
        let count = self.count.load(Ordering::Relaxed);
        let _ = writeln!(out, "{name}_bucket{{le=\"+Inf\"}} {count}");
        let _ = writeln!(out, "{name}_sum {}", self.sum_nanos.load(Ordering::Relaxed) as f64 / 1e9);
        let _ = writeln!(out, "{name}_count {count}");
    }
}

/// The server's counters (one process, one set).
pub struct Metrics {
    pub connections: AtomicU64,
    pub logins_ok: AtomicU64,
    pub logins_refused: AtomicU64,
    pub requests: AtomicU64,
    pub requests_limited: AtomicU64,
    pub commands_accepted: AtomicU64,
    pub commands_rejected: AtomicU64,
    pub resyncs: AtomicU64,
    pub galaxy_ops: AtomicU64,
    pub galaxy_shipments: AtomicU64,
    pub galaxy_orders: AtomicU64,
    pub galaxy_corporations: AtomicU64,
    pub world_tick: Histogram,
}

pub static METRICS: Metrics = Metrics {
    connections: AtomicU64::new(0),
    logins_ok: AtomicU64::new(0),
    logins_refused: AtomicU64::new(0),
    requests: AtomicU64::new(0),
    requests_limited: AtomicU64::new(0),
    commands_accepted: AtomicU64::new(0),
    commands_rejected: AtomicU64::new(0),
    resyncs: AtomicU64::new(0),
    galaxy_ops: AtomicU64::new(0),
    galaxy_shipments: AtomicU64::new(0),
    galaxy_orders: AtomicU64::new(0),
    galaxy_corporations: AtomicU64::new(0),
    world_tick: Histogram::new(),
};

pub fn inc(c: &AtomicU64) {
    c.fetch_add(1, Ordering::Relaxed);
}

pub fn dec(c: &AtomicU64) {
    c.fetch_sub(1, Ordering::Relaxed);
}

/// Gauges read at the scrape.
pub struct Moment {
    pub worlds_running: usize,
    pub accounts: usize,
    pub sessions: usize,
    pub uptime_seconds: f64,
}

fn metric(out: &mut String, name: &str, kind: &str, help: &str, value: impl std::fmt::Display) {
    let _ = writeln!(out, "# HELP {name} {help}\n# TYPE {name} {kind}\n{name} {value}");
}

/// The text exposition format (version 0.0.4).
pub fn render(m: &Metrics, now: &Moment) -> String {
    let mut out = String::new();
    let get = |c: &AtomicU64| c.load(Ordering::Relaxed);
    metric(&mut out, "game_uptime_seconds", "gauge", "Seconds since the server started.", now.uptime_seconds);
    metric(&mut out, "game_worlds_running", "gauge", "Worlds awake (a world sleeps when nobody is connected).", now.worlds_running);
    metric(&mut out, "game_accounts", "gauge", "Accounts (guests included).", now.accounts);
    metric(&mut out, "game_sessions", "gauge", "Live login sessions.", now.sessions);
    metric(&mut out, "game_connections", "gauge", "Open WebSocket connections.", get(&m.connections));
    let _ = writeln!(out, "# HELP game_logins_total Logins of WebSockets and of the HTTP API.\n# TYPE game_logins_total counter");
    let _ = writeln!(out, "game_logins_total{{result=\"ok\"}} {}", get(&m.logins_ok));
    let _ = writeln!(out, "game_logins_total{{result=\"refused\"}} {}", get(&m.logins_refused));
    metric(&mut out, "game_requests_total", "counter", "Requests of clients to their worlds and to the galaxy.", get(&m.requests));
    metric(&mut out, "game_requests_limited_total", "counter", "Requests refused by the rate limit.", get(&m.requests_limited));
    let _ = writeln!(out, "# HELP game_commands_total Commands of players.\n# TYPE game_commands_total counter");
    let _ = writeln!(out, "game_commands_total{{result=\"accepted\"}} {}", get(&m.commands_accepted));
    let _ = writeln!(out, "game_commands_total{{result=\"rejected\"}} {}", get(&m.commands_rejected));
    metric(&mut out, "game_resyncs_total", "counter", "Checkpoints sent again to replicas that differed.", get(&m.resyncs));
    metric(&mut out, "game_galaxy_ops_total", "counter", "Requests to the galaxy service.", get(&m.galaxy_ops));
    metric(&mut out, "game_galaxy_shipments", "gauge", "Shipments travelling or waiting at colonies.", get(&m.galaxy_shipments));
    metric(&mut out, "game_galaxy_orders", "gauge", "Open orders in the hubs' books.", get(&m.galaxy_orders));
    metric(&mut out, "game_galaxy_corporations", "gauge", "Corporations.", get(&m.galaxy_corporations));
    m.world_tick.render(&mut out, "game_world_tick_seconds", "Time of one tick of a world (its steps to now).");
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_text_format() {
        let m = Metrics {
            connections: AtomicU64::new(2),
            logins_ok: AtomicU64::new(5),
            logins_refused: AtomicU64::new(1),
            requests: AtomicU64::new(0),
            requests_limited: AtomicU64::new(0),
            commands_accepted: AtomicU64::new(0),
            commands_rejected: AtomicU64::new(0),
            resyncs: AtomicU64::new(0),
            galaxy_ops: AtomicU64::new(0),
            galaxy_shipments: AtomicU64::new(0),
            galaxy_orders: AtomicU64::new(0),
            galaxy_corporations: AtomicU64::new(0),
            world_tick: Histogram::new(),
        };
        m.world_tick.observe(Duration::from_micros(300));
        m.world_tick.observe(Duration::from_millis(3));
        let text = render(&m, &Moment { worlds_running: 1, accounts: 3, sessions: 2, uptime_seconds: 10.0 });
        assert!(text.contains("game_connections 2\n"));
        assert!(text.contains("game_logins_total{result=\"refused\"} 1\n"));
        assert!(text.contains("game_world_tick_seconds_bucket{le=\"0.0005\"} 1\n"), "{text}");
        assert!(text.contains("game_world_tick_seconds_bucket{le=\"0.005\"} 2\n"));
        assert!(text.contains("game_world_tick_seconds_bucket{le=\"+Inf\"} 2\n"));
        assert!(text.contains("game_world_tick_seconds_count 2\n"));
        assert!(text.contains("# TYPE game_accounts gauge\ngame_accounts 3\n"));
    }
}
