//! Processing buildings run batches of their recipe (`production-system.ts`): inputs leave the
//! body's storage when a batch starts, outputs arrive when it ends. Speed = level factor × power
//! efficiency (Z4) × 50% while upgrading. A batch starts only if its outputs fit (Z3).

use std::collections::HashMap;

use crate::ids::BodyId;
use crate::models::event::DomainEvent;
use crate::models::resource::{Stockpile, add_stock, can_afford, empty_stockpile, subtract_stock};
use crate::models::structure::{ProductionBatch, StructureState};
use crate::sim::colony::{ByPriority, fits_pool, power_balance};
use crate::sim::reducer::WorldState;
use crate::sim::rules::Rules;

/// Advances production; batches in progress are written into the world, starts and completions are events.
pub fn update(world: &mut WorldState, rules: &Rules, dt: f64) -> Vec<DomainEvent> {
    let mut events: Vec<DomainEvent> = Vec::new();
    let mut stores: HashMap<BodyId, Stockpile> = HashMap::new();
    let mut efficiency: HashMap<BodyId, ByPriority> = HashMap::new();

    for i in 0..world.structures.len() {
        let s = &world.structures[i];
        if !s.is_working() {
            continue;
        }
        let Some(recipe_id) = s.recipe.clone() else { continue };
        let recipe = rules.recipe(&recipe_id);
        // Atanor recipes are made by the player's machine (AtanorSystem, AT4, A17), not in batches
        if recipe.atanor.is_some() {
            continue;
        }
        let eff_by = *efficiency.entry(s.body_id.clone()).or_insert_with(|| power_balance(world, rules, &s.body_id, false).efficiency);
        let spec = rules.spec(&s.kind, s.level);
        let speed = spec.output_factor * eff_by.get(spec.priority) * if s.state == StructureState::Upgrading { 0.5 } else { 1.0 };
        let produced = add_stock(&recipe.out, recipe.by.as_ref().unwrap_or(&empty_stockpile()), 1.0);
        let body_id = s.body_id.clone();
        let structure_id = s.id.clone();

        // Work this step, in minutes at full speed. A finished batch hands the rest of the step to the
        // next one, so output does not depend on the step size.
        let mut work = dt * speed;
        let mut batch: Option<ProductionBatch> = s.current_batch().cloned();
        let mut start_event: Option<usize> = None;
        let mut guard = 0;
        while guard < 16 && work > 1e-12 {
            guard += 1;
            if batch.is_none() {
                let pool = stores.get(&body_id).cloned().unwrap_or_else(|| world.storage_of(&body_id));
                if !can_afford(&pool, &recipe.inp) || !fits_pool(world, rules, &body_id, &pool, &produced) {
                    break;
                }
                stores.insert(body_id.clone(), subtract_stock(&pool, &recipe.inp));
                batch = Some(ProductionBatch { recipe: recipe.id.clone(), progress: 0.0 });
                events.push(DomainEvent::BatchStarted {
                    structure_id: structure_id.clone(),
                    recipe: recipe.id.clone(),
                    consumed: recipe.inp.clone(),
                    progress: Some(0.0),
                });
                start_event = Some(events.len() - 1);
            }
            let b = batch.as_mut().expect("batch set above");
            let need = (1.0 - b.progress) * recipe.time;
            if work + 1e-9 >= need {
                work -= need;
                events.push(DomainEvent::BatchCompleted {
                    structure_id: structure_id.clone(),
                    recipe: b.recipe.clone(),
                    produced: produced.clone(),
                });
                batch = None;
                start_event = None;
            } else {
                b.progress += work / recipe.time;
                work = 0.0;
            }
        }
        match (batch, start_event) {
            (Some(b), Some(idx)) => {
                if let DomainEvent::BatchStarted { progress, .. } = &mut events[idx] {
                    *progress = Some(b.progress);
                }
            }
            (Some(b), None) => world.structures[i].batch = Some(Some(b)),
            (None, _) => {}
        }
    }
    events
}
