//! Fixed-point iteration for the intercept point of a moving target (`lead-intercept.ts`).

use super::orbit::OrbitSolver;
use super::vec3::Vec3;

#[derive(Clone, Debug, PartialEq)]
pub struct LeadResult {
    pub lead_pos: Vec3,
    pub flight_time: f64,
    pub iterations: usize,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct LeadOptions {
    pub max_iter: Option<usize>,
    pub eps: Option<f64>,
    /// Aim at the parking orbit instead of the docking point (the mothership).
    pub orbit: bool,
}

/// Δt₀ = |target(t) − start| / v; Δtₙ₊₁ = |target(t + Δtₙ) − start| / v. Converges when the
/// target's linear speed is well below the cruise speed.
pub fn solve_lead_intercept(
    start: Vec3,
    target_id: &str,
    t: f64,
    cruise_speed: f64,
    solver: &OrbitSolver,
    opts: LeadOptions,
) -> LeadResult {
    let max_iter = opts.max_iter.unwrap_or(8);
    let eps = opts.eps.unwrap_or(1e-3);
    let target = |time: f64| solver.station_position(target_id, time, opts.orbit);

    let mut lead_pos = target(t);
    let mut dt = start.distance(lead_pos) / cruise_speed;
    let mut iterations = 1;

    while iterations <= max_iter {
        lead_pos = target(t + dt);
        let next = start.distance(lead_pos) / cruise_speed;
        let converged = (next - dt).abs() < eps;
        dt = next;
        if converged {
            break;
        }
        iterations += 1;
    }

    lead_pos = target(t + dt);
    LeadResult { lead_pos, flight_time: dt, iterations: iterations.min(max_iter) }
}
