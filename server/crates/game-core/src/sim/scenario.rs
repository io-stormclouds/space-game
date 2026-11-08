//! A starting world as data (`scenario.ts`; W06: the world is data, scenarios are presets).

use std::collections::{HashMap, HashSet};

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

use super::constants::{GAME_CONSTANTS, GameConstants};
use super::reducer::{ColonyState, ScanState, WorldState};
use super::rules::{RuleOverrides, Rules};
use crate::ids::{BodyId, tile_id};
use crate::math::footprint::footprint_tiles;
use crate::math::goldberg::build_goldberg_grid;
use crate::math::vec3::Vec3;
use crate::models::body::CelestialBody;
use crate::models::grid::{PlanetGrid, Tile};
use crate::models::resource::{Cost, Stockpile, empty_stockpile};
use crate::models::rover::Rover;
use crate::models::ship::Spacecraft;
use crate::models::structure::{Structure, StructureState};

/// Surface grids of the bodies that have one, in body order.
pub type Grids = IndexMap<BodyId, PlanetGrid>;

/// Numbers of the colonisation flow (`colony-system.ts` `ColonizationParams`).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ColonizationParams {
    /// Passive scan of the system [min] (canvas: "Skan pasywny: 5 obiektów · 15 min").
    pub scan_minutes: f64,
    /// Port L1 [canvas: STA 120 · BET 80 · UKL 10 · 12 min].
    pub port_cost: Cost,
    pub port_build_minutes: f64,
    /// Rovers the shuttle lands with the port (canvas: 2 on board).
    pub landed_rovers: i64,
    /// Proposal: one shuttle trip carries this much [j.].
    pub shuttle_capacity: f64,
    /// Proposal: one-way trip [min]; the shuttle is back after twice this.
    pub shuttle_trip_minutes: f64,
}

/// Same numbers for every scenario unless it overrides them.
pub fn default_colonization() -> ColonizationParams {
    ColonizationParams {
        scan_minutes: 15.0,
        port_cost: crate::models::resource::qty([("STA", 120.0), ("BET", 80.0), ("UKL", 10.0)]),
        port_build_minutes: 12.0,
        landed_rovers: 2,
        shuttle_capacity: 250.0,
        shuttle_trip_minutes: 6.0,
    }
}

pub type StructuresFn = fn(&Grids, &Rules) -> Vec<Structure>;
pub type RoversFn = fn(&Grids, &[Structure]) -> Vec<Rover>;

#[derive(Clone)]
pub struct Scenario {
    pub id: String,
    pub name: String,
    pub bodies: Vec<CelestialBody>,
    pub ships: Vec<Spacecraft>,
    /// Structures standing at t = 0, placed deterministically on the grids.
    pub structures: StructuresFn,
    /// Rovers at t = 0.
    pub rovers: RoversFn,
    pub storage: IndexMap<BodyId, Stockpile>,
    pub overrides: Option<RuleOverrides>,
    pub colonization: ColonizationParams,
    pub constants: GameConstants,
    /// Whether the system scan has been done at t = 0.
    pub scanned: bool,
}

impl std::fmt::Debug for Scenario {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Scenario").field("id", &self.id).field("bodies", &self.bodies.len()).finish()
    }
}

pub fn scenario_constants(s: &Scenario) -> GameConstants {
    s.constants
}

pub fn no_structures(_: &Grids, _: &Rules) -> Vec<Structure> {
    Vec::new()
}

pub fn no_rovers(_: &Grids, _: &[Structure]) -> Vec<Rover> {
    Vec::new()
}

/// Surface grids of every body that has one (deterministic).
pub fn build_world_grids(bodies: &[CelestialBody]) -> Grids {
    bodies
        .iter()
        .filter_map(|b| {
            b.surface_grid
                .as_ref()
                .map(|g| (b.id.clone(), build_goldberg_grid(&b.id, b.radius, g.frequency, g.deposit_seed, g.deposit_weights.as_ref())))
        })
        .collect()
}

pub fn create_world(s: &Scenario, grids: &Grids, rules: &Rules) -> WorldState {
    let structures = (s.structures)(grids, rules);
    let mut deposits = IndexMap::new();
    for grid in grids.values() {
        for t in &grid.tiles {
            if let Some(d) = &t.deposit {
                deposits.insert(t.id.clone(), d.amount);
            }
        }
    }
    let rovers = (s.rovers)(grids, &structures);
    WorldState {
        time: 0.0,
        bodies: s.bodies.clone(),
        ships: s.ships.clone(),
        storage: s.storage.clone(),
        structures,
        deposits,
        rovers,
        scan: if s.scanned { ScanState::Done { at: 0.0 } } else { ScanState::None },
        colony: ColonyState { site_body_id: None, founded_at: None },
        shuttles: Vec::new(),
        vehicle_orders: Vec::new(),
        next_id: 0,
        machines: None,
    }
}

/// A structure that already works at t = 0.
pub fn standing_structure(kind: &str, body_id: &str, tiles: &[usize], level: u32) -> Structure {
    let ids: Vec<String> = tiles.iter().map(|&i| tile_id(body_id, i)).collect();
    Structure {
        id: format!("{kind}@{}", ids[0]),
        kind: kind.to_string(),
        body_id: body_id.to_string(),
        tile_id: ids[0].clone(),
        tiles: ids,
        level,
        target_level: level,
        state: StructureState::Active,
        progress: 0.0,
        paid: empty_stockpile(),
        built_at: 0.0,
        recipe: None,
        batch: None,
    }
}

/// The tile closest to the body's local +Y: where the home landing pad goes.
pub fn top_tile(grid: &PlanetGrid) -> &Tile {
    grid.tiles.iter().fold(&grid.tiles[0], |best, t| if t.normal.y > best.normal.y { t } else { best })
}

/// First place near the top of the grid, at least `min_ring` steps from the top tile, where a
/// footprint of `size` fits on free tiles without deposits. Deterministic.
pub fn find_free_footprint(grid: &PlanetGrid, size: usize, taken: &HashSet<usize>, min_ring: usize) -> Option<Vec<usize>> {
    let top = top_tile(grid).index;
    let mut ring: HashMap<usize, usize> = HashMap::from([(top, 0)]);
    let mut queue = vec![top];
    let mut q = 0;
    while q < queue.len() {
        let cur = queue[q];
        q += 1;
        for &n in &grid.tiles[cur].neighbors {
            if ring.contains_key(&n) {
                continue;
            }
            ring.insert(n, ring[&cur] + 1);
            queue.push(n);
        }
    }
    let mut order: Vec<&Tile> = grid.tiles.iter().collect();
    order.sort_by(|a, b| {
        ring[&a.index].cmp(&ring[&b.index]).then_with(|| b.normal.y.partial_cmp(&a.normal.y).unwrap_or(std::cmp::Ordering::Equal))
    });
    for t in order {
        if ring[&t.index] < min_ring {
            continue;
        }
        for r in 0..t.neighbors.len() {
            if let Some(tiles) = footprint_tiles(grid, t.index, size, r as i64)
                && tiles.iter().all(|&i| !taken.contains(&i) && grid.tiles[i].deposit.is_none())
            {
                return Some(tiles);
            }
        }
    }
    None
}

/// Docking point for a landing pad tile: tile centre lifted along its normal.
pub fn pad_docking_offset(grid: &PlanetGrid, tile: &Tile, pad_lift_factor: f64) -> Vec3 {
    tile.normal.scale(grid.radius * (1.0 + pad_lift_factor))
}

pub fn default_pad_docking_offset(grid: &PlanetGrid, tile: &Tile) -> Vec3 {
    pad_docking_offset(grid, tile, GAME_CONSTANTS.pad_lift_factor)
}

/// Landing pad tile of a body (the first LAND built), if it has one. The port is not a docking
/// point: the mothership stays in orbit.
pub fn landing_pad_tile_of<'a>(grids: &'a Grids, structures: &[Structure], body_id: &str) -> Option<&'a Tile> {
    let grid = grids.get(body_id)?;
    let pad = structures.iter().find(|s| s.body_id == body_id && s.kind == "LAND" && s.level > 0)?;
    grid.tiles.iter().find(|t| t.id == pad.tile_id)
}
