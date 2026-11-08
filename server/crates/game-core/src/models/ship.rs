//! Spacecraft (`spacecraft.model.ts`).

use serde::{Deserialize, Serialize};

use super::resource::Stockpile;
use super::transfer::TransferPlan;
use crate::ids::{BodyId, ShipId};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum ShipState {
    Docked,
    InTransit,
    Mining,
}

/// SHIP: PoC transport that mines and unloads at the home base. MOTHERSHIP: Arka-1, carries the colony.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum ShipRole {
    Ship,
    Mothership,
}

/// Units carried by a mothership, released during colonisation.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct Onboard {
    pub rovers: i64,
    pub shuttles: i64,
    pub probes: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Spacecraft {
    pub id: ShipId,
    pub name: String,
    pub role: ShipRole,
    pub fuel: f64,
    pub max_fuel: f64,
    pub cargo: Stockpile,
    /// Limit on the total of all materials in the hold.
    pub max_cargo: f64,
    pub state: ShipState,
    /// `None` while IN_TRANSIT.
    pub current_body_id: Option<BodyId>,
    pub target_body_id: Option<BodyId>,
    pub transfer: Option<TransferPlan>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub onboard: Option<Onboard>,
}
