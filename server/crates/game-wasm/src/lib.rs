//! `game-core` for the browser: one `Session` per world, JSON in and out (the Web Worker speaks
//! structured-clone-safe data, so the boundary is JSON until a binary protocol pays off).
//!
//! B0 scope: enough surface to link the whole domain and measure the .wasm size. The `GameApi`
//! adapter (snapshots, catalog, availability, previews) follows in B3.

use game_core::economy::{EconomyParams, compute_economy};
use game_core::models::command::Command;
use game_core::sim::Simulation;
use game_core::sim::scenarios::start_simulation;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[wasm_bindgen]
pub struct Session {
    sim: Simulation,
}

#[wasm_bindgen]
impl Session {
    /// Starts a scenario (`tau-ceti`, `planeta-matka`, `fabryka`, `load-s/m/l`) with optional economy parameters (JSON).
    #[wasm_bindgen(constructor)]
    pub fn new(scenario_id: &str, economy_json: Option<String>) -> Result<Session, JsError> {
        let economy = match economy_json {
            Some(json) => {
                let params: EconomyParams = serde_json::from_str(&json).map_err(|e| JsError::new(&e.to_string()))?;
                Some(compute_economy(params))
            }
            None => None,
        };
        let sim = start_simulation(scenario_id, economy).ok_or_else(|| JsError::new(&format!("unknown scenario {scenario_id}")))?;
        Ok(Session { sim })
    }

    /// Validates and applies a command (JSON); returns its events (JSON array).
    pub fn command(&mut self, command_json: &str) -> Result<String, JsError> {
        let cmd: Command = serde_json::from_str(command_json).map_err(|e| JsError::new(&e.to_string()))?;
        let events = self.sim.dispatch(&cmd);
        serde_json::to_string(&events).map_err(|e| JsError::new(&e.to_string()))
    }

    /// Advances the world by `dt` model minutes; returns the events (JSON array).
    pub fn step(&mut self, dt: f64) -> Result<String, JsError> {
        let events = self.sim.step(dt);
        serde_json::to_string(&events).map_err(|e| JsError::new(&e.to_string()))
    }

    pub fn time(&self) -> f64 {
        self.sim.time()
    }

    /// The whole world as JSON (the save file's `world`).
    pub fn world_json(&self) -> Result<String, JsError> {
        serde_json::to_string(&self.sim.world).map_err(|e| JsError::new(&e.to_string()))
    }
}
