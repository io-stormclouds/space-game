//! Colonisation commands of the canvas flow and the timers behind them (`colony-system.ts`):
//! scan, site choice, the port landed from the hold, shuttles, vehicles.

use std::collections::HashSet;

use super::build;
use crate::ids::{BodyId, TileId, tile_id, tile_index_of};
use crate::math::footprint::footprint_tiles;
use crate::math::js;
use crate::models::event::{DomainEvent, RejectReason, ShuttleTrip, VehicleOrder};
use crate::models::resource::{Cost, Qty, can_afford, format_cost, missing_for, stock_total};
use crate::models::rover::{Rover, RoverState};
use crate::models::ship::{ShipRole, ShipState, Spacecraft};
use crate::sim::colony::{fits, free_space, level_ceiling};
use crate::sim::reducer::{ScanState, WorldState};
use crate::sim::rules::Rules;
use crate::sim::scenario::{ColonizationParams, Grids};

fn reject(reason: RejectReason) -> DomainEvent {
    DomainEvent::rejected(reason)
}

fn reject_with(reason: RejectReason, detail: impl Into<String>) -> DomainEvent {
    DomainEvent::rejected_with(reason, detail)
}

pub fn mothership(world: &WorldState) -> Option<&Spacecraft> {
    world.ships.iter().find(|s| s.role == ShipRole::Mothership)
}

pub fn scan(world: &WorldState, params: &ColonizationParams, ship_id: &str) -> DomainEvent {
    let Some(ship) = world.ship(ship_id).filter(|s| s.role == ShipRole::Mothership) else { return reject(RejectReason::NoMothership) };
    match world.scan {
        ScanState::Running { .. } => return reject(RejectReason::ScanRunning),
        ScanState::Done { .. } => return reject_with(RejectReason::Busy, "układ zeskanowany"),
        ScanState::None => {}
    }
    if ship.state == ShipState::InTransit {
        return reject(RejectReason::InTransit);
    }
    DomainEvent::ScanStarted { ship_id: ship_id.to_string(), ends_at: world.time + params.scan_minutes }
}

pub fn choose_site(world: &WorldState, grids: &Grids, body_id: &str) -> DomainEvent {
    if !matches!(world.scan, ScanState::Done { .. }) {
        return reject(RejectReason::NotScanned);
    }
    if !grids.contains_key(body_id) {
        return reject(RejectReason::NoGrid);
    }
    if world.colony.founded_at.is_some() {
        return reject_with(RejectReason::Busy, "kolonia założona");
    }
    DomainEvent::ColonySiteChosen { body_id: body_id.to_string() }
}

/// Lands the port (HQ L1) from the mothership's hold with the rovers; rovers then build it.
pub fn place_spaceport(
    world: &WorldState,
    grids: &Grids,
    rules: &Rules,
    params: &ColonizationParams,
    body_id: &str,
    anchor: &str,
    rotation: i64,
) -> DomainEvent {
    if world.colony.site_body_id.as_deref() != Some(body_id) {
        return reject(RejectReason::NoColonySite);
    }
    if world.structures.iter().any(|s| s.kind == "HQ" && s.body_id == body_id) {
        return reject_with(RejectReason::Busy, "port już stoi");
    }
    let Some(ship) = mothership(world) else { return reject(RejectReason::NoMothership) };
    if ship.state != ShipState::Docked || ship.current_body_id.as_deref() != Some(body_id) {
        return reject_with(RejectReason::NoShip, format!("{} musi być na orbicie", ship.name));
    }
    if ship.onboard.map(|o| o.shuttles).unwrap_or(0) < 1 {
        return reject(RejectReason::NoShuttle);
    }
    let grid = grids.get(body_id);
    let tile = grid.and_then(|g| g.tile_by_id(anchor));
    let (Some(grid), Some(tile)) = (grid, tile) else { return reject(RejectReason::NoGrid) };
    let spec = rules.spec("HQ", 1);
    let Some(indices) = footprint_tiles(grid, tile.index, spec.footprint, rotation) else {
        return reject_with(RejectReason::NoFootprint, format!("{} pola", spec.footprint));
    };
    let tiles: Vec<TileId> = indices.iter().map(|&i| tile_id(body_id, i)).collect();
    let occupied: HashSet<&str> =
        world.structures.iter().filter(|s| s.body_id == body_id).flat_map(|s| s.tiles.iter().map(|t| t.as_str())).collect();
    if tiles.iter().any(|t| occupied.contains(t.as_str())) {
        return reject(RejectReason::TileOccupied);
    }
    let cost = params.port_cost.clone();
    if !can_afford(&ship.cargo, &cost) {
        return reject_with(RejectReason::NoResources, format!("brakuje {}", format_cost(&missing_for(&ship.cargo, &cost))));
    }

    let structure = build::site(rules, "HQ", body_id, tiles, cost.clone(), world.time);
    let count = params.landed_rovers.min(ship.onboard.map(|o| o.rovers).unwrap_or(0)).max(0) as usize;
    let free: Vec<usize> =
        tile.neighbors.iter().copied().filter(|n| !indices.contains(n) && !occupied.contains(tile_id(body_id, *n).as_str())).collect();
    let mut rovers: Vec<Rover> = Vec::with_capacity(count);
    for i in 0..count {
        let tile_index = if free.is_empty() { tile.index } else { free[i % free.len()] };
        rovers.push(Rover {
            id: format!("rover-{}", world.next_id + 1 + i as u64),
            name: format!("Łazik R-{}", world.rovers.len() + i + 1),
            body_id: body_id.to_string(),
            tile_index,
            state: RoverState::Idle,
            path: Vec::new(),
            job: None,
        });
    }
    DomainEvent::SpaceportPlaced { structure, cost, ship_id: ship.id.clone(), rovers }
}

/// Sends the shuttle with materials from the mothership's hold down to the colony's storage.
pub fn call_shuttle(world: &WorldState, rules: &Rules, params: &ColonizationParams, body_id: &str, cargo: &Cost) -> DomainEvent {
    if !world.structures.iter().any(|s| s.kind == "HQ" && s.body_id == body_id && s.is_working()) {
        return reject(RejectReason::NoColony);
    }
    let Some(ship) = mothership(world).filter(|s| s.state == ShipState::Docked && s.current_body_id.as_deref() == Some(body_id)) else {
        return reject_with(RejectReason::NoShip, "Arka-1 musi być na orbicie");
    };
    let busy = world.shuttles.iter().filter(|t| t.ship_id == ship.id).count() as i64;
    if busy >= ship.onboard.map(|o| o.shuttles).unwrap_or(0) {
        return reject_with(RejectReason::NoShuttle, "prom w drodze");
    }
    let total = stock_total(cargo);
    if total <= 0.0 {
        return reject(RejectReason::NoResources);
    }
    if total > params.shuttle_capacity {
        return reject_with(RejectReason::NoStorage, format!("prom zabiera {} j.", js::number_to_string(params.shuttle_capacity)));
    }
    if !can_afford(&ship.cargo, cargo) {
        return reject_with(RejectReason::NoResources, format!("w ładowni brakuje {}", format_cost(&missing_for(&ship.cargo, cargo))));
    }
    if !fits(world, rules, body_id, cargo) {
        return reject(RejectReason::NoStorage);
    }
    let trip = ShuttleTrip {
        id: format!("shuttle-{}", world.next_id + 1),
        ship_id: ship.id.clone(),
        body_id: body_id.to_string(),
        cargo: cargo.clone(),
        arrives_at: world.time + params.shuttle_trip_minutes,
        returns_at: world.time + 2.0 * params.shuttle_trip_minutes,
        unloaded: false,
    };
    DomainEvent::ShuttleLaunched { trip }
}

/// Construction rover from the port (canvas: "Produkuj łazik — FER 20 · SIL 5 · 3 min"); limit = port level + 1.
pub fn produce_rover(world: &WorldState, rules: &Rules, body_id: &str) -> DomainEvent {
    let Some(hq) = world.structures.iter().find(|s| s.kind == "HQ" && s.body_id == body_id && s.is_working()) else {
        return reject(RejectReason::NoColony);
    };
    let limit = level_ceiling(world, body_id) + 1;
    let count = (world.rovers.iter().filter(|r| r.body_id == body_id).count()
        + world.vehicle_orders.iter().filter(|o| o.body_id == body_id).count()) as u32;
    if count >= limit {
        return reject_with(RejectReason::RoverLimit, format!("{count} / {limit}"));
    }
    if world.vehicle_orders.iter().any(|o| o.structure_id == hq.id) {
        return reject_with(RejectReason::Busy, "port produkuje");
    }
    let (cost, build_time) = rules.vehicle("ROV");
    let store = world.storage_of(body_id);
    if !can_afford(&store, &cost) {
        return reject_with(RejectReason::NoResources, format!("brakuje {}", format_cost(&missing_for(&store, &cost))));
    }
    let order = VehicleOrder {
        id: format!("order-{}", world.next_id + 1),
        body_id: body_id.to_string(),
        kind: "ROV".to_string(),
        structure_id: hq.id.clone(),
        ends_at: world.time + build_time,
    };
    DomainEvent::VehicleOrdered { order, cost }
}

/// Timers: scan end, shuttle landing and return, finished vehicles.
pub fn update(world: &WorldState, rules: &Rules) -> Vec<DomainEvent> {
    let mut events = Vec::new();
    let t = world.time + 1e-9;
    if let ScanState::Running { ends_at, .. } = world.scan
        && t >= ends_at
    {
        events.push(DomainEvent::ScanCompleted {
            body_ids: world.bodies.iter().filter(|b| b.revealed == Some(false)).map(|b| b.id.clone()).collect(),
        });
    }
    for trip in &world.shuttles {
        if !trip.unloaded && t >= trip.arrives_at {
            // Whatever does not fit goes back up with the shuttle.
            let mut cargo: Qty = Qty::new();
            for (code, q) in &trip.cargo {
                cargo.insert(code.clone(), q.min(free_space(world, rules, &trip.body_id, code)));
            }
            events.push(DomainEvent::ShuttleUnloaded { trip_id: trip.id.clone(), body_id: trip.body_id.clone(), cargo });
        }
        if t >= trip.returns_at {
            events.push(DomainEvent::ShuttleReturned { trip_id: trip.id.clone() });
        }
    }
    let mut n = world.next_id;
    for o in &world.vehicle_orders {
        if t < o.ends_at {
            continue;
        }
        let tile = world.structure(&o.structure_id).map(|hq| tile_index_of(&hq.tile_id)).unwrap_or(0);
        n += 1;
        events.push(DomainEvent::RoverProduced {
            order_id: o.id.clone(),
            rover: Rover {
                id: format!("rover-{n}"),
                name: format!("Łazik R-{}", world.rovers.len() + 1),
                body_id: o.body_id.clone(),
                tile_index: tile,
                state: RoverState::Idle,
                path: Vec::new(),
                job: None,
            },
        });
    }
    events
}

/// Which body ids have a grid (for the UI): convenience over `grids`.
pub fn gridded(grids: &Grids) -> Vec<BodyId> {
    grids.keys().cloned().collect()
}
