//! Scenario "fabryka" (AT1, A16; `mock-server/src/factory.ts`): a late colony on Tau Ceti e with a
//! Fabryka atanorowa L1, so the building view of the Atanor can be opened from the planet. The
//! factory is an era 3 building and the playable catalogue ends at era 1 (W07 B), so the scenario
//! places it, like the F5 load worlds. The mock keeps this next to the server; the Rust server needs
//! it in the core to start the same world.

use std::cmp::Ordering;
use std::collections::HashSet;

use indexmap::IndexMap;

use super::tau_ceti::{TC_E, tau_ceti_scenario};
use crate::economy::Economy;
use crate::models::grid::Tile;
use crate::models::resource::{Qty, qty};
use crate::models::rover::{Rover, RoverState};
use crate::models::structure::Structure;
use crate::sim::reducer::{ColonyState, ScanState};
use crate::sim::scenario::{find_free_footprint, standing_structure};
use crate::sim::simulation::{Simulation, SimulationOptions};

/// Storage at t = 0: recipe inputs of A_NAD / A_KAT and the materials of a machine (§8.2).
pub fn factory_storage() -> Qty {
    qty([
        ("MIE", 120.0),
        ("PLA", 30.0),
        ("H2", 600.0),
        ("KRZ", 40.0),
        ("STA", 200.0),
        ("SLN", 20.0),
        ("PRZ", 60.0),
        ("UKL", 20.0),
        ("STP", 10.0),
        ("NAD", 2.0),
        ("FER", 400.0),
        ("SIL", 200.0),
        ("KRI", 100.0),
        ("BET", 100.0),
    ])
}

/// Builds the "fabryka" world on top of Tau Ceti (scanned, Tau Ceti e founded).
pub fn build_factory(economy: Option<Economy>) -> Simulation {
    let mut sim = Simulation::new(tau_ceti_scenario(), SimulationOptions { economy, world: None });
    let (structures, rovers) = {
        let grid = sim.grids.get(TC_E).expect("Tau Ceti e has a grid");
        let mut taken: HashSet<usize> = HashSet::new();
        let mut place = |kind: &str, size: usize, level: u32, min_ring: usize| -> Structure {
            let tiles = find_free_footprint(grid, size, &taken, min_ring).unwrap_or_else(|| panic!("fabryka: no place for {kind}"));
            // a free ring between buildings
            for t in &tiles {
                taken.insert(*t);
                taken.extend(grid.tiles[*t].neighbors.iter().copied());
            }
            standing_structure(kind, TC_E, &tiles, level)
        };
        let hq = place("HQ", 3, 3, 0);
        let mut atn = place("ATN", 7, 1, 2);
        atn.recipe = Some("A_NAD".to_string());
        atn.batch = Some(None);
        let structures = vec![
            hq,
            atn,
            place("WND", 1, 1, 0),
            place("WND", 1, 1, 0),
            place("SOL", 1, 1, 0),
            place("SOL", 1, 1, 0),
            place("HAB", 1, 1, 0),
            place("GAS", 1, 1, 0),
            place("CRY", 1, 1, 0),
        ];

        // two rovers on free tiles next to the port (the highest free tiles, a stable sort)
        let used: HashSet<&str> = structures.iter().flat_map(|s| s.tiles.iter().map(|t| t.as_str())).collect();
        let mut near: Vec<&Tile> = grid.tiles.iter().filter(|t| !used.contains(t.id.as_str())).collect();
        near.sort_by(|a, b| b.normal.y.partial_cmp(&a.normal.y).unwrap_or(Ordering::Equal));
        let rovers: Vec<Rover> = (0..2)
            .map(|i| Rover {
                id: format!("fabryka-rover-{}", i + 1),
                name: format!("Łazik F-{}", i + 1),
                body_id: TC_E.to_string(),
                tile_index: near[i].index,
                state: RoverState::Idle,
                path: Vec::new(),
                job: None,
            })
            .collect();
        (structures, rovers)
    };

    let mut w = sim.world.clone();
    w.scan = ScanState::Done { at: 0.0 };
    for b in w.bodies.iter_mut() {
        b.revealed = Some(true);
        b.is_home_base = b.id == TC_E;
    }
    w.colony = ColonyState { site_body_id: Some(TC_E.to_string()), founded_at: Some(0.0) };
    w.structures = structures;
    w.rovers = rovers;
    w.storage = IndexMap::from([(TC_E.to_string(), factory_storage())]);
    for s in w.ships.iter_mut() {
        s.current_body_id = Some(TC_E.to_string());
    }
    w.next_id = 1000;
    sim.load(w);
    sim
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn factory_world_has_a_l1_atanor_with_the_nad_recipe() {
        let sim = build_factory(None);
        let atn = sim.world.structures.iter().find(|s| s.kind == "ATN").expect("ATN");
        assert_eq!((atn.level, atn.recipe.as_deref(), atn.tiles.len()), (1, Some("A_NAD"), 7));
        assert_eq!(sim.world.rovers.len(), 2);
        assert_eq!(sim.world.storage_of(TC_E).get("MIE"), Some(&120.0));
    }
}
