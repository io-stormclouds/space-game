//! The machine of one Fabryka atanorowa (`atanor-machine.model.ts`, AT4): part of the world state.

use serde::{Deserialize, Serialize};

use super::resource::{Cost, Stockpile};
use crate::atanor::Solution;

/// Why a deployed machine is not ticking: RUNNING works; WAITING lacks an input (§8.5 p. 1); FULL
/// has no room for the product (Z3); IDLE has no program yet; JAM stopped (a guard, a successful
/// trial should rule it out).
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum MachineState {
    Idle,
    Running,
    Waiting,
    Full,
    Jam,
}

/// Numbers of a program measured when it was deployed (A17: production and power come from them).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ProgramMetrics {
    pub cycles_per_output: f64,
    pub area: f64,
    pub arms: f64,
    /// Power of the machine on top of the building's own [MW]: 0.5 per hex + 1 per arm (§8.1).
    pub extra_power: f64,
}

/// A program being deployed (§3.2): the old one keeps working until it is ready.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Deployment {
    pub solution: Solution,
    pub metrics: ProgramMetrics,
    /// Minutes left and in total (A19: proportional to the value of the machine's materials).
    pub remaining: f64,
    pub total: f64,
    /// Materials of removed elements, returned when the deployment ends (A18: 100 %).
    pub refund: Cost,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AtanorMachine {
    pub structure_id: String,
    pub recipe: String,
    /// The working program; null until the first deployment.
    pub program: Option<Solution>,
    pub metrics: Option<ProgramMetrics>,
    /// The player's last saved draft (kept in save files).
    pub draft: Option<Solution>,
    pub deploy: Option<Deployment>,
    /// Engine ticks of the program since its deployment (the engine state is a function of this).
    pub ticks: u64,
    /// 0..1 of the way to the next tick.
    pub progress: f64,
    pub state: MachineState,
    /// Material units taken from storage since the deployment (atoms that entered the machine).
    pub consumed: Stockpile,
    /// Products delivered since the deployment.
    pub delivered: u64,
}

impl AtanorMachine {
    /// A fresh machine (no program yet).
    pub fn new(structure_id: &str, recipe: &str) -> AtanorMachine {
        AtanorMachine {
            structure_id: structure_id.to_string(),
            recipe: recipe.to_string(),
            program: None,
            metrics: None,
            draft: None,
            deploy: None,
            ticks: 0,
            progress: 0.0,
            state: MachineState::Idle,
            consumed: Stockpile::new(),
            delivered: 0,
        }
    }
}
