//! Mutable per-frame buffer of continuous values (`frame-snapshot.ts`): positions, orientations,
//! progress. Written by game systems, read by the renderer; never part of the saved state.

use indexmap::IndexMap;

use crate::ids::{BodyId, RoverId, ShipId};
use crate::math::vec3::Vec3;

pub const TRAJECTORY_SAMPLES: usize = 48;

#[derive(Clone, Debug, PartialEq)]
pub struct Trajectory {
    pub ship_id: ShipId,
    pub points: Vec<Vec3>,
}

#[derive(Clone, Debug, Default)]
pub struct FrameSnapshot {
    pub time: f64,
    /// Position of each body in its parent's frame.
    pub body_local_pos: IndexMap<BodyId, Vec3>,
    /// World position of ships that are IN_TRANSIT.
    pub ship_world_pos: IndexMap<ShipId, Vec3>,
    /// Unit forward vector of ships IN_TRANSIT.
    pub ship_forward: IndexMap<ShipId, Vec3>,
    /// Curve parameter 0..1 for ships IN_TRANSIT.
    pub transit_progress: IndexMap<ShipId, f64>,
    /// Rover position in its body's local frame (surface point + lift).
    pub rover_local_pos: IndexMap<RoverId, Vec3>,
    /// Unit forward (tangent) of each rover, local frame.
    pub rover_forward: IndexMap<RoverId, Vec3>,
    /// Trajectory of the ship being drawn (the selected one or the only one in transit).
    pub trajectory: Option<Trajectory>,
}

impl FrameSnapshot {
    pub fn new<'a>(body_ids: impl IntoIterator<Item = &'a BodyId>) -> FrameSnapshot {
        let mut snap = FrameSnapshot::default();
        for id in body_ids {
            snap.body_local_pos.insert(id.clone(), Vec3::ZERO);
        }
        snap
    }
}
