//! Extractors pull their material from the deposit under them into the body's storage, once per
//! model minute (`extraction-system.ts`). Unified rules: amount = rate × level factor × power
//! efficiency (Z4) × 50% while upgrading; stops when the storage class is full (Z3); a step longer
//! than one minute counts every whole minute.

use std::collections::HashMap;

use crate::ids::tile_index_of;
use crate::math::js;
use crate::models::event::DomainEvent;
use crate::models::structure::StructureState;
use crate::sim::colony::{ByPriority, free_space, power_balance};
use crate::sim::reducer::WorldState;
use crate::sim::rules::Rules;
use crate::sim::scenario::Grids;

#[derive(Clone, Debug, Default)]
pub struct ExtractionSystem {
    accumulator: f64,
}

/// Keeps stock values readable (no 1.6000000000000003).
fn round3(n: f64) -> f64 {
    js::round(n * 1000.0) / 1000.0
}

impl ExtractionSystem {
    pub fn new() -> ExtractionSystem {
        ExtractionSystem::default()
    }

    pub fn update(&mut self, world: &WorldState, rules: &Rules, grids: &Grids, dt: f64) -> Vec<DomainEvent> {
        self.accumulator += dt;
        let ticks = (self.accumulator + 1e-9).floor();
        if ticks < 1.0 {
            return Vec::new();
        }
        self.accumulator -= ticks;

        let mut events = Vec::new();
        let mut deposits = world.deposits.clone();
        let mut efficiency: HashMap<String, ByPriority> = HashMap::new();
        let mut space: HashMap<String, f64> = HashMap::new();

        for _tick in 0..(ticks as u64) {
            for s in &world.structures {
                if !s.is_working() {
                    continue;
                }
                let extraction = rules.extraction(&s.kind);
                if extraction.is_empty() {
                    continue;
                }
                let Some(tile) = grids.get(&s.body_id).and_then(|g| g.tiles.get(tile_index_of(&s.tile_id))) else { continue };
                let anywhere = rules.extracts_anywhere(&s.kind);
                let ext = match (anywhere, &tile.deposit) {
                    (Some(a), None) => Some(a),
                    _ => extraction.iter().find(|e| tile.deposit.as_ref().map(|d| d.resource == e.material).unwrap_or(false)),
                };
                let Some(ext) = ext else { continue };

                let eff_by =
                    *efficiency.entry(s.body_id.clone()).or_insert_with(|| power_balance(world, rules, &s.body_id, false).efficiency);
                let spec = rules.spec(&s.kind, s.level);
                let eff = eff_by.get(spec.priority) * if s.state == StructureState::Upgrading { 0.5 } else { 1.0 };
                let key = format!("{}|{}", s.body_id, ext.material);
                let free = *space.entry(key.clone()).or_insert_with(|| free_space(world, rules, &s.body_id, &ext.material));
                let finite = anywhere.is_none() || tile.deposit.is_some();
                let remaining = if finite { deposits.get(&s.tile_id).copied().unwrap_or(0.0) } else { f64::INFINITY };
                let amount = round3((ext.rate * spec.output_factor * eff).min(remaining).min(free));
                if amount <= 0.0 {
                    continue;
                }
                events.push(DomainEvent::ExtractionTick {
                    body_id: s.body_id.clone(),
                    tile_id: s.tile_id.clone(),
                    resource: ext.material.clone(),
                    amount,
                });
                space.insert(key, free - amount);
                if finite {
                    deposits.insert(s.tile_id.clone(), remaining - amount);
                    if amount >= remaining {
                        events.push(DomainEvent::DepositDepleted { body_id: s.body_id.clone(), tile_id: s.tile_id.clone() });
                    }
                }
            }
        }
        events
    }
}
