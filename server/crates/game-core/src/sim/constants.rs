//! Tunable constants of the simulation (`config/game-constants.ts`).

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GameConstants {
    /// Ship cruise speed in world units per model minute.
    pub cruise_speed: f64,
    /// Fuel per world unit of distance between docking points.
    pub fuel_rate: f64,
    /// Minerals transferred per model minute while MINING.
    pub mining_rate: f64,
    /// Arrival when the ship is within radius × this factor of the target centre.
    pub capture_radius_factor: f64,
    /// Upper bound on a single real frame [s] to avoid the spiral of death.
    pub time_clamp: f64,
    /// Height of the Bézier control point as a fraction of the start→target distance.
    pub arc_lift_factor: f64,
    /// Rover speed over the surface, world units per model minute.
    pub rover_speed: f64,
    /// Height of a landing pad's docking point above the tile, as a fraction of the body radius.
    pub pad_lift_factor: f64,
}

pub const GAME_CONSTANTS: GameConstants = GameConstants {
    cruise_speed: 150.0,
    fuel_rate: 0.02,
    mining_rate: 10.0,
    capture_radius_factor: 1.1,
    time_clamp: 0.1,
    arc_lift_factor: 0.2,
    rover_speed: 12.0,
    pad_lift_factor: 0.08,
};

impl Default for GameConstants {
    fn default() -> Self {
        GAME_CONSTANTS
    }
}
