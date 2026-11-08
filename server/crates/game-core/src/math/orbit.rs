//! Analytic, deterministic orbit positions (`orbit-solver.ts`). Every body's position is a pure
//! function of game time t, so no numerical drift accumulates.

use std::collections::HashMap;

use super::vec3::{Vec3, vec3};
use crate::ids::BodyId;
use crate::models::body::CelestialBody;

#[derive(Clone, Debug)]
pub struct OrbitSolver {
    bodies: Vec<CelestialBody>,
    index: HashMap<BodyId, usize>,
    /// Docking point in the body's local frame; default = (0, radius × factor, 0).
    docking_offsets: HashMap<BodyId, Vec3>,
}

impl OrbitSolver {
    pub fn new(bodies: &[CelestialBody]) -> OrbitSolver {
        let mut index = HashMap::new();
        for (i, b) in bodies.iter().enumerate() {
            index.insert(b.id.clone(), i);
        }
        OrbitSolver { bodies: bodies.to_vec(), index, docking_offsets: HashMap::new() }
    }

    pub fn body(&self, id: &str) -> &CelestialBody {
        let i = self.index.get(id).unwrap_or_else(|| panic!("Unknown body {id}"));
        &self.bodies[*i]
    }

    pub fn try_body(&self, id: &str) -> Option<&CelestialBody> {
        self.index.get(id).map(|&i| &self.bodies[i])
    }

    /// Position in the parent's frame: (r·cos(ωt+φ), 0, r·sin(ωt+φ)).
    pub fn local_position(&self, body_id: &str, t: f64) -> Vec3 {
        let b = self.body(body_id);
        if b.orbit_radius == 0.0 {
            return Vec3::ZERO;
        }
        let a = b.orbit_speed * t + b.initial_angle;
        vec3(b.orbit_radius * a.cos(), 0.0, b.orbit_radius * a.sin())
    }

    /// Heliocentric position: sum of local positions along the parent chain.
    pub fn world_position(&self, body_id: &str, t: f64) -> Vec3 {
        let mut out = Vec3::ZERO;
        let mut cur = Some(self.body(body_id));
        while let Some(b) = cur {
            out = out + self.local_position(&b.id, t);
            cur = b.parent_id.as_deref().map(|p| self.body(p));
        }
        out
    }

    /// Overrides where ships dock at a body (e.g. a landing pad tile), in the body's local frame.
    pub fn set_docking_offset(&mut self, body_id: &str, local: Vec3) {
        self.docking_offsets.insert(body_id.to_string(), local);
    }

    /// Docking point in the body's local frame.
    pub fn docking_offset(&self, body_id: &str) -> Vec3 {
        if let Some(o) = self.docking_offsets.get(body_id) {
            return *o;
        }
        let b = self.body(body_id);
        vec3(0.0, b.radius * b.orbital_altitude_factor, 0.0)
    }

    /// World-space docking point: body centre + docking offset.
    pub fn docking_position(&self, body_id: &str, t: f64) -> Vec3 {
        self.world_position(body_id, t) + self.docking_offset(body_id)
    }

    /// Parking orbit in the body's local frame, ignoring landing pads: (0, radius × factor, 0).
    pub fn orbit_offset(&self, body_id: &str) -> Vec3 {
        let b = self.body(body_id);
        vec3(0.0, b.radius * b.orbital_altitude_factor, 0.0)
    }

    /// World-space parking orbit point (the mothership never lands, canvas: it unloads by shuttle).
    pub fn orbit_position(&self, body_id: &str, t: f64) -> Vec3 {
        self.world_position(body_id, t) + self.orbit_offset(body_id)
    }

    /// Where a ship of this role waits at a body: transports on the landing pad, the mothership in orbit.
    pub fn station_position(&self, body_id: &str, t: f64, mothership: bool) -> Vec3 {
        if mothership { self.orbit_position(body_id, t) } else { self.docking_position(body_id, t) }
    }

    /// Distance of the docking point from the body centre.
    pub fn docking_altitude(&self, b: &CelestialBody) -> f64 {
        self.docking_offset(&b.id).length()
    }

    /// Upper bound of the body's linear speed: Σ ω·r along the parent chain.
    pub fn max_linear_speed(&self, body_id: &str) -> f64 {
        let mut v = 0.0;
        let mut cur = Some(self.body(body_id));
        while let Some(b) = cur {
            v += b.orbit_speed.abs() * b.orbit_radius;
            cur = b.parent_id.as_deref().map(|p| self.body(p));
        }
        v
    }

    /// Upper bound of the body's distance from the system centre: Σ r along the parent chain.
    pub fn max_world_radius(&self, body_id: &str) -> f64 {
        let mut r = 0.0;
        let mut cur = Some(self.body(body_id));
        while let Some(b) = cur {
            r += b.orbit_radius;
            cur = b.parent_id.as_deref().map(|p| self.body(p));
        }
        r
    }

    /// Upper bound of the distance between two bodies' docking points.
    pub fn max_distance_between(&self, a: &str, b: &str) -> f64 {
        self.max_world_radius(a) + self.max_world_radius(b) + self.docking_altitude(self.body(a)) + self.docking_altitude(self.body(b))
    }
}
