//! Scenario presets (`scenarios/*.ts`, `config/initial-world.ts`) and the worlds the mock server
//! builds on top of them (`mock-server/src/factory.ts`, `load.ts`).

pub mod factory;
pub mod load;
pub mod poc;
pub mod tau_ceti;

pub use factory::*;
pub use load::*;
pub use poc::*;
pub use tau_ceti::*;

use super::scenario::Scenario;
use super::simulation::{Simulation, SimulationOptions};
use crate::economy::Economy;

/// Base scenario of an id, as the mock server's `SCENARIOS` table.
pub fn scenario_by_id(id: &str) -> Option<Scenario> {
    match id {
        "tau-ceti" | "fabryka" | "load-m" | "load-l" => Some(tau_ceti_scenario()),
        "planeta-matka" | "load-s" => Some(poc_scenario()),
        _ => None,
    }
}

/// Starts a scenario as `MockServer.start` does: the preset world, the "fabryka" colony or a load
/// world S/M/L (seed 5150).
pub fn start_simulation(id: &str, economy: Option<Economy>) -> Option<Simulation> {
    match id {
        "fabryka" => Some(build_factory(economy)),
        "load-s" | "load-m" | "load-l" => LoadLevel::parse(id).map(|l| build_load(l, economy, DEFAULT_LOAD_SEED)),
        _ => scenario_by_id(id).map(|s| Simulation::new(s, SimulationOptions { economy, world: None })),
    }
}
