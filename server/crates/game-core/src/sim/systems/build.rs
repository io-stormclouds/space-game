//! Construction orders on surface tiles (`build-system.ts`). The only place build rules live.
//! Unified rules (doc 5.1, Z3, Z4): materials come from the body's own storage; a rover builds it
//! over the build time (construction); power and crew are reserved at the order; no level above the port.

use std::collections::HashSet;

use crate::ids::{BodyId, TileId, tile_id};
use crate::math::footprint::footprint_tiles;
use crate::math::js;
use crate::models::body::Atmosphere;
use crate::models::event::{DomainEvent, RejectReason};
use crate::models::grid::{PlanetGrid, Tile};
use crate::models::resource::{Cost, add_stock, can_afford, empty_stockpile, format_cost, missing_for, scale_stock};
use crate::models::structure::{Structure, StructureState};
use crate::sim::colony::{crew_shortfall, level_ceiling, power_shortfall};
use crate::sim::reducer::WorldState;
use crate::sim::rules::Rules;
use crate::sim::scenario::Grids;
use crate::sim::terrain_rules::{scale_cost, site_terrain};

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

/// Terrain-adjusted price of a site (T8): the materials the order takes and the construction time in
/// % of the catalog time.
#[derive(Clone, Debug, PartialEq)]
pub struct SitePrice {
    pub cost: Cost,
    pub time_pct: u32,
}

/// A passed BUILD check: the footprint tiles (anchor first) and the price on this terrain.
#[derive(Clone, Debug, PartialEq)]
pub struct BuildCheck {
    pub tiles: Vec<TileId>,
    pub price: SitePrice,
}

/// A failed check. Past the terrain stage (the footprint fits on free, buildable tiles) it carries the
/// price, also when a later stage rejects (NO_DEPOSIT, NO_ATMOSPHERE, NO_RESOURCES, NO_POWER…), so the
/// placement ghost can show it.
#[derive(Clone, Debug, PartialEq)]
pub struct CheckFail {
    pub fail: Fail,
    pub price: Option<SitePrice>,
}

impl From<Fail> for CheckFail {
    fn from(fail: Fail) -> CheckFail {
        CheckFail { fail, price: None }
    }
}

impl CheckFail {
    fn priced(fail: Fail, price: &SitePrice) -> CheckFail {
        CheckFail { fail, price: Some(price.clone()) }
    }
}

/// Checks that do not depend on the tile: era, level cap, materials, power, crew, rover. Drives menu cards.
pub fn availability(world: &WorldState, rules: &Rules, body_id: &str, kind: &str, level: u32) -> Result<(), Fail> {
    availability_with(world, rules, body_id, kind, level, None)
}

/// `availability` with `cost` in place of the catalog cost in the materials check (the
/// terrain-adjusted cost of a site), so NO_RESOURCES stays ahead of NO_POWER and NO_CREW.
pub fn availability_with(
    world: &WorldState,
    rules: &Rules,
    body_id: &str,
    kind: &str,
    level: u32,
    cost: Option<&Cost>,
) -> Result<(), Fail> {
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
    let need = cost.unwrap_or(&spec.cost);
    if !can_afford(&store, need) {
        return Err(Fail::with(RejectReason::NoResources, format!("brakuje {}", format_cost(&missing_for(&store, need)))));
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

/// Terrain stage of a check: BAD_TERRAIN (detail = the class name) when a footprint tile cannot be
/// built on, else the price of the site on this terrain (`base` scaled by the footprint's cost %).
pub fn terrain_price(grid: &PlanetGrid, indices: &[usize], rules: &Rules, base: &Cost) -> Result<SitePrice, Fail> {
    let terrain = rules.terrain();
    let site = site_terrain(grid, indices, terrain);
    if !site.buildable {
        let name = site.bad_kind.map(|k| terrain.kinds.get(k).name.clone()).unwrap_or_default();
        return Err(Fail::with(RejectReason::BadTerrain, name));
    }
    Ok(SitePrice { cost: scale_cost(base, site.cost_pct), time_pct: site.time_pct })
}

/// Full check for one anchor tile: the footprint tiles and the price when the building can go there.
/// Order (the same in TS): NO_GRID → NOT_BUILDABLE → NO_FOOTPRINT → TILE_OCCUPIED → BAD_TERRAIN →
/// NO_DEPOSIT → NO_ATMOSPHERE → availability with the terrain cost.
pub fn check(
    world: &WorldState,
    grids: &Grids,
    rules: &Rules,
    body_id: &str,
    anchor: &str,
    kind: &str,
    rotation: i64,
) -> Result<BuildCheck, CheckFail> {
    let grid = grids.get(body_id);
    let tile = grid.and_then(|g| g.tile_by_id(anchor));
    let (Some(grid), Some(tile)) = (grid, tile) else { return Err(Fail::new(RejectReason::NoGrid).into()) };
    if !rules.has(kind) || !rules.is_buildable(kind) {
        return Err(Fail::new(RejectReason::NotBuildable).into());
    }
    let spec = rules.spec(kind, 1);
    let Some(indices) = footprint_tiles(grid, tile.index, spec.footprint, rotation) else {
        return Err(Fail::with(RejectReason::NoFootprint, format!("{} pól", spec.footprint)).into());
    };
    let tiles: Vec<TileId> = indices.iter().map(|&i| tile_id(body_id, i)).collect();
    let occupied: HashSet<&str> =
        world.structures.iter().filter(|s| s.body_id == body_id).flat_map(|s| s.tiles.iter().map(|t| t.as_str())).collect();
    if tiles.iter().any(|t| occupied.contains(t.as_str())) {
        return Err(Fail::new(RejectReason::TileOccupied).into());
    }
    let price = terrain_price(grid, &indices, rules, &spec.cost)?;
    if let Some(fail) = deposit_check(world, rules, tile, kind) {
        return Err(CheckFail::priced(fail, &price));
    }
    if spec.needs_atmosphere {
        let body = world.body(body_id);
        if body.and_then(|b| b.atmosphere) != Some(Atmosphere::Dense) {
            return Err(CheckFail::priced(Fail::new(RejectReason::NoAtmosphere), &price));
        }
    }
    if let Err(fail) = availability_with(world, rules, body_id, kind, 1, Some(&price.cost)) {
        return Err(CheckFail::priced(fail, &price));
    }
    Ok(BuildCheck { tiles, price })
}

/// Returns CONSTRUCTION_ORDERED (terrain-adjusted materials taken from the body's storage) or COMMAND_REJECTED.
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
        Err(f) => f.fail.event(),
        Ok(BuildCheck { tiles, price }) => DomainEvent::ConstructionOrdered {
            structure: site(rules, kind, body_id, tiles, price.cost.clone(), time, price.time_pct),
            cost: price.cost,
            from_ship_id: None,
        },
    }
}

/// A new construction site at level 0; `time_pct` (terrain, % of the catalog time) is stored only when ≠ 100.
pub fn site(rules: &Rules, kind: &str, body_id: &str, tiles: Vec<TileId>, cost: Cost, time: f64, time_pct: u32) -> Structure {
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
        time_pct: if time_pct != 100 { Some(time_pct) } else { None },
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
