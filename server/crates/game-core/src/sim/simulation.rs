//! The whole game without a framework (`simulation.ts`): one scenario, its rules, the systems, the
//! clock and the per-frame snapshot. `step(dt)` advances model minutes; `dispatch(cmd)` validates an
//! order. Same scenario + same commands at the same times + same steps ⇒ the same world.

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

use super::colony::{CrewBalance, PowerBalance, crew_balance, fits, fits_pool, power_balance, storage_capacity, storage_use};
use super::constants::GameConstants;
use super::frame::FrameSnapshot;
use super::reducer::{ScanState, WorldState, reduce_all};
use super::rules::Rules;
use super::scenario::{Grids, Scenario, build_world_grids, create_world, landing_pad_tile_of, pad_docking_offset, scenario_constants};
use super::systems::{
    AtanorSystem, ExtractionSystem, MiningSystem, RoverSystem, TransferSystem, atanor, build, colony, construction, docking, hub,
    production,
};
use crate::economy::{Economy, StorageClass};
use crate::ids::{BodyId, RoverId, ShipId};
use crate::math::asteroid::{AsteroidShape, asteroid_shape};
use crate::math::js;
use crate::math::orbit::OrbitSolver;
use crate::models::body::BodyKind;
use crate::models::command::Command;
use crate::models::event::{DomainEvent, RejectReason};
use crate::models::resource::{Qty, Stockpile};
use crate::models::rover::RoverState;
use crate::models::ship::{ShipRole, ShipState};
use crate::models::structure::StructureState;

/// Colony summary of a body, for the HUD.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ColonyReadout {
    pub storage: Stockpile,
    pub capacity: IndexMap<StorageClass, f64>,
    pub used: IndexMap<StorageClass, f64>,
    pub power: PowerBalance,
    pub crew: CrewBalance,
}

/// Step state the world does not hold: rover drives in progress and the sub-minute accumulators of
/// mining and extraction. With it, a saved world continues exactly like the uninterrupted one
/// (restore from a snapshot plus the log tail, the client's replica). Flights and Atanor engines are
/// rebuilt from the world, so they are not here.
#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SimState {
    pub drives: Vec<super::systems::DriveState>,
    pub mining: Vec<(ShipId, f64)>,
    pub extraction: f64,
}

#[derive(Default)]
pub struct SimulationOptions {
    /// Economy with changed parameters (F6 designer panel); default catalog otherwise.
    pub economy: Option<Economy>,
    /// Continue from a saved world instead of the scenario's start.
    pub world: Option<WorldState>,
}

pub struct Simulation {
    pub scenario: Scenario,
    pub rules: Rules,
    pub cfg: GameConstants,
    pub grids: Grids,
    pub shapes: IndexMap<BodyId, AsteroidShape>,
    pub solver: OrbitSolver,
    pub snapshot: FrameSnapshot,
    pub transfers: TransferSystem,
    pub rovers: RoverSystem,
    mining: MiningSystem,
    extraction: ExtractionSystem,
    atanor: AtanorSystem,
    pub world: WorldState,
}

impl Simulation {
    pub fn new(scenario: Scenario, opts: SimulationOptions) -> Simulation {
        let rules = Rules::new(opts.economy, scenario.overrides.clone());
        let cfg = scenario_constants(&scenario);
        // grids (and their terrain) from the bodies of the save when continuing one: a world saved before
        // a body got terrain keeps plain tiles, so the sim and the renderer see the same surface
        let grids = build_world_grids(opts.world.as_ref().map_or(&scenario.bodies, |w| &w.bodies));
        let shapes = scenario.bodies.iter().filter(|b| b.shape.is_some()).map(|b| (b.id.clone(), asteroid_shape(b, 4))).collect();
        let solver = OrbitSolver::new(&scenario.bodies);
        let snapshot = FrameSnapshot::new(scenario.bodies.iter().map(|b| &b.id));
        let world = opts.world.unwrap_or_else(|| create_world(&scenario, &grids, &rules));
        let mut sim = Simulation {
            scenario,
            rules,
            cfg,
            grids,
            shapes,
            solver,
            snapshot,
            transfers: TransferSystem::new(),
            rovers: RoverSystem::new(),
            mining: MiningSystem::new(),
            extraction: ExtractionSystem::new(),
            atanor: AtanorSystem::new(),
            world,
        };
        let ids: Vec<BodyId> = sim.scenario.bodies.iter().map(|b| b.id.clone()).collect();
        for id in &ids {
            sim.refresh_docking_offset(id);
        }
        let t = sim.world.time;
        for id in &ids {
            let p = sim.solver.local_position(id, t);
            sim.snapshot.body_local_pos.insert(id.clone(), p);
        }
        sim
    }

    pub fn time(&self) -> f64 {
        self.world.time
    }

    /// The step state outside the world (see [`SimState`]).
    pub fn export_state(&self) -> SimState {
        SimState { drives: self.rovers.export(), mining: self.mining.export(), extraction: self.extraction.accumulator() }
    }

    /// Restores the step state of [`Simulation::export_state`] (after `new` with the same world).
    pub fn import_state(&mut self, state: &SimState) {
        self.rovers.import(&state.drives);
        self.mining.import(&state.mining);
        self.extraction.set_accumulator(state.extraction);
    }

    /// Advances the world by `dt` model minutes. Returns the discrete events that occurred.
    pub fn step(&mut self, dt: f64) -> Vec<DomainEvent> {
        let mut all: Vec<DomainEvent> = Vec::new();
        let t = self.world.time + dt.max(0.0);
        self.world.time = t;
        self.snapshot.time = t;
        for (id, out) in self.snapshot.body_local_pos.iter_mut() {
            *out = self.solver.local_position(id, t);
        }

        let mut first: Vec<DomainEvent> = Vec::new();
        first.extend(self.transfers.update(&self.world.ships, t, &self.cfg, &mut self.snapshot));
        first.extend(self.mining.update(&self.world.ships, &self.world.bodies, &self.cfg, dt));
        first.extend(colony::update(&self.world, &self.rules));
        first.extend(self.rovers.update(&self.world.rovers, dt, &self.grids, &self.cfg, &mut self.snapshot));
        self.apply(&first, &mut all);

        let mut docked: Vec<DomainEvent> = Vec::new();
        for e in &first {
            let DomainEvent::TransferArrived { ship_id, body_id } = e else { continue };
            let (Some(ship), Some(body)) = (self.world.ship(ship_id), self.world.body(body_id)) else { continue };
            let (world, rules) = (&self.world, &self.rules);
            docked.extend(docking::on_arrival(ship, body, |cargo| fitting(world, rules, body_id, cargo)));
        }
        self.apply(&docked, &mut all);

        let assigned = construction::assign(&self.world, &self.grids, &mut self.rovers);
        self.apply(&assigned, &mut all);
        let built = construction::progress(&mut self.world, &self.rules, dt);
        self.apply(&built, &mut all);
        self.after_construction(&built, &mut all);

        let extracted = self.extraction.update(&self.world, &self.rules, &self.grids, dt);
        self.apply(&extracted, &mut all);
        let made = production::update(&mut self.world, &self.rules, dt);
        self.apply(&made, &mut all);
        let machines = self.atanor.update(&mut self.world, &self.rules, dt);
        self.apply(&machines, &mut all);

        let focus = self.world.ships.iter().find(|s| s.state == ShipState::InTransit).map(|s| s.id.clone());
        self.transfers.write_trajectory(focus.as_deref(), &mut self.snapshot);
        all
    }

    /// Validates and applies one order. Returns its events (COMMAND_REJECTED when refused).
    pub fn dispatch(&mut self, cmd: &Command) -> Vec<DomainEvent> {
        let mut all: Vec<DomainEvent> = Vec::new();
        let events: Vec<DomainEvent> = match cmd {
            Command::MoveShip { ship_id, to } => vec![self.order_transfer(ship_id, to)],
            Command::Build { body_id, tile_id, kind, rotation } => {
                vec![build::build(&self.world, &self.grids, &self.rules, body_id, tile_id, kind, self.world.time, rotation.unwrap_or(0))]
            }
            Command::Upgrade { structure_id } => vec![build::upgrade(&self.world, &self.rules, structure_id)],
            Command::CancelConstruction { structure_id } => vec![build::cancel(&self.world, structure_id)],
            Command::Demolish { structure_id } => vec![build::demolish(&self.world, &self.rules, structure_id)],
            Command::SetRecipe { structure_id, recipe } => {
                let s = self.world.structure(structure_id);
                let ok = s.map(|s| self.rules.processes(&s.kind).iter().any(|r| &r.id == recipe)).unwrap_or(false);
                vec![if ok {
                    DomainEvent::RecipeSet { structure_id: structure_id.clone(), recipe: recipe.clone() }
                } else {
                    DomainEvent::rejected(if s.is_some() { RejectReason::NoRecipe } else { RejectReason::NoStructure })
                }]
            }
            Command::MoveRover { rover_id, tile_index } => vec![self.order_rover_move(rover_id, *tile_index)],
            Command::AssignRover { rover_id, structure_id } => {
                let site = self.world.structure(structure_id).cloned();
                let rover = self.world.rover(rover_id).cloned();
                match (site, rover) {
                    (None, _) => vec![DomainEvent::rejected(RejectReason::NoStructure)],
                    (Some(site), _) if site.state == StructureState::Active => vec![DomainEvent::rejected(RejectReason::NoStructure)],
                    (_, None) => vec![DomainEvent::rejected(RejectReason::NoRover)],
                    (_, Some(rover)) if rover.state == RoverState::Moving || rover.job.is_some() => {
                        vec![DomainEvent::rejected(RejectReason::RoverMoving)]
                    }
                    (Some(site), Some(rover)) => {
                        let order = construction::send_to(&self.world, &self.grids, &mut self.rovers, &rover.id, &site);
                        if order.is_empty() { vec![DomainEvent::rejected(RejectReason::NoPath)] } else { order }
                    }
                }
            }
            Command::ProduceRover { body_id } => vec![colony::produce_rover(&self.world, &self.rules, body_id)],
            Command::ScanSystem { ship_id } => vec![colony::scan(&self.world, &self.scenario.colonization, ship_id)],
            Command::ChooseColonySite { body_id } => vec![colony::choose_site(&self.world, &self.grids, body_id)],
            Command::PlaceSpaceport { body_id, tile_id, rotation } => vec![colony::place_spaceport(
                &self.world,
                &self.grids,
                &self.rules,
                &self.scenario.colonization,
                body_id,
                tile_id,
                rotation.unwrap_or(0),
            )],
            Command::CallShuttle { body_id, cargo } => {
                vec![colony::call_shuttle(&self.world, &self.rules, &self.scenario.colonization, body_id, cargo)]
            }
            Command::SaveAtanorDraft { structure_id, solution } => vec![atanor::save_draft(&self.world, structure_id, solution)],
            Command::DeployAtanor { structure_id, solution } => {
                vec![atanor::deploy(&self.world, &self.rules, structure_id, solution)]
            }
            Command::ShipToHub { body_id, hub_id, cargo } => vec![hub::ship_to_hub(&self.world, body_id, hub_id, cargo)],
            Command::HubDelivery { shipment_id, body_id, cargo } => {
                vec![hub::hub_delivery(&self.world, shipment_id, body_id, cargo)]
            }
        };
        self.apply(&events, &mut all);
        all
    }

    /// Storage, capacity, power and crew of a body.
    pub fn colony_of(&self, body_id: &str) -> ColonyReadout {
        ColonyReadout {
            storage: self.world.storage_of(body_id),
            capacity: storage_capacity(&self.world, &self.rules, body_id),
            used: storage_use(&self.world, &self.rules, body_id),
            power: power_balance(&self.world, &self.rules, body_id, false),
            crew: crew_balance(&self.world, &self.rules, body_id, false),
        }
    }

    /// Replaces the world (load a saved game). Flights and drives are rebuilt from the state.
    pub fn load(&mut self, world: WorldState) {
        self.world = world;
        let ids: Vec<BodyId> = self.scenario.bodies.iter().map(|b| b.id.clone()).collect();
        for id in &ids {
            self.refresh_docking_offset(id);
        }
    }

    fn order_transfer(&mut self, ship_id: &ShipId, to: &BodyId) -> DomainEvent {
        let w = &self.world;
        let Some(ship) = w.ship(ship_id) else { return DomainEvent::rejected(RejectReason::NoShip) };
        let rej =
            |reason: RejectReason, detail: Option<String>| DomainEvent::CommandRejected { ship_id: Some(ship_id.clone()), reason, detail };
        // a star is no destination: nothing to dock at or land on
        if let Some(target) = w.body(to)
            && target.kind == BodyKind::Star
        {
            return rej(RejectReason::NotLandable, Some(target.name.clone()));
        }
        let Some(from) = ship.current_body_id.as_ref().filter(|_| ship.state != ShipState::InTransit) else {
            return rej(RejectReason::InTransit, None);
        };
        if from == to {
            return rej(RejectReason::AlreadyThere, None);
        }
        if let ScanState::Running { ship_id: scanning, .. } = &w.scan
            && scanning == ship_id
        {
            return rej(RejectReason::ScanRunning, None);
        }
        let mothership = ship.role == ShipRole::Mothership;
        let cost = self.transfers.fuel_cost(&self.solver, &self.cfg, from, to, w.time, mothership);
        if ship.fuel < cost {
            return rej(RejectReason::NoFuel, Some(format!("potrzeba {}, dostępne {}", js::to_fixed(cost, 0), js::to_fixed(ship.fuel, 0))));
        }
        if let Some(home) = w.bodies.iter().find(|b| b.is_home_base)
            && to != &home.id
            && ship.role == ShipRole::Ship
        {
            let reserve = self.transfers.return_reserve(&self.solver, &self.cfg, to, &home.id);
            if ship.fuel - cost < reserve {
                return rej(
                    RejectReason::NoReturnReserve,
                    Some(format!(
                        "po locie zostanie {}, rezerwa na powrót {}",
                        js::to_fixed(ship.fuel - cost, 0),
                        js::to_fixed(reserve, 0)
                    )),
                );
            }
        }
        let ship = ship.clone();
        let t = w.time;
        let plan = self.transfers.plan(&self.solver, &self.cfg, &ship, to, t);
        DomainEvent::TransferStarted { ship_id: ship_id.clone(), plan }
    }

    fn order_rover_move(&mut self, rover_id: &RoverId, tile_index: usize) -> DomainEvent {
        let Some(rover) = self.world.rover(rover_id) else { return DomainEvent::rejected(RejectReason::NoRover) };
        if rover.state != RoverState::Idle || rover.job.is_some() {
            return DomainEvent::rejected(RejectReason::RoverMoving);
        }
        let path =
            self.rovers.find_path(&self.grids, &rover.body_id, rover.tile_index, tile_index, &self.world.structures, &Default::default());
        let Some(path) = path.filter(|p| !p.is_empty()) else { return DomainEvent::rejected(RejectReason::NoPath) };
        let rover = rover.clone();
        self.rovers.start(&self.grids, &rover, &path);
        DomainEvent::RoverMoveOrdered { rover_id: rover_id.clone(), path }
    }

    /// Founding the colony when the port is finished; docking points follow new landing pads.
    fn after_construction(&mut self, events: &[DomainEvent], all: &mut Vec<DomainEvent>) {
        for e in events {
            let DomainEvent::StructureBuilt { structure: s, .. } = e else { continue };
            if s.kind == "LAND" {
                self.refresh_docking_offset(&s.body_id);
            }
            if s.kind == "HQ"
                && self.world.colony.founded_at.is_none()
                && self.world.colony.site_body_id.as_deref() == Some(s.body_id.as_str())
            {
                let founded = vec![DomainEvent::ColonyFounded { body_id: s.body_id.clone(), structure_id: s.id.clone() }];
                self.apply(&founded, all);
            }
        }
    }

    fn refresh_docking_offset(&mut self, body_id: &str) {
        let working: Vec<_> = self.world.structures.iter().filter(|s| s.is_working()).cloned().collect();
        let Some(grid) = self.grids.get(body_id) else { return };
        if let Some(tile) = landing_pad_tile_of(&self.grids, &working, body_id) {
            let offset = pad_docking_offset(grid, tile, self.cfg.pad_lift_factor);
            self.solver.set_docking_offset(body_id, offset);
        }
    }

    fn apply(&mut self, events: &[DomainEvent], into: &mut Vec<DomainEvent>) {
        if events.is_empty() {
            return;
        }
        reduce_all(&mut self.world, events);
        into.extend(events.iter().cloned());
    }
}

/// The part of a cargo that fits into a body's storage (halving each material until it fits).
pub fn fitting(world: &WorldState, rules: &Rules, body_id: &str, cargo: &Stockpile) -> Stockpile {
    if fits(world, rules, body_id, cargo) {
        return cargo.clone();
    }
    let mut out: Qty = Qty::new();
    let mut pool = world.storage_of(body_id);
    for (code, q) in cargo {
        let mut take = *q;
        while take > 0.0 && !fits_pool(world, rules, body_id, &pool, &Qty::from([(code.clone(), take)])) {
            take = (take / 2.0).floor();
        }
        if take > 0.0 {
            out.insert(code.clone(), take);
            let cur = pool.get(code).copied().unwrap_or(0.0);
            pool.insert(code.clone(), cur + take);
        }
    }
    out
}
