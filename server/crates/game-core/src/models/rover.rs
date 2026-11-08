//! Construction rover (`rover.model.ts`).

use serde::{Deserialize, Serialize};

use crate::ids::{BodyId, RoverId};

/// IDLE; MOVING along `path`; BUILDING at the site of `job`.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum RoverState {
    Idle,
    Moving,
    Building,
}

/// Lives on one body and moves tile to tile over the Goldberg grid.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Rover {
    pub id: RoverId,
    pub name: String,
    pub body_id: BodyId,
    /// Tile it stands on (IDLE, BUILDING) or departed from (MOVING).
    pub tile_index: usize,
    pub state: RoverState,
    /// Remaining tile indices to visit, destination last. Empty when not moving.
    pub path: Vec<usize>,
    /// Construction site (structure id) it works for.
    pub job: Option<String>,
}
