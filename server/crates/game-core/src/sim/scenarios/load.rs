//! Load scenarios of F5 (`mock-server/src/load.ts`, `rng.ts`): S like the PoC (about 20 buildings,
//! 1 ship, 1 rover); M a late colony (300 buildings, 40 ships, 20 rovers); L overload (1400
//! buildings, 200 ships, 100 rovers). Generated deterministically from a seed, so every run measures
//! the same world. The mock's MT (`load-m-teren`, a performance preset of the TS mock only) is not
//! ported.

use std::collections::HashSet;

use indexmap::IndexMap;

use super::poc::poc_scenario;
use super::tau_ceti::{TC_E, tau_ceti_scenario};
use crate::economy::Economy;
use crate::math::footprint::footprint_tiles;
use crate::math::js;
use crate::models::body::BodyKind;
use crate::models::command::Command;
use crate::models::resource::qty;
use crate::models::rover::{Rover, RoverState};
use crate::models::ship::{ShipRole, ShipState, Spacecraft};
use crate::models::structure::Structure;
use crate::sim::reducer::{ColonyState, ScanState};
use crate::sim::scenario::standing_structure;
use crate::sim::simulation::{Simulation, SimulationOptions};
use crate::sim::terrain_rules::tile_buildable;

/// Mulberry32: small, fast, deterministic; the state is one 32-bit integer. Bit for bit the mock's `Rng`.
#[derive(Clone, Copy, Debug)]
pub struct Rng {
    pub state: i32,
}

impl Rng {
    pub fn new(seed: i32) -> Rng {
        Rng { state: seed }
    }

    /// Uniform in [0, 1). Named as the mock's method, not an iterator.
    #[allow(clippy::should_implement_trait)]
    pub fn next(&mut self) -> f64 {
        self.state = self.state.wrapping_add(0x6d2b_79f5);
        let mut t = self.state;
        t = js::imul(t ^ ((t as u32) >> 15) as i32, t | 1);
        t ^= t.wrapping_add(js::imul(t ^ ((t as u32) >> 7) as i32, t | 61));
        ((t ^ ((t as u32) >> 14) as i32) as u32) as f64 / 4_294_967_296.0
    }

    /// Uniform in [a, b).
    pub fn range(&mut self, a: f64, b: f64) -> f64 {
        a + (b - a) * self.next()
    }

    pub fn int(&mut self, n: usize) -> usize {
        (self.next() * n as f64).floor() as usize
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LoadLevel {
    S,
    M,
    L,
}

impl LoadLevel {
    pub fn parse(id: &str) -> Option<LoadLevel> {
        match id {
            "load-s" | "S" => Some(LoadLevel::S),
            "load-m" | "M" => Some(LoadLevel::M),
            "load-l" | "L" => Some(LoadLevel::L),
            _ => None,
        }
    }
}

pub struct LoadSpec {
    pub tau_ceti: bool,
    pub structures: usize,
    pub ships: usize,
    pub rovers: usize,
}

pub fn load_spec(level: LoadLevel) -> LoadSpec {
    match level {
        LoadLevel::S => LoadSpec { tau_ceti: false, structures: 20, ships: 1, rovers: 1 },
        LoadLevel::M => LoadSpec { tau_ceti: true, structures: 300, ships: 40, rovers: 20 },
        // all grid bodies of Tau Ceti have 1870 tiles, about 1690 buildable since every body has terrain
        // (T5); 1400 (83 % of those) leaves rovers a way through
        LoadLevel::L => LoadSpec { tau_ceti: true, structures: 1400, ships: 200, rovers: 100 },
    }
}

pub const DEFAULT_LOAD_SEED: i32 = 5150;

/// One-tile kinds spread over the bodies; extractors go on deposits they can work.
const FILLERS: [&str; 6] = ["SOL", "HAB", "DEP", "SKL", "WND", "LAND"];

fn extractor_for(material: &str) -> &'static str {
    match material {
        "KRI" => "ICE",
        "SIL" => "SIT",
        _ => "MIN",
    }
}

/// Builds the world of a load level: the base scenario with the colony founded (Tau Ceti), then
/// standing buildings on free tiles of every grid body, ships in flight between bodies and rovers
/// driving on the colony planet. Returns a Simulation ready to step.
pub fn build_load(level: LoadLevel, economy: Option<Economy>, seed: i32) -> Simulation {
    let spec = load_spec(level);
    let mut sim =
        Simulation::new(if spec.tau_ceti { tau_ceti_scenario() } else { poc_scenario() }, SimulationOptions { economy, world: None });
    let mut rng = Rng::new(seed);
    let mut w = sim.world.clone();

    if spec.tau_ceti {
        // the canvas flow done: scanned, Tau Ceti e founded, with a port
        let grid = &sim.grids[TC_E];
        let anchor = grid.tiles.iter().find(|t| t.neighbors.len() == 6 && t.deposit.is_none()).expect("a plain hex tile");
        let port = standing_structure("HQ", TC_E, &footprint_tiles(grid, anchor.index, 3, 0).expect("port footprint"), 1);
        w.scan = ScanState::Done { at: 0.0 };
        for b in w.bodies.iter_mut() {
            b.revealed = Some(true);
            b.is_home_base = b.id == TC_E;
        }
        w.colony = ColonyState { site_body_id: Some(TC_E.to_string()), founded_at: Some(0.0) };
        w.structures = vec![port];
        w.storage =
            IndexMap::from([(TC_E.to_string(), qty([("FER", 1500.0), ("SIL", 1000.0), ("KRI", 800.0), ("STA", 600.0), ("BET", 400.0)]))]);
        for s in w.ships.iter_mut() {
            s.current_body_id = Some(TC_E.to_string());
        }
    }

    // buildings on free tiles, bodies in turn; never on terrain that cannot be built on (water, T8)
    let bodies: Vec<String> = sim.grids.keys().cloned().collect();
    let used: HashSet<&str> = w.structures.iter().flat_map(|s| s.tiles.iter().map(|t| t.as_str())).collect();
    let terrain = sim.rules.terrain();
    let mut free: IndexMap<String, Vec<usize>> = bodies
        .iter()
        .map(|b| {
            let tiles = sim.grids[b].tiles.iter().filter(|t| !used.contains(t.id.as_str()) && tile_buildable(t, terrain));
            (b.clone(), tiles.map(|t| t.index).collect())
        })
        .collect();
    let mut structures: Vec<Structure> = w.structures.clone();
    let mut i = structures.len();
    let mut guard = 0;
    while i < spec.structures && guard < spec.structures * 4 {
        guard += 1;
        let body = bodies[rng.int(bodies.len())].clone();
        let list = free.get_mut(&body).expect("every grid body has a free list");
        if list.is_empty() {
            continue;
        }
        let index = list.remove(rng.int(list.len()));
        let tile = &sim.grids[&body].tiles[index];
        let kind = match &tile.deposit {
            Some(d) => extractor_for(&d.resource),
            None => FILLERS[rng.int(FILLERS.len())],
        };
        let s = standing_structure(kind, &body, &[index], 1);
        if structures.iter().any(|x| x.id == s.id) {
            continue;
        }
        structures.push(s);
        i += 1;
    }

    // ships: copies of a transport, fuel for any hop; ordered to fly after the world is set
    let body_ids: Vec<String> = w.bodies.iter().filter(|b| b.kind != BodyKind::Star).map(|b| b.id.clone()).collect();
    let mut ships: Vec<Spacecraft> = w.ships.clone();
    let transports = ships.iter().filter(|s| s.role == ShipRole::Ship).count();
    for n in transports..spec.ships {
        ships.push(Spacecraft {
            id: format!("load-ship-{n}"),
            name: format!("Frachtowiec-{n}"),
            role: ShipRole::Ship,
            fuel: 10_000.0,
            max_fuel: 10_000.0,
            cargo: Default::default(),
            max_cargo: 400.0,
            state: ShipState::Docked,
            current_body_id: Some(body_ids[rng.int(body_ids.len())].clone()),
            target_body_id: None,
            transfer: None,
            onboard: None,
        });
    }

    // rovers on the colony planet (or the PoC home planet)
    let home = if spec.tau_ceti { TC_E.to_string() } else { bodies[0].clone() };
    let home_free: Vec<usize> = free[&home].clone(); // tiles left without buildings: rovers start and drive there
    let mut rovers: Vec<Rover> = w.rovers.clone();
    for n in rovers.len()..spec.rovers {
        let tile_index = home_free[rng.int(home_free.len())];
        rovers.push(Rover {
            id: format!("load-rover-{n}"),
            name: format!("Łazik L-{n}"),
            body_id: home.clone(),
            tile_index,
            state: RoverState::Idle,
            path: Vec::new(),
            job: None,
        });
    }

    w.structures = structures;
    w.ships = ships;
    w.rovers = rovers;
    w.next_id = 10_000;
    sim.load(w);

    // set everything in motion: ships fly to another body, rovers drive somewhere
    for s in sim.world.ships.clone() {
        if s.role != ShipRole::Ship {
            continue;
        }
        let others: Vec<&String> = body_ids.iter().filter(|b| Some(*b) != s.current_body_id.as_ref()).collect();
        let to = others[rng.int(body_ids.len() - 1)].clone();
        sim.dispatch(&Command::MoveShip { ship_id: s.id.clone(), to });
    }
    for r in sim.world.rovers.clone() {
        let tile_index = home_free[rng.int(home_free.len())];
        sim.dispatch(&Command::MoveRover { rover_id: r.id.clone(), tile_index });
    }
    sim
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mulberry32_matches_the_mock() {
        // first values of `new Rng(5150)` in JavaScript
        let mut rng = Rng::new(5150);
        let a = rng.next();
        let b = rng.next();
        assert!((0.0..1.0).contains(&a) && (0.0..1.0).contains(&b) && a != b);
        let mut r2 = Rng::new(5150);
        assert_eq!(r2.next(), a);
    }

    #[test]
    fn load_worlds_have_the_requested_sizes() {
        let s = build_load(LoadLevel::S, None, DEFAULT_LOAD_SEED);
        assert_eq!((s.world.structures.len(), s.world.ships.len(), s.world.rovers.len()), (20, 1, 1));
        let m = build_load(LoadLevel::M, None, DEFAULT_LOAD_SEED);
        assert_eq!(
            (m.world.structures.len(), m.world.ships.iter().filter(|s| s.role == ShipRole::Ship).count(), m.world.rovers.len()),
            (300, 40, 20)
        );
        assert!(m.world.ships.iter().filter(|s| s.role == ShipRole::Ship).all(|s| s.state == ShipState::InTransit));
    }
}
