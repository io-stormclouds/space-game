//! Canvas goals of the first session (`objectives.ts`): 01 scan, 02 choose the planet, 03 land and
//! build the port, 04 extract FER, SIL, KRI.

use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use super::reducer::{ScanState, WorldState};
use super::rules::Rules;
use super::scenario::Grids;
use crate::ids::tile_index_of;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ObjectiveId {
    Scan,
    Site,
    Port,
    Extract,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Objective {
    /// Key for the UI dictionary.
    pub id: ObjectiveId,
    pub done: bool,
    /// For `extract`: materials still without a working extractor.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub missing: Option<Vec<String>>,
}

/// Materials actually extracted on a body: what lies under each working extractor (a Kopalnia on a
/// Kupryt deposit extracts KUP, not FER), plus regolith for excavators on free tiles. In first-seen order.
pub fn extracted_materials(world: &WorldState, rules: &Rules, grids: &Grids, body_id: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    let Some(grid) = grids.get(body_id) else { return out };
    for s in &world.structures {
        if !s.is_working() || s.body_id != body_id {
            continue;
        }
        let ext = rules.extraction(&s.kind);
        if ext.is_empty() {
            continue;
        }
        let deposit = grid.tiles.get(tile_index_of(&s.tile_id)).and_then(|t| t.deposit.as_ref());
        // "Uruchom wydobycie" is a milestone: a deposit that ran dry still counts as started.
        let found = match deposit {
            Some(d) if ext.iter().any(|e| e.material == d.resource) => Some(d.resource.clone()),
            None if rules.extracts_anywhere(&s.kind).is_some() => Some("REG".to_string()),
            _ => None,
        };
        if let Some(m) = found
            && seen.insert(m.clone())
        {
            out.push(m);
        }
    }
    out
}

pub fn colony_objectives(world: &WorldState, rules: &Rules, grids: &Grids, materials: &[&str]) -> Vec<Objective> {
    let extracting = match &world.colony.site_body_id {
        Some(site) => extracted_materials(world, rules, grids, site),
        None => Vec::new(),
    };
    let missing: Vec<String> = materials.iter().filter(|m| !extracting.iter().any(|x| x == *m)).map(|m| m.to_string()).collect();
    let founded = world.colony.founded_at.is_some();
    vec![
        Objective { id: ObjectiveId::Scan, done: matches!(world.scan, ScanState::Done { .. }), missing: None },
        Objective { id: ObjectiveId::Site, done: world.colony.site_body_id.is_some(), missing: None },
        Objective { id: ObjectiveId::Port, done: founded, missing: None },
        Objective { id: ObjectiveId::Extract, done: founded && missing.is_empty(), missing: Some(missing) },
    ]
}

pub const DEFAULT_OBJECTIVE_MATERIALS: [&str; 3] = ["FER", "SIL", "KRI"];
