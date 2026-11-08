//! Immutable description of a transfer (`transfer.model.ts`). Arrival time and the intercept point
//! are fixed when the order is given (TECH-1): the position in flight is a pure function of the
//! plan and the time.

use serde::{Deserialize, Serialize};

use crate::ids::{BodyId, ShipId};
use crate::math::vec3::Vec3;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TransferPlan {
    pub ship_id: ShipId,
    pub from_body_id: BodyId,
    pub to_body_id: BodyId,
    /// Game time at departure [min].
    pub start_time: f64,
    /// World position at departure.
    pub start_pos: Vec3,
    /// Docking point of the target at arrival time.
    pub lead_pos: Vec3,
    pub cruise_speed: f64,
    /// Flight time [min]; arrival = start_time + estimated_duration.
    pub estimated_duration: f64,
    pub fuel_cost: f64,
}

impl TransferPlan {
    pub fn arrival_time(&self) -> f64 {
        self.start_time + self.estimated_duration
    }
}
