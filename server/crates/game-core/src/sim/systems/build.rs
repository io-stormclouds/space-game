//! Construction orders on surface tiles (`build-system.ts`). The only place build rules live.
//! Unified rules (doc 5.1, Z3, Z4): materials come from the body's own storage; a rover builds it
//! over the build time (construction); power and crew are reserved at the order; no level above the port.

use std::collections::HashSet;

use crate::ids::{BodyId, TileId, tile_id};
use crate::math::footprint::footprint_tiles;
use crate::math::js;
use crate::models::body::Atmosphere;
use crate::models::event::{DomainEvent, RejectReason};
use crate::models::grid::Tile;
use crate::models::resource::{Cost, add_stock, can_afford, empty_stockpile, format_cost, missing_for, scale_stock};
use crate::models::structure::{Structure, StructureState};
use crate::sim::colony::{crew_shortfall, level_ceiling, power_shortfall};
use crate::sim::reducer::WorldState;
use crate::sim::rules::Rules;
use crate::sim::scenario::Grids;

/// Share of the paid materials returned (doc 5.1): cancelled construction 75%, demolition 50%.
pub const CANCEL_REFUND: f64 = 0.75;
pub const DEMOLISH_REFUND: f64 = 0.5;

#[derive(Clone, Debug, PartialEq)]
pub struct Fail {
    pub reason: RejectReason,
    pub detail: Option<String>,
}

impl Fail {
    pub fn new(reason: RejectReason) -> Fail {
        Fail { reason, detail: None }
    }

    pub fn with(reason: RejectReason, detail: impl Into<String>) -> Fail {
        Fail { reason, detail: Some(detail.into()) }
    }

    pub fn event(self) -> DomainEvent {
        DomainEvent::CommandRejected { ship_id: None, reason: self.reason, detail: self.detail }
    }
}

/// `(Math.round(n × 10) / 10).toString().replace('.', ',')`
fn fmt(n: f64) -> String {
    js::number_to_string(js::round(n * 10.0) / 10.0).replace('.', ",")
}

/// Checks that do not depend on the tile: era, level cap, materials, power, crew, rover. Drives menu cards.
pub fn availability(world: &WorldState, rules: &Rules, body_id: &str, kind: &str, level: u32) -> Result<(), Fail> {
    if !rules.has(kind) {
        return Err(Fail::new(RejectReason::NotBuildable));
    }
    let spec = rules.spec(kind, level);
    if level == 1 && !rules.is_buildable(kind) {
        return Err(Fail::new(RejectReason::NotBuildable));
    }
    if level > spec.max_level {
        return Err(Fail::with(RejectReason::MaxLevel, format!("L{}", spec.max_level)));
    }
    let cap = level_ceiling(world, body_id);
    if level > cap && kind != "HQ" {
        return Err(Fail::with(RejectReason::LevelCap, format!("port L{cap}")));
    }
    if !world.rovers.iter().any(|r| r.body_id == body_id) {
        return Err(Fail::new(RejectReason::NoRover));
    }
    let store = world.storage_of(body_id);
    if !can_afford(&store, &spec.cost) {
        return Err(Fail::with(RejectReason::NoResources, format!("brakuje {}", format_cost(&missing_for(&store, &spec.cost)))));
    }
    let power = power_shortfall(world, rules, body_id, kind, level);
    if power > 0.0 {
        return Err(Fail::with(RejectReason::NoPower, format!("brakuje {} MW", fmt(power))));
    }
    let crew = crew_shortfall(world, rules, body_id, kind, level);
    if crew > 0.0 {
        return Err(Fail::with(RejectReason::NoCrew, format!("brakuje {} os.", js::number_to_string(crew.ceil()))));
    }
    Ok(())
}

/// Full check for one anchor tile: the footprint tiles when the building can go there.
pub fn check(
    world: &WorldState,
    grids: &Grids,
    rules: &Rules,
    body_id: &str,
    anchor: &str,
    kind: &str,
    rotation: i64,
) -> Result<Vec<TileId>, Fail> {
    let grid = grids.get(body_id);
    let tile = grid.and_then(|g| g.tile_by_id(anchor));
    let (Some(grid), Some(tile)) = (grid, tile) else { return Err(Fail::new(RejectReason::NoGrid)) };
    if !rules.has(kind) || !rules.is_buildable(kind) {
        return Err(Fail::new(RejectReason::NotBuildable));
    }
    let spec = rules.spec(kind, 1);
    let Some(indices) = footprint_tiles(grid, tile.index, spec.footprint, rotation) else {
        return Err(Fail::with(RejectReason::NoFootprint, format!("{} pól", spec.footprint)));
    };
    let tiles: Vec<TileId> = indices.iter().map(|&i| tile_id(body_id, i)).collect();
    let occupied: HashSet<&str> =
        world.structures.iter().filter(|s| s.body_id == body_id).flat_map(|s| s.tiles.iter().map(|t| t.as_str())).collect();
    if tiles.iter().any(|t| occupied.contains(t.as_str())) {
        return Err(Fail::new(RejectReason::TileOccupied));
    }
    if let Some(fail) = deposit_check(world, rules, tile, kind) {
        return Err(fail);
    }
    if spec.needs_atmosphere {
        let body = world.body(body_id);
        if body.and_then(|b| b.atmosphere) != Some(Atmosphere::Dense) {
            return Err(Fail::new(RejectReason::NoAtmosphere));
        }
    }
    availability(world, rules, body_id, kind, 1)?;
    Ok(tiles)
}

/// Returns CONSTRUCTION_ORDERED (materials taken from the body's storage) or COMMAND_REJECTED.
#[allow(clippy::too_many_arguments)] // mirrors `BuildSystem.build` of the TS domain
pub fn build(
    world: &WorldState,
    grids: &Grids,
    rules: &Rules,
    body_id: &str,
    anchor: &str,
    kind: &str,
    time: f64,
    rotation: i64,
) -> DomainEvent {
    match check(world, grids, rules, body_id, anchor, kind, rotation) {
        Err(fail) => fail.event(),
        Ok(tiles) => {
            let cost = rules.spec(kind, 1).cost.clone();
            DomainEvent::ConstructionOrdered { structure: site(rules, kind, body_id, tiles, cost.clone(), time), cost, from_ship_id: None }
        }
    }
}

/// A new construction site at level 0.
pub fn site(rules: &Rules, kind: &str, body_id: &str, tiles: Vec<TileId>, cost: Cost, time: f64) -> Structure {
    let recipe = rules.processes(kind).first().map(|r| r.id.clone());
    Structure {
        id: format!("{kind}@{}", tiles[0]),
        kind: kind.to_string(),
        body_id: body_id.to_string(),
        tile_id: tiles[0].clone(),
        tiles,
        level: 0,
        target_level: 1,
        state: StructureState::Planned,
        progress: 0.0,
        paid: cost,
        built_at: time,
        batch: if recipe.is_some() { Some(None) } else { None },
        recipe,
    }
}

/// Upgrade in place (doc 5.1): it keeps working at 50% while a rover builds the next level.
pub fn upgrade(world: &WorldState, rules: &Rules, structure_id: &str) -> DomainEvent {
    let Some(s) = world.structure(structure_id) else { return DomainEvent::rejected(RejectReason::NoStructure) };
    if s.state != StructureState::Active {
        return DomainEvent::rejected(RejectReason::Busy);
    }
    let next = s.level + 1;
    if let Err(fail) = availability(world, rules, &s.body_id, &s.kind, next) {
        return fail.event();
    }
    DomainEvent::UpgradeOrdered { structure_id: structure_id.to_string(), cost: rules.spec(&s.kind, next).cost.clone() }
}

/// Cancels a construction or an upgrade, returning 75% of what it cost.
pub fn cancel(world: &WorldState, structure_id: &str) -> DomainEvent {
    let Some(s) = world.structure(structure_id) else { return DomainEvent::rejected(RejectReason::NoStructure) };
    if s.state == StructureState::Active {
        return DomainEvent::rejected(RejectReason::Busy);
    }
    DomainEvent::ConstructionCancelled { structure_id: structure_id.to_string(), refund: scale_stock(&s.paid, CANCEL_REFUND) }
}

/// Demolishes a working building, returning 50% of the materials of all its levels.
pub fn demolish(world: &WorldState, rules: &Rules, structure_id: &str) -> DomainEvent {
    let Some(s) = world.structure(structure_id) else { return DomainEvent::rejected(RejectReason::NoStructure) };
    if s.state != StructureState::Active || s.kind == "HQ" {
        return DomainEvent::rejected(RejectReason::Busy);
    }
    let mut spent: Cost = empty_stockpile();
    for l in 1..=s.level {
        spent = add_stock(&spent, &rules.spec(&s.kind, l).cost, 1.0);
    }
    DomainEvent::StructureDemolished { structure_id: structure_id.to_string(), refund: scale_stock(&spent, DEMOLISH_REFUND) }
}

fn deposit_check(world: &WorldState, rules: &Rules, tile: &Tile, kind: &str) -> Option<Fail> {
    let extraction = rules.extraction(kind);
    if extraction.is_empty() {
        return None;
    }
    if rules.extracts_anywhere(kind).is_some() {
        return if tile.deposit.is_some() { Some(Fail::with(RejectReason::NoDeposit, "wymaga pola bez złoża")) } else { None };
    }
    let remaining = world.deposits.get(&tile.id).copied().unwrap_or(0.0);
    let matches = tile.deposit.as_ref().map(|d| extraction.iter().any(|e| e.material == d.resource)).unwrap_or(false);
    if matches && remaining > 0.0 {
        return None;
    }
    let names: Vec<String> = extraction.iter().map(|e| rules.material_name(&e.material)).collect();
    Some(Fail::with(RejectReason::NoDeposit, format!("wymaga złoża: {}", names.join(", "))))
}

/// Tiles of the footprint a kind would cover at an anchor (for the placement ghost), empty when it
/// does not fit.
pub fn footprint_of(grids: &Grids, rules: &Rules, body_id: &BodyId, tile_index: usize, kind: &str, rotation: i64) -> Vec<usize> {
    let Some(grid) = grids.get(body_id) else { return Vec::new() };
    let size = if rules.has(kind) { rules.spec(kind, 1).footprint } else { 1 };
    footprint_tiles(grid, tile_index, size, rotation).unwrap_or_default()
}
