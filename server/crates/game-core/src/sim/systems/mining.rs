//! Transfers the body's first non-empty resource to a MINING ship once per model minute
//! (`mining-system.ts`). W09: every whole minute of the step counts.

use std::collections::HashMap;

use crate::ids::ShipId;
use crate::models::body::CelestialBody;
use crate::models::event::{DomainEvent, MiningStopReason};
use crate::models::resource::Qty;
use crate::models::ship::{ShipState, Spacecraft};
use crate::sim::constants::GameConstants;
use crate::sim::reducer::cargo_total;

#[derive(Clone, Debug, Default)]
pub struct MiningSystem {
    accumulators: HashMap<ShipId, f64>,
}

impl MiningSystem {
    pub fn new() -> MiningSystem {
        MiningSystem::default()
    }

    pub fn update(&mut self, ships: &[Spacecraft], bodies: &[CelestialBody], cfg: &GameConstants, dt: f64) -> Vec<DomainEvent> {
        let mut events = Vec::new();
        for ship in ships {
            let Some(body_id) = ship.current_body_id.as_ref().filter(|_| ship.state == ShipState::Mining) else {
                self.accumulators.remove(&ship.id);
                continue;
            };
            let body = bodies.iter().find(|b| &b.id == body_id);
            let mut available: Qty = body.and_then(|b| b.resources.clone()).unwrap_or_default();
            let mut space = ship.max_cargo - cargo_total(&ship.cargo);
            let mut acc = self.accumulators.get(&ship.id).copied().unwrap_or(0.0) + dt;
            let mut stopped = false;

            if space <= 0.0 {
                events.push(DomainEvent::MiningStopped { ship_id: ship.id.clone(), reason: MiningStopReason::CargoFull });
                continue;
            }
            while acc >= 1.0 && !stopped {
                acc -= 1.0;
                let Some(resource) = available.iter().find(|(_, v)| **v > 0.0).map(|(k, _)| k.clone()) else {
                    events.push(DomainEvent::MiningStopped { ship_id: ship.id.clone(), reason: MiningStopReason::Depleted });
                    stopped = true;
                    break;
                };
                let left = available[&resource];
                let amount = cfg.mining_rate.min(space).min(left);
                events.push(DomainEvent::MiningTick {
                    ship_id: ship.id.clone(),
                    body_id: body_id.clone(),
                    resource: resource.clone(),
                    amount,
                });
                space -= amount;
                available.insert(resource, left - amount);
                if space <= 0.0 {
                    events.push(DomainEvent::MiningStopped { ship_id: ship.id.clone(), reason: MiningStopReason::CargoFull });
                    stopped = true;
                } else if !available.values().any(|&v| v > 0.0) {
                    events.push(DomainEvent::MiningStopped { ship_id: ship.id.clone(), reason: MiningStopReason::Depleted });
                    stopped = true;
                }
            }
            if !stopped && !available.values().any(|&v| v > 0.0) {
                events.push(DomainEvent::MiningStopped { ship_id: ship.id.clone(), reason: MiningStopReason::Depleted });
                stopped = true;
            }
            if stopped {
                self.accumulators.remove(&ship.id);
            } else {
                self.accumulators.insert(ship.id.clone(), acc);
            }
        }
        events
    }
}
