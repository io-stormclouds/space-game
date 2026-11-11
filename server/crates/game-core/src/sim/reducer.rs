//! The whole game state and the pure reducer that applies domain events to it (`reducer.ts`).

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

use crate::ids::{BodyId, TileId};
use crate::models::atanor_machine::{AtanorMachine, MachineState};
use crate::models::body::CelestialBody;
use crate::models::event::{DomainEvent, ShuttleTrip, VehicleOrder};
use crate::models::resource::{Stockpile, add_stock, empty_stockpile, qty, stock_total, subtract_stock};
use crate::models::rover::{Rover, RoverState};
use crate::models::ship::{ShipRole, ShipState, Spacecraft};
use crate::models::structure::{Structure, StructureState};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "state", rename_all = "UPPERCASE", rename_all_fields = "camelCase")]
pub enum ScanState {
    None,
    Running { ship_id: String, ends_at: f64 },
    Done { at: f64 },
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ColonyState {
    /// Body chosen for the first colony (canvas step "Wybierz planetę startową").
    pub site_body_id: Option<BodyId>,
    /// Game time the port was finished.
    pub founded_at: Option<f64>,
}

/// Plain data: serialised for save/load and replay, so every value a system needs to continue lives
/// here. Only per-frame positions go to `FrameSnapshot`.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct WorldState {
    /// Game time [model minutes].
    pub time: f64,
    pub bodies: Vec<CelestialBody>,
    pub ships: Vec<Spacecraft>,
    /// Storage pool of each body (Z3: local storage).
    pub storage: IndexMap<BodyId, Stockpile>,
    pub structures: Vec<Structure>,
    /// Remaining amount per deposit tile.
    pub deposits: IndexMap<TileId, f64>,
    pub rovers: Vec<Rover>,
    pub scan: ScanState,
    pub colony: ColonyState,
    pub shuttles: Vec<ShuttleTrip>,
    pub vehicle_orders: Vec<VehicleOrder>,
    /// Counter for deterministic ids.
    pub next_id: u64,
    /// Machines of the Fabryka atanorowa buildings by structure id (AT4); absent in older saves.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub machines: Option<IndexMap<String, AtanorMachine>>,
}

impl WorldState {
    pub fn storage_of(&self, body_id: &str) -> Stockpile {
        self.storage.get(body_id).cloned().unwrap_or_else(empty_stockpile)
    }

    pub fn body(&self, id: &str) -> Option<&CelestialBody> {
        self.bodies.iter().find(|b| b.id == id)
    }

    pub fn ship(&self, id: &str) -> Option<&Spacecraft> {
        self.ships.iter().find(|s| s.id == id)
    }

    pub fn structure(&self, id: &str) -> Option<&Structure> {
        self.structures.iter().find(|s| s.id == id)
    }

    pub fn rover(&self, id: &str) -> Option<&Rover> {
        self.rovers.iter().find(|r| r.id == id)
    }

    /// A building's machine, or a fresh one (no program yet).
    pub fn machine_of(&self, structure_id: &str, recipe: &str) -> AtanorMachine {
        self.machine(structure_id).cloned().unwrap_or_else(|| AtanorMachine::new(structure_id, recipe))
    }

    pub fn machine(&self, structure_id: &str) -> Option<&AtanorMachine> {
        self.machines.as_ref().and_then(|m| m.get(structure_id))
    }

    pub fn patch_machine(&mut self, structure_id: &str, recipe: &str, f: impl FnOnce(&mut AtanorMachine)) {
        let mut m = self.machine_of(structure_id, recipe);
        f(&mut m);
        self.machines.get_or_insert_with(IndexMap::new).insert(structure_id.to_string(), m);
    }

    fn add_to_storage(&mut self, body_id: &str, add: &Stockpile) {
        let next = add_stock(&self.storage_of(body_id), add, 1.0);
        self.storage.insert(body_id.to_string(), next);
    }

    fn take_from_storage(&mut self, body_id: &str, take: &Stockpile) {
        let next = subtract_stock(&self.storage_of(body_id), take);
        self.storage.insert(body_id.to_string(), next);
    }

    fn release_rovers(&mut self, structure_id: &str) {
        for r in self.rovers.iter_mut() {
            if r.job.as_deref() == Some(structure_id) {
                r.job = None;
                if r.state != RoverState::Moving {
                    r.state = RoverState::Idle;
                }
            }
        }
    }

    fn patch_ship(&mut self, id: &str, f: impl FnOnce(&mut Spacecraft)) {
        if let Some(s) = self.ships.iter_mut().find(|s| s.id == id) {
            f(s);
        }
    }

    pub fn patch_structure(&mut self, id: &str, f: impl FnOnce(&mut Structure)) {
        if let Some(s) = self.structures.iter_mut().find(|s| s.id == id) {
            f(s);
        }
    }

    fn patch_rover(&mut self, id: &str, f: impl FnOnce(&mut Rover)) {
        if let Some(r) = self.rovers.iter_mut().find(|r| r.id == id) {
            f(r);
        }
    }
}

pub fn cargo_total(cargo: &Stockpile) -> f64 {
    stock_total(cargo)
}

/// Applies one domain event to the world.
pub fn reduce(w: &mut WorldState, e: &DomainEvent) {
    match e {
        DomainEvent::TransferStarted { ship_id, plan } => w.patch_ship(ship_id, |s| {
            s.fuel = (s.fuel - plan.fuel_cost).max(0.0);
            s.state = ShipState::InTransit;
            s.current_body_id = None;
            s.target_body_id = Some(plan.to_body_id.clone());
            s.transfer = Some(plan.clone());
        }),

        DomainEvent::TransferArrived { ship_id, body_id } => {
            let can_mine = w.body(body_id).and_then(|b| b.resources.as_ref()).map(|r| r.values().any(|&v| v > 0.0)).unwrap_or(false);
            w.patch_ship(ship_id, |s| {
                s.state = if s.role == ShipRole::Ship && can_mine && cargo_total(&s.cargo) < s.max_cargo {
                    ShipState::Mining
                } else {
                    ShipState::Docked
                };
                s.current_body_id = Some(body_id.clone());
                s.target_body_id = None;
                s.transfer = None;
            });
        }

        DomainEvent::MiningTick { ship_id, body_id, resource, amount } => {
            w.patch_ship(ship_id, |s| s.cargo = add_stock(&s.cargo, &qty([(resource.as_str(), *amount)]), 1.0));
            for b in w.bodies.iter_mut() {
                if &b.id == body_id
                    && let Some(res) = b.resources.as_mut()
                {
                    let cur = res.get(resource).copied().unwrap_or(0.0);
                    res.insert(resource.clone(), (cur - amount).max(0.0));
                }
            }
        }

        DomainEvent::MiningStopped { ship_id, .. } => w.patch_ship(ship_id, |s| {
            if s.state == ShipState::Mining {
                s.state = ShipState::Docked;
            }
        }),

        DomainEvent::CargoUnloaded { ship_id, body_id, cargo } => {
            w.patch_ship(ship_id, |s| s.cargo = subtract_stock(&s.cargo, cargo));
            w.add_to_storage(body_id, cargo);
        }

        DomainEvent::Refueled { ship_id } => w.patch_ship(ship_id, |s| s.fuel = s.max_fuel),

        DomainEvent::ConstructionOrdered { structure, cost, from_ship_id } => {
            match from_ship_id {
                Some(ship) => w.patch_ship(ship, |s| s.cargo = subtract_stock(&s.cargo, cost)),
                None => w.take_from_storage(&structure.body_id, cost),
            }
            w.structures.push(structure.clone());
            w.next_id += 1;
        }

        DomainEvent::ConstructionStarted { structure_id, .. } => w.patch_structure(structure_id, |s| {
            if s.state == StructureState::Planned {
                s.state = StructureState::Constructing;
            }
        }),

        DomainEvent::StructureBuilt { structure, .. } => {
            w.patch_structure(&structure.id, |s| *s = structure.clone());
            w.release_rovers(&structure.id);
        }

        DomainEvent::UpgradeOrdered { structure_id, cost } => {
            let Some(s) = w.structure(structure_id) else { return };
            let body_id = s.body_id.clone();
            w.take_from_storage(&body_id, cost);
            w.patch_structure(structure_id, |x| {
                x.state = StructureState::Upgrading;
                x.target_level = x.level + 1;
                x.progress = 0.0;
                x.paid = cost.clone();
            });
        }

        DomainEvent::StructureUpgraded { structure_id, level } => {
            w.patch_structure(structure_id, |s| {
                s.state = StructureState::Active;
                s.level = *level;
                s.target_level = *level;
                s.progress = 0.0;
                s.paid = empty_stockpile();
            });
            w.release_rovers(structure_id);
        }

        DomainEvent::ConstructionCancelled { structure_id, refund } => {
            let Some(s) = w.structure(structure_id).cloned() else { return };
            w.add_to_storage(&s.body_id, refund);
            w.release_rovers(&s.id);
            if s.level == 0 {
                w.structures.retain(|x| x.id != s.id);
            } else {
                w.patch_structure(&s.id, |x| {
                    x.state = StructureState::Active;
                    x.target_level = x.level;
                    x.progress = 0.0;
                    x.paid = empty_stockpile();
                });
            }
        }

        DomainEvent::StructureDemolished { structure_id, refund } => {
            let Some(s) = w.structure(structure_id).cloned() else { return };
            w.release_rovers(&s.id);
            w.add_to_storage(&s.body_id, refund);
            w.structures.retain(|x| x.id != s.id);
            if let Some(ms) = w.machines.as_mut() {
                ms.shift_remove(&s.id);
            }
        }

        DomainEvent::ExtractionTick { body_id, tile_id, resource, amount } => {
            w.add_to_storage(body_id, &qty([(resource.as_str(), *amount)]));
            if let Some(d) = w.deposits.get(tile_id).copied() {
                w.deposits.insert(tile_id.clone(), (d - amount).max(0.0));
            }
        }

        DomainEvent::BatchStarted { structure_id, recipe, consumed, progress } => {
            let Some(s) = w.structure(structure_id) else { return };
            let body_id = s.body_id.clone();
            w.take_from_storage(&body_id, consumed);
            let batch = crate::models::structure::ProductionBatch { recipe: recipe.clone(), progress: progress.unwrap_or(0.0) };
            w.patch_structure(structure_id, |x| x.batch = Some(Some(batch)));
        }

        DomainEvent::BatchCompleted { structure_id, produced, .. } => {
            let Some(s) = w.structure(structure_id) else { return };
            let body_id = s.body_id.clone();
            w.add_to_storage(&body_id, produced);
            w.patch_structure(structure_id, |x| x.batch = Some(None));
        }

        DomainEvent::RecipeSet { structure_id, recipe } => w.patch_structure(structure_id, |s| s.recipe = Some(recipe.clone())),

        DomainEvent::RoverMoveOrdered { rover_id, path } => w.patch_rover(rover_id, |r| {
            r.state = RoverState::Moving;
            r.path = path.clone();
        }),

        DomainEvent::RoverArrived { rover_id, tile_index } => w.patch_rover(rover_id, |r| {
            r.state = if r.job.is_some() { RoverState::Building } else { RoverState::Idle };
            r.tile_index = *tile_index;
            r.path = Vec::new();
        }),

        DomainEvent::RoverAssigned { rover_id, structure_id } => w.patch_rover(rover_id, |r| r.job = Some(structure_id.clone())),

        DomainEvent::VehicleOrdered { order, cost } => {
            if let Some(body_id) = w.structure(&order.structure_id).map(|s| s.body_id.clone()) {
                w.take_from_storage(&body_id, cost);
            }
            w.vehicle_orders.push(order.clone());
            w.next_id += 1;
        }

        DomainEvent::RoverProduced { order_id, rover } => {
            w.rovers.push(rover.clone());
            w.vehicle_orders.retain(|o| &o.id != order_id);
            w.next_id += 1;
        }

        DomainEvent::ScanStarted { ship_id, ends_at } => w.scan = ScanState::Running { ship_id: ship_id.clone(), ends_at: *ends_at },

        DomainEvent::ScanCompleted { body_ids } => {
            w.scan = ScanState::Done { at: w.time };
            for b in w.bodies.iter_mut() {
                if body_ids.contains(&b.id) {
                    b.revealed = Some(true);
                }
            }
        }

        DomainEvent::ColonySiteChosen { body_id } => w.colony.site_body_id = Some(body_id.clone()),

        DomainEvent::SpaceportPlaced { structure, cost, ship_id, rovers } => {
            let landed = rovers.len() as i64;
            w.patch_ship(ship_id, |s| {
                s.cargo = subtract_stock(&s.cargo, cost);
                if let Some(o) = s.onboard.as_mut() {
                    o.rovers -= landed;
                }
            });
            w.structures.push(structure.clone());
            w.rovers.extend(rovers.iter().cloned());
            w.next_id += 1 + rovers.len() as u64;
        }

        DomainEvent::ColonyFounded { body_id, .. } => {
            w.colony.founded_at = Some(w.time);
            for b in w.bodies.iter_mut() {
                if &b.id == body_id {
                    b.is_home_base = true;
                }
            }
        }

        DomainEvent::ShuttleLaunched { trip } => {
            w.patch_ship(&trip.ship_id, |s| s.cargo = subtract_stock(&s.cargo, &trip.cargo));
            w.shuttles.push(trip.clone());
            w.next_id += 1;
        }

        DomainEvent::ShuttleUnloaded { trip_id, body_id, cargo } => {
            w.add_to_storage(body_id, cargo);
            for t in w.shuttles.iter_mut() {
                if &t.id == trip_id {
                    t.unloaded = true;
                }
            }
        }

        DomainEvent::ShuttleReturned { trip_id } => w.shuttles.retain(|t| &t.id != trip_id),

        DomainEvent::AtanorDraftSaved { structure_id, recipe, solution } => w.patch_machine(structure_id, recipe, |m| {
            m.recipe = recipe.clone();
            m.draft = Some(solution.clone());
        }),

        DomainEvent::AtanorDeployStarted { structure_id, recipe, cost, deployment } => {
            let Some(body_id) = w.structure(structure_id).map(|s| s.body_id.clone()) else { return };
            w.take_from_storage(&body_id, cost);
            w.patch_machine(structure_id, recipe, |m| {
                m.recipe = recipe.clone();
                m.draft = Some(deployment.solution.clone());
                m.deploy = Some(deployment.clone());
            });
        }

        DomainEvent::AtanorDeployed { structure_id, returned } => {
            let Some(body_id) = w.structure(structure_id).map(|s| s.body_id.clone()) else { return };
            let Some(m) = w.machine(structure_id).cloned() else { return };
            let Some(d) = m.deploy else { return };
            w.add_to_storage(&body_id, returned);
            w.patch_machine(structure_id, &m.recipe, |x| {
                x.program = Some(d.solution);
                x.metrics = Some(d.metrics);
                x.deploy = None;
                x.ticks = 0;
                x.progress = 0.0;
                x.state = MachineState::Running;
                x.consumed = empty_stockpile();
                x.delivered = 0;
            });
        }

        DomainEvent::AtanorConsumed { structure_id, consumed } => {
            let Some(body_id) = w.structure(structure_id).map(|s| s.body_id.clone()) else { return };
            let Some(recipe) = w.machine(structure_id).map(|m| m.recipe.clone()) else { return };
            w.take_from_storage(&body_id, consumed);
            w.patch_machine(structure_id, &recipe, |x| x.consumed = add_stock(&x.consumed, consumed, 1.0));
        }

        DomainEvent::AtanorDelivered { structure_id, produced, count } => {
            let Some(body_id) = w.structure(structure_id).map(|s| s.body_id.clone()) else { return };
            let Some(recipe) = w.machine(structure_id).map(|m| m.recipe.clone()) else { return };
            w.add_to_storage(&body_id, produced);
            w.patch_machine(structure_id, &recipe, |x| x.delivered += count);
        }

        DomainEvent::ShipmentDeparted { body_id, cargo, .. } => {
            w.take_from_storage(body_id, cargo);
            w.next_id += 1;
        }

        // a delivery may go over the capacity: the galaxy already gave the goods away
        DomainEvent::HubDelivered { body_id, cargo, .. } => w.add_to_storage(body_id, cargo),

        DomainEvent::DepositDepleted { .. } | DomainEvent::CommandRejected { .. } => {}
    }
}

pub fn reduce_all(w: &mut WorldState, events: &[DomainEvent]) {
    for e in events {
        reduce(w, e);
    }
}
