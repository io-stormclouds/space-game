//! The 3D PoC world: test preset "Planeta Matka" (W06 A). Time unit = model minute (Z6), so the
//! PoC's numbers are unchanged: an orbit period of 240 is 240 min, the ship flies 150 units/min.
//! (`config/initial-world.ts`, `scenarios/poc.ts`)

use std::collections::HashSet;
use std::f64::consts::PI;

use indexmap::IndexMap;

use crate::models::body::{Atmosphere, BodyKind, CelestialBody, Shape, SurfaceGrid};
use crate::models::resource::{Stockpile, empty_stockpile, qty};
use crate::models::rover::{Rover, RoverState};
use crate::models::ship::{ShipRole, ShipState, Spacecraft};
use crate::models::structure::Structure;
use crate::models::terrain::{TerrainBiome, TerrainConfig, TerrainGround};
use crate::sim::constants::GAME_CONSTANTS;
use crate::sim::rules::Rules;
use crate::sim::scenario::{Grids, Scenario, default_colonization, find_free_footprint, standing_structure, top_tile};

pub const SUN_ID: &str = "sun";
pub const PLANET_ID: &str = "planet";
pub const MOON_ID: &str = "moon";
pub const ASTEROID_ID: &str = "asteroid";
pub const SHIP_ID: &str = "ship-1";
pub const ROVER_ID: &str = "rover-1";

/// What the colony starts with: enough for one extractor and one habitat without a dependency loop.
pub fn initial_stockpile() -> Stockpile {
    qty([("FER", 40.0), ("KRI", 10.0), ("SIL", 20.0)])
}

pub fn initial_bodies() -> Vec<CelestialBody> {
    let two_pi = PI * 2.0;
    let mut sun = CelestialBody::base(SUN_ID, "Słońce", BodyKind::Star, 60.0, None, 0xffd36a);
    sun.luminosity = Some(1.0);

    let mut planet = CelestialBody::base(PLANET_ID, "Planeta Matka", BodyKind::Planet, 50.0, Some(SUN_ID), 0x3b82f6);
    planet.orbit_radius = 900.0;
    planet.orbit_speed = two_pi / 240.0;
    planet.is_home_base = true;
    // hex-kit terrain (T-25): the PoC showcase style; the dry landing cap (n.y > 0.9: the top tile, two
    // rings and part of the third) keeps the standing pad, panel and port of the preset off a lake, where
    // they stood before T5 (it dries two lakes of mixed/7 under the port)
    planet.surface_grid = Some(SurfaceGrid {
        frequency: 8,
        deposit_seed: Some(11.0),
        deposit_weights: None,
        terrain: Some(TerrainConfig { landing_cap: Some(0.9), ..TerrainConfig::new(TerrainBiome::Mixed, 7.0) }),
    });
    planet.atmosphere = Some(Atmosphere::Dense);

    let mut moon = CelestialBody::base(MOON_ID, "Księżyc", BodyKind::Moon, 15.0, Some(PLANET_ID), 0x9ca3af);
    moon.orbit_radius = 160.0;
    moon.orbit_speed = two_pi / 40.0;
    moon.initial_angle = PI / 2.0;
    moon.surface_grid = Some(SurfaceGrid {
        frequency: 3,
        deposit_seed: Some(23.0),
        deposit_weights: None,
        terrain: Some(TerrainConfig { ground: Some(TerrainGround::Regolith), ..TerrainConfig::new(TerrainBiome::Dry, 8.0) }),
    });

    let mut asteroid = CelestialBody::base(ASTEROID_ID, "Asteroida", BodyKind::Asteroid, 12.0, Some(SUN_ID), 0xb45309);
    asteroid.orbit_radius = 1500.0;
    asteroid.orbit_speed = two_pi / 600.0;
    asteroid.initial_angle = PI / 3.0;
    asteroid.resources = Some(qty([("FER", 500.0)]));
    asteroid.shape = Some(Shape { seed: 7.0, roughness: 0.3 });

    vec![sun, planet, moon, asteroid]
}

pub fn initial_ships() -> Vec<Spacecraft> {
    vec![Spacecraft {
        id: SHIP_ID.to_string(),
        name: "Astraeus-1".to_string(),
        role: ShipRole::Ship,
        fuel: 100.0,
        max_fuel: 100.0,
        cargo: empty_stockpile(),
        max_cargo: 50.0,
        state: ShipState::Docked,
        current_body_id: Some(PLANET_ID.to_string()),
        target_body_id: None,
        transfer: None,
        onboard: None,
    }]
}

/// The rover starts on the home planet's landing pad; its tile is resolved by the scenario.
pub fn initial_rover(tile_index: usize) -> Rover {
    Rover {
        id: ROVER_ID.to_string(),
        name: "Łazik R-1".to_string(),
        body_id: PLANET_ID.to_string(),
        tile_index,
        state: RoverState::Idle,
        path: Vec::new(),
        job: None,
    }
}

fn poc_structures(grids: &Grids, rules: &Rules) -> Vec<Structure> {
    let Some(grid) = grids.get(PLANET_ID) else { return Vec::new() };
    let pad = top_tile(grid);
    let solar = pad.neighbors.iter().copied().find(|&n| grid.tiles[n].deposit.is_none()).unwrap_or(pad.neighbors[0]);
    let taken: HashSet<usize> = HashSet::from([pad.index, solar]);
    let hq = find_free_footprint(grid, rules.spec("HQ", 1).footprint, &taken, 3);
    let mut out = vec![standing_structure("LAND", PLANET_ID, &[pad.index], 1), standing_structure("SOL", PLANET_ID, &[solar], 1)];
    if let Some(hq) = hq {
        out.push(standing_structure("HQ", PLANET_ID, &hq, 1));
    }
    out
}

fn poc_rovers(grids: &Grids, _: &[Structure]) -> Vec<Rover> {
    match grids.get(PLANET_ID) {
        Some(grid) => vec![initial_rover(top_tile(grid).index)],
        None => Vec::new(),
    }
}

/// Test preset "Planeta Matka" (W06 A): the 3D PoC world, where the ported PoC tests run.
/// Unified rule: the economy doc starts era E0 with the port (HQ) L1 standing, so the preset has one
/// (it provides 5 MW, living space for 5 and storage); the PoC had only the landing pad and the panel.
pub fn poc_scenario() -> Scenario {
    Scenario {
        id: "planeta-matka".to_string(),
        name: "Planeta Matka (preset PoC)".to_string(),
        bodies: initial_bodies(),
        ships: initial_ships(),
        structures: poc_structures,
        rovers: poc_rovers,
        storage: IndexMap::from([(PLANET_ID.to_string(), initial_stockpile())]),
        overrides: None,
        colonization: default_colonization(),
        constants: GAME_CONSTANTS,
        scanned: true,
    }
}

/// Id of the PoC landing pad (top tile of the planet).
pub fn poc_pad_id(grid: &crate::models::grid::PlanetGrid) -> String {
    format!("LAND@{}", crate::ids::tile_id(PLANET_ID, top_tile(grid).index))
}
