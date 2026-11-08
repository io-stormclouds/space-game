//! Plans transfers (fuel cost, lead intercept, Bézier arc) and moves ships in flight
//! (`transfer-system.ts`). TECH-1, W09: arrival time and the intercept point are fixed at the order;
//! the position is a pure function of (plan, t) and the ship arrives exactly at
//! `start_time + estimated_duration`, whatever the step size.

use std::collections::HashMap;

use crate::ids::ShipId;
use crate::math::bezier::BezierPath;
use crate::math::lead::{LeadOptions, solve_lead_intercept};
use crate::math::orbit::OrbitSolver;
use crate::math::vec3::{Vec3, vec3};
use crate::models::event::DomainEvent;
use crate::models::ship::{ShipRole, ShipState, Spacecraft};
use crate::models::transfer::TransferPlan;
use crate::sim::constants::GameConstants;
use crate::sim::frame::{FrameSnapshot, TRAJECTORY_SAMPLES, Trajectory};

#[derive(Clone, Debug)]
struct ActiveTransfer {
    plan: TransferPlan,
    path: BezierPath,
    pos: Vec3,
    forward: Vec3,
}

#[derive(Clone, Debug, Default)]
pub struct TransferSystem {
    active: HashMap<ShipId, ActiveTransfer>,
}

impl TransferSystem {
    pub fn new() -> TransferSystem {
        TransferSystem::default()
    }

    /// Fuel for a hop between two stations at time t (docking points; parking orbits for the mothership).
    pub fn fuel_cost(&self, solver: &OrbitSolver, cfg: &GameConstants, from: &str, to: &str, t: f64, mothership: bool) -> f64 {
        let a = solver.station_position(from, t, mothership);
        let b = solver.station_position(to, t, mothership);
        a.distance(b) * cfg.fuel_rate
    }

    /// Worst-case fuel to get from `from` back to `home`, independent of time.
    pub fn return_reserve(&self, solver: &OrbitSolver, cfg: &GameConstants, from: &str, home: &str) -> f64 {
        solver.max_distance_between(from, home) * cfg.fuel_rate
    }

    /// Builds the plan and registers the flight. The ship must be docked at `plan.from_body_id`.
    pub fn plan(&mut self, solver: &OrbitSolver, cfg: &GameConstants, ship: &Spacecraft, to: &str, t: f64) -> TransferPlan {
        let from = ship.current_body_id.clone().unwrap_or_else(|| panic!("Ship {} is not docked", ship.id));
        // the mothership never lands on a pad: it flies between parking orbits (canvas, D33)
        let orbit = ship.role == ShipRole::Mothership;
        let start_pos = solver.station_position(&from, t, orbit);
        let lead = solve_lead_intercept(start_pos, to, t, cfg.cruise_speed, solver, LeadOptions { orbit, ..Default::default() });
        let plan = TransferPlan {
            ship_id: ship.id.clone(),
            from_body_id: from.clone(),
            to_body_id: to.to_string(),
            start_time: t,
            start_pos,
            lead_pos: lead.lead_pos,
            cruise_speed: cfg.cruise_speed,
            estimated_duration: lead.flight_time,
            fuel_cost: self.fuel_cost(solver, cfg, &from, to, t, orbit),
        };
        self.register(cfg, &plan);
        plan
    }

    /// Re-creates the in-flight state of a plan (after loading a saved game).
    pub fn register(&mut self, cfg: &GameConstants, plan: &TransferPlan) {
        let path = BezierPath::arc(plan.start_pos, plan.lead_pos, cfg.arc_lift_factor);
        self.active
            .insert(plan.ship_id.clone(), ActiveTransfer { plan: plan.clone(), path, pos: plan.start_pos, forward: vec3(0.0, 0.0, 1.0) });
    }

    pub fn is_active(&self, ship_id: &str) -> bool {
        self.active.contains_key(ship_id)
    }

    pub fn active_path(&self, ship_id: &str) -> Option<&BezierPath> {
        self.active.get(ship_id).map(|a| &a.path)
    }

    /// Moves all flights to time t and writes positions into the snapshot.
    pub fn update(&mut self, ships: &[Spacecraft], t: f64, cfg: &GameConstants, snap: &mut FrameSnapshot) -> Vec<DomainEvent> {
        let mut events = Vec::new();
        snap.ship_world_pos.clear();
        snap.ship_forward.clear();
        snap.transit_progress.clear();

        for ship in ships {
            let Some(transfer) = ship.transfer.as_ref().filter(|_| ship.state == ShipState::InTransit) else { continue };
            if !self.active.contains_key(&ship.id) {
                self.register(cfg, transfer);
            }
            let a = self.active.get_mut(&ship.id).expect("registered above");
            let duration = a.plan.estimated_duration.max(1e-9);
            let u = ((t - a.plan.start_time) / duration).clamp(0.0, 1.0);
            a.pos = a.path.point_at(u);
            a.forward = a.path.tangent_at(u);
            snap.ship_world_pos.insert(ship.id.clone(), a.pos);
            snap.ship_forward.insert(ship.id.clone(), a.forward);
            snap.transit_progress.insert(ship.id.clone(), u);

            if t >= a.plan.arrival_time() - 1e-9 {
                let to = a.plan.to_body_id.clone();
                self.active.remove(&ship.id);
                events.push(DomainEvent::TransferArrived { ship_id: ship.id.clone(), body_id: to });
            }
        }
        events
    }

    /// Fills `snap.trajectory` for the given ship, or clears it.
    pub fn write_trajectory(&self, ship_id: Option<&str>, snap: &mut FrameSnapshot) {
        let a = ship_id.and_then(|id| self.active.get(id));
        snap.trajectory = a.map(|a| Trajectory { ship_id: a.plan.ship_id.clone(), points: a.path.sample(TRAJECTORY_SAMPLES) });
    }

    /// Current world position of a ship in flight.
    pub fn position_of(&self, ship_id: &str) -> Option<Vec3> {
        self.active.get(ship_id).map(|a| a.pos)
    }
}
