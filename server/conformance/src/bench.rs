//! `conformance bench <scenario> <steps> [dt_minutes]`: steps a scenario and prints the time per
//! step and the size of the world (plan 02 §2.3, the step budget of the server at ×1: one step per
//! second must stay far below 1 s on the L load world).

use std::time::Instant;

use game_core::sim::scenarios::start_simulation;

pub fn run(scenario: &str, steps: u64, dt: f64) -> bool {
    let Some(mut sim) = start_simulation(scenario, None) else {
        eprintln!("unknown scenario {scenario}");
        return false;
    };
    let world_bytes = serde_json::to_string(&sim.world).map(|s| s.len()).unwrap_or(0);
    let started = Instant::now();
    let mut events = 0usize;
    for _ in 0..steps {
        events += sim.step(dt).len();
    }
    let elapsed = started.elapsed();
    let per_step_us = elapsed.as_secs_f64() * 1e6 / steps.max(1) as f64;
    let w = &sim.world;
    println!(
        "{scenario}: {steps} steps × {dt} min in {:.1} ms = {per_step_us:.1} µs/step; {events} events; world {:.0} kB JSON, {} structures, {} ships, {} rovers, {} machines",
        elapsed.as_secs_f64() * 1000.0,
        world_bytes as f64 / 1000.0,
        w.structures.len(),
        w.ships.len(),
        w.rovers.len(),
        w.machines.as_ref().map(|m| m.len()).unwrap_or(0),
    );
    true
}
