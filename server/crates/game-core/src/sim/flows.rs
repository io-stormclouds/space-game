//! Rates a body should reach by the economy document (`flows.ts`): catalog rate × level factor of
//! every working building, at full power, with free storage and no upgrade in progress.

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

use super::colony::{ByPriority, power_balance};
use super::reducer::WorldState;
use super::rules::Rules;
use super::scenario::Grids;
use crate::ids::tile_index_of;
use crate::math::js;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct NominalFlows {
    /// Units per model minute, by material.
    pub extraction: IndexMap<String, f64>,
    pub production: IndexMap<String, f64>,
    pub consumption: IndexMap<String, f64>,
    /// Working buildings by kind.
    pub buildings: IndexMap<String, f64>,
    /// Power efficiency of the body now, by priority (1 = full power).
    pub efficiency: ByPriority,
}

fn add(to: &mut IndexMap<String, f64>, id: &str, q: f64) {
    let cur = to.get(id).copied().unwrap_or(0.0);
    to.insert(id.to_string(), js::round((cur + q) * 1000.0) / 1000.0);
}

pub fn nominal_flows(world: &WorldState, rules: &Rules, grids: &Grids, body_id: &str) -> NominalFlows {
    let mut out = NominalFlows {
        extraction: IndexMap::new(),
        production: IndexMap::new(),
        consumption: IndexMap::new(),
        buildings: IndexMap::new(),
        efficiency: power_balance(world, rules, body_id, false).efficiency,
    };
    let grid = grids.get(body_id);
    for s in &world.structures {
        if s.body_id != body_id || !s.is_working() {
            continue;
        }
        *out.buildings.entry(s.kind.clone()).or_insert(0.0) += 1.0;
        let spec = rules.spec(&s.kind, s.level);
        let extraction = rules.extraction(&s.kind);
        if let (false, Some(grid)) = (extraction.is_empty(), grid) {
            let tile = grid.tiles.get(tile_index_of(&s.tile_id));
            let deposit = tile.and_then(|t| t.deposit.as_ref());
            let anywhere = rules.extracts_anywhere(&s.kind);
            let ext = match (anywhere, deposit) {
                (Some(a), None) => Some(a),
                _ => extraction.iter().find(|e| deposit.map(|d| d.resource == e.material).unwrap_or(false)),
            };
            let depleted = deposit.is_some() && world.deposits.get(&s.tile_id).copied().unwrap_or(0.0) <= 0.0;
            if let Some(ext) = ext
                && !depleted
            {
                add(&mut out.extraction, &ext.material, ext.rate * spec.output_factor);
            }
        }
        if let Some(recipe) = &s.recipe {
            let r = rules.recipe(recipe);
            let per_min = spec.output_factor / r.time;
            let mut outputs = r.out.clone();
            if let Some(by) = &r.by {
                for (id, q) in by {
                    outputs.insert(id.clone(), *q);
                }
            }
            for (id, q) in &outputs {
                add(&mut out.production, id, q * per_min);
            }
            for (id, q) in &r.inp {
                add(&mut out.consumption, id, q * per_min);
            }
        }
    }
    out
}
