//! `MockServer` (`mock-server/src/server.ts`): one game with a fixed-step clock. Each step advances
//! `step_seconds × tempo / 60` model minutes; commands are applied between steps and logged with the
//! step index, so `replay` reproduces the world exactly.

use std::collections::VecDeque;

use indexmap::{IndexMap, IndexSet};

use game_core::economy::{Economy, EconomyParams, compute_economy, economy_tables};
use game_core::galaxy::stars::STARS;
use game_core::ids::{BodyId, tile_id, tile_index_of};
use game_core::math::footprint::footprint_tiles;
use game_core::models::command::Command;
use game_core::models::event::DomainEvent;
use game_core::sim::clock::SECONDS_PER_MODEL_MINUTE;
use game_core::sim::flows::{NominalFlows, nominal_flows};
use game_core::sim::objectives::{DEFAULT_OBJECTIVE_MATERIALS, colony_objectives};
use game_core::sim::reducer::WorldState;
use game_core::sim::scenario::top_tile;
use game_core::sim::scenarios::{LoadLevel, scenario_by_id, start_simulation};
use game_core::sim::simulation::{ColonyReadout, SimState, Simulation, SimulationOptions};
use game_core::sim::systems::{build, colony};
use game_core::sim::terrain_rules::{scale_time, tile_terrain};

use crate::contract::*;
use crate::galaxy::{DEFAULT_GALAXY_OPTIONS, GalaxyOptions, GalaxySim, GalaxySimState};

/// Scenarios a session can start (`ScenarioId`).
pub const SCENARIO_IDS: [&str; 6] = ["tau-ceti", "planeta-matka", "fabryka", "load-s", "load-m", "load-l"];

/// Milliseconds from an arbitrary origin (performance.now in the browser, Instant on the server).
pub type Clock = fn() -> f64;

pub struct SessionOptions {
    /// Real seconds per fixed step (mock: 1/60).
    pub step_seconds: f64,
    /// Upper bound of steps per `advance` call (against the spiral of death).
    pub max_steps_per_advance: u32,
    /// Simulated players and hub prices of this world alone (mock, offline WASM). `None` on the
    /// server: there the shared galaxy service has them (R-7), and the world's saves say so, so the
    /// client's replica runs without them too.
    pub galaxy: Option<GalaxyOptions>,
    /// Clock for step timing.
    pub clock: Clock,
    /// Tempo of a fresh start (mock: 60).
    pub start_tempo: f64,
}

fn zero_clock() -> f64 {
    0.0
}

impl Default for SessionOptions {
    fn default() -> SessionOptions {
        SessionOptions {
            step_seconds: 1.0 / 60.0,
            max_steps_per_advance: 8,
            galaxy: Some(DEFAULT_GALAXY_OPTIONS),
            clock: zero_clock,
            start_tempo: 60.0,
        }
    }
}

/// `meta` of a save file: the world's own galaxy, `null` when it has none (a server world).
#[derive(serde::Serialize)]
struct Meta {
    galaxy: Option<GalaxySimState>,
}

pub struct GameSession {
    pub step_seconds: f64,
    max_steps: u32,
    clock: Clock,
    galaxy_options: Option<GalaxyOptions>,
    start_tempo: f64,
    scenario_id: String,
    economy_params: Option<EconomyParams>,
    sim: Simulation,
    galaxy: Option<GalaxySim>,
    tempo: f64,
    tempos: Vec<TempoChange>,
    paused: bool,
    step_index: u64,
    commands: Vec<RecordedCommand>,
    accumulator: f64,
    timings: VecDeque<(f64, f64)>,
    doc_economy: Option<Economy>,
    /// Bumped whenever the world is replaced (start, load, replay, resume): followers reset.
    generation: u64,
}

/// A saved game that continues exactly: the save file plus the step state outside the world.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Checkpoint {
    pub save: SaveFile,
    pub sim: SimState,
}

fn load_level(id: &str) -> Option<LoadLevel> {
    match id {
        "load-s" | "load-m" | "load-l" => LoadLevel::parse(id),
        _ => None,
    }
}

/// The world's galaxy as its save file has it: absent or unreadable → a fresh one (older files),
/// `null` → none, a state → that state (when this session runs world galaxies at all).
fn galaxy_of_save(meta: &serde_json::Value, eco: &Economy, opts: Option<GalaxyOptions>) -> Option<GalaxySim> {
    let opts = opts?;
    match meta.get("galaxy") {
        Some(serde_json::Value::Null) => None,
        Some(v) => Some(GalaxySim::new(eco, opts, serde_json::from_value::<GalaxySimState>(v.clone()).ok())),
        None => Some(GalaxySim::new(eco, opts, None)),
    }
}

fn galaxy_for(opts: GalaxyOptions, level: Option<LoadLevel>) -> GalaxyOptions {
    match level {
        None | Some(LoadLevel::S) => opts,
        Some(LoadLevel::M) => GalaxyOptions { players: 12, ..opts },
        Some(LoadLevel::L) => GalaxyOptions { players: 60, ..opts },
    }
}

pub type SessionResult<T> = Result<T, String>;

impl GameSession {
    pub fn new(opts: SessionOptions) -> GameSession {
        let (sim, galaxy, eco) = Self::fresh("tau-ceti", None, opts.galaxy).expect("tau-ceti exists");
        drop(eco);
        GameSession {
            step_seconds: opts.step_seconds,
            max_steps: opts.max_steps_per_advance,
            clock: opts.clock,
            galaxy_options: opts.galaxy,
            start_tempo: opts.start_tempo,
            scenario_id: "tau-ceti".to_string(),
            economy_params: None,
            sim,
            galaxy,
            tempo: opts.start_tempo,
            tempos: vec![TempoChange { step: 0, tempo: opts.start_tempo }],
            paused: false,
            step_index: 0,
            commands: Vec::new(),
            accumulator: 0.0,
            timings: VecDeque::new(),
            doc_economy: None,
            generation: 0,
        }
    }

    /// How many times the world was replaced since this session was made.
    pub fn generation(&self) -> u64 {
        self.generation
    }

    fn fresh(
        id: &str,
        economy: Option<&EconomyParams>,
        galaxy: Option<GalaxyOptions>,
    ) -> SessionResult<(Simulation, Option<GalaxySim>, Economy)> {
        if !SCENARIO_IDS.contains(&id) {
            return Err(format!("unknown scenario {id}"));
        }
        let eco = compute_economy(economy.cloned().unwrap_or_default());
        let sim = start_simulation(id, Some(eco.clone())).ok_or_else(|| format!("unknown scenario {id}"))?;
        let galaxy = galaxy.map(|g| GalaxySim::new(&eco, galaxy_for(g, load_level(id)), None));
        Ok((sim, galaxy, eco))
    }

    pub fn simulation(&self) -> &Simulation {
        &self.sim
    }

    pub fn scenario_id(&self) -> &str {
        &self.scenario_id
    }

    pub fn step_index(&self) -> u64 {
        self.step_index
    }

    pub fn tempo(&self) -> f64 {
        self.tempo
    }

    pub fn is_paused(&self) -> bool {
        self.paused
    }

    pub fn economy_params(&self) -> Option<&EconomyParams> {
        self.economy_params.as_ref()
    }

    /// Model minutes one step advances at the current tempo.
    pub fn step_minutes(&self) -> f64 {
        (self.step_seconds * self.tempo) / SECONDS_PER_MODEL_MINUTE
    }

    pub fn start(&mut self, scenario_id: &str, economy: Option<EconomyParams>, tempo: Option<f64>) -> SessionResult<GameSnapshot> {
        let (sim, galaxy, _) = Self::fresh(scenario_id, economy.as_ref(), self.galaxy_options)?;
        let tempo = tempo.unwrap_or(self.start_tempo);
        self.scenario_id = scenario_id.to_string();
        self.economy_params = economy;
        self.sim = sim;
        self.galaxy = galaxy;
        self.tempo = tempo;
        self.tempos = vec![TempoChange { step: 0, tempo }];
        self.step_index = 0;
        self.commands.clear();
        self.accumulator = 0.0;
        self.paused = false;
        self.generation += 1;
        Ok(self.snapshot())
    }

    /// Applies a command now, between steps, and records it for replay.
    pub fn command(&mut self, cmd: Command) -> CommandResult {
        let events = self.sim.dispatch(&cmd);
        self.commands.push(RecordedCommand { step: self.step_index, command: cmd });
        CommandResult { ok: !events.iter().any(|e| e.is_rejection()), events }
    }

    pub fn set_tempo(&mut self, tempo: f64) -> SessionResult<()> {
        if tempo.is_nan() || tempo <= 0.0 || tempo.is_infinite() {
            return Err(format!("tempo must be positive: {tempo}"));
        }
        if tempo == self.tempo {
            return Ok(());
        }
        self.tempo = tempo;
        match self.tempos.last_mut() {
            Some(last) if last.step == self.step_index => last.tempo = tempo,
            _ => self.tempos.push(TempoChange { step: self.step_index, tempo }),
        }
        Ok(())
    }

    /// A tempo change of the schedule as it was recorded elsewhere: the same entry list as the
    /// original, also when it kept a change back to the tempo before (`set_tempo` would skip it).
    fn apply_tempo(&mut self, change: TempoChange) -> SessionResult<()> {
        if change.tempo.is_nan() || change.tempo <= 0.0 || change.tempo.is_infinite() {
            return Err(format!("tempo must be positive: {}", change.tempo));
        }
        self.tempo = change.tempo;
        match self.tempos.last_mut() {
            Some(last) if last.step == change.step => last.tempo = change.tempo,
            _ => self.tempos.push(change),
        }
        Ok(())
    }

    pub fn pause(&mut self) {
        self.paused = true;
    }

    pub fn resume(&mut self) {
        self.paused = false;
    }

    /// Runs one fixed step regardless of pause.
    pub fn step(&mut self) -> Vec<DomainEvent> {
        let t0 = (self.clock)();
        let events = self.sim.step(self.step_minutes());
        if let Some(g) = self.galaxy.as_mut() {
            g.advance(self.sim.time());
        }
        self.step_index += 1;
        let t1 = (self.clock)();
        self.timings.push_back((t1, t1 - t0));
        while self.timings.front().is_some_and(|(at, _)| t1 - at > 1000.0) {
            self.timings.pop_front();
        }
        events
    }

    /// Runs `n` steps (while paused: "krok").
    pub fn step_many(&mut self, n: u64) -> Vec<DomainEvent> {
        let mut out = Vec::new();
        for _ in 0..n {
            out.extend(self.step());
        }
        out
    }

    /// Real time passed → fixed steps (unless paused). Excess beyond `max_steps_per_advance` is dropped.
    pub fn advance(&mut self, real_seconds: f64) -> Vec<DomainEvent> {
        if self.paused {
            return Vec::new();
        }
        self.accumulator += real_seconds.max(0.0);
        let n = (self.max_steps as f64).min((self.accumulator / self.step_seconds + 1e-9).floor()) as u32;
        self.accumulator = if n == self.max_steps { 0.0 } else { self.accumulator - n as f64 * self.step_seconds };
        self.step_many(n as u64)
    }

    pub fn stats(&self) -> StepStats {
        let n = self.timings.len();
        let mean_ms = if n > 0 { self.timings.iter().map(|(_, ms)| ms).sum::<f64>() / n as f64 } else { 0.0 };
        let max_ms = self.timings.iter().map(|(_, ms)| *ms).fold(if n > 0 { f64::NEG_INFINITY } else { 0.0 }, f64::max);
        StepStats {
            mean_ms,
            max_ms,
            steps_per_second: n as f64,
            minutes_per_second: if self.paused { 0.0 } else { self.tempo / SECONDS_PER_MODEL_MINUTE },
        }
    }

    pub fn snapshot(&self) -> GameSnapshot {
        let world = &self.sim.world;
        let mut bodies: IndexSet<BodyId> = IndexSet::new();
        for s in &world.structures {
            bodies.insert(s.body_id.clone());
        }
        for b in world.storage.keys() {
            bodies.insert(b.clone());
        }
        let colonies: IndexMap<BodyId, ColonyReadout> = bodies.into_iter().map(|b| (b.clone(), self.sim.colony_of(&b))).collect();
        GameSnapshot {
            scenario_id: self.scenario_id.clone(),
            world: world.clone(),
            colonies,
            objectives: colony_objectives(world, &self.sim.rules, &self.sim.grids, &DEFAULT_OBJECTIVE_MATERIALS),
            players: self.galaxy.as_ref().map(|g| g.players()).unwrap_or_default(),
            hubs: self.galaxy.as_ref().map(|g| g.hubs()).unwrap_or_default(),
            tempo: self.tempo,
            paused: self.paused,
            step: self.step_index,
            stats: self.stats(),
        }
    }

    /// F6: document tables (default parameters) next to the tables of `params` (default: the running economy).
    pub fn economy_report(&mut self, params: Option<EconomyParams>) -> EconomyReport {
        let current = match params {
            Some(p) => compute_economy(p),
            None => self.sim.rules.economy.clone(),
        };
        let doc = self.doc_economy.get_or_insert_with(|| compute_economy(EconomyParams::default()));
        EconomyReport {
            params: current.params.clone(),
            defaults: EconomyParams::default(),
            doc: economy_tables(doc),
            current: economy_tables(&current),
        }
    }

    pub fn nominal_flows(&self, body_id: &str) -> NominalFlows {
        nominal_flows(&self.sim.world, &self.sim.rules, &self.sim.grids, body_id)
    }

    pub fn catalog(&self) -> CatalogView {
        let rules = &self.sim.rules;
        let eco = &rules.economy;
        let buildings = eco
            .buildings()
            .iter()
            .chain(eco.vehicles().iter())
            .map(|b| {
                let levels = (1..=b.max_l)
                    .map(|l| {
                        let s = rules.spec(&b.id, l);
                        CatalogLevel {
                            level: l,
                            cost: s.cost.clone(),
                            build_time: s.build_time,
                            power: s.power,
                            crew: s.crew,
                            storage: s.storage.clone(),
                            output_factor: s.output_factor,
                        }
                    })
                    .collect();
                CatalogBuilding {
                    id: b.id.clone(),
                    name: b.name.clone(),
                    era: b.era,
                    category: b.cat.clone(),
                    footprint: rules.spec(&b.id, 1).footprint,
                    max_level: b.max_l,
                    buildable: rules.is_buildable(&b.id),
                    levels,
                    extracts: rules.extraction(&b.id).iter().map(|e| Extracts { material: e.material.clone(), rate: e.rate }).collect(),
                    recipes: rules.processes(&b.id).iter().map(|r| r.id.clone()).collect(),
                }
            })
            .collect();
        let c = &self.sim.scenario.colonization;
        let (rover_cost, rover_time) = rules.vehicle("ROV");
        CatalogView {
            stars: STARS
                .iter()
                .map(|s| CatalogStar {
                    name: s.name.clone(),
                    spectral_class: s.spectral_class.clone(),
                    distance: s.distance,
                    luminosity: s.luminosity,
                    temperature: s.temperature,
                    planets: s.planets.unwrap_or(0),
                    color: s.color.clone(),
                    description: s.description.clone(),
                    pos: s.pos,
                })
                .collect(),
            materials: eco
                .materials()
                .iter()
                .map(|m| CatalogMaterial {
                    id: m.id.clone(),
                    name: m.name.clone(),
                    tier: m.tier.clone(),
                    cls: m.cls.clone(),
                    unit: m.unit.clone(),
                })
                .collect(),
            buildings,
            recipes: eco
                .recipes
                .iter()
                .map(|r| CatalogRecipe {
                    id: r.id.clone(),
                    building: r.building.clone(),
                    inp: r.inp.clone(),
                    out: r.out.clone(),
                    time: r.time,
                    power: r.power,
                })
                .collect(),
            rover: CatalogVehicle { cost: rover_cost, build_time: rover_time },
            colonization: CatalogColonization {
                scan_minutes: c.scan_minutes,
                port_cost: c.port_cost.clone(),
                port_build_minutes: c.port_build_minutes,
                shuttle_capacity: c.shuttle_capacity,
                shuttle_trip_minutes: c.shuttle_trip_minutes,
            },
            terrain: rules.terrain().clone(),
        }
    }

    /// Whether each kind could be ordered on the body now ("MIN@2" asks about level 2).
    pub fn availability(&self, body_id: &str, kinds: &[String]) -> IndexMap<String, Availability> {
        let mut out = IndexMap::new();
        for key in kinds {
            let (kind, level) = match key.split_once('@') {
                Some((k, l)) => (k, l.parse::<u32>().unwrap_or(1)),
                None => (key.as_str(), 1),
            };
            let a = match build::availability(&self.sim.world, &self.sim.rules, body_id, kind, level) {
                Ok(()) => Availability { ok: true, reason: None, detail: None },
                Err(f) => Availability { ok: false, reason: Some(f.reason), detail: f.detail },
            };
            out.insert(key.clone(), a);
        }
        out
    }

    /// Placement ghost: BUILD check, or the spaceport check for the pseudo-kind 'PORT'. Past the
    /// terrain stage it adds the terrain-adjusted `cost` and `build_time` (also when a later stage rejects).
    pub fn preview_build(&self, body_id: &str, tile_index: usize, kind: &str, rotation: i64) -> BuildPreview {
        let anchor = tile_id(body_id, tile_index);
        let grid = self.sim.grids.get(body_id);
        let rules = &self.sim.rules;
        let footprint = |size: usize| grid.and_then(|g| footprint_tiles(g, tile_index, size, rotation)).unwrap_or_default();
        // (cost, build time) on this terrain, when the check priced the site
        let priced = |k: &str, price: Option<&build::SitePrice>| match price {
            Some(p) => (Some(p.cost.clone()), Some(scale_time(rules.spec(k, 1).build_time, p.time_pct))),
            None => (None, None),
        };
        if kind == "PORT" {
            let check = colony::check_spaceport(
                &self.sim.world,
                &self.sim.grids,
                rules,
                &self.sim.scenario.colonization,
                body_id,
                &anchor,
                rotation,
            );
            let tiles = footprint(rules.spec("HQ", 1).footprint);
            return match check {
                Ok(c) => {
                    let (cost, build_time) = priced("HQ", Some(&c.price));
                    BuildPreview { ok: true, reason: None, detail: None, tiles, cost, build_time }
                }
                Err(f) => {
                    let (cost, build_time) = priced("HQ", f.price.as_ref());
                    BuildPreview { ok: false, reason: Some(f.fail.reason), detail: f.fail.detail, tiles, cost, build_time }
                }
            };
        }
        match build::check(&self.sim.world, &self.sim.grids, rules, body_id, &anchor, kind, rotation) {
            Ok(c) => {
                let (cost, build_time) = priced(kind, Some(&c.price));
                let tiles = c.tiles.iter().map(|t| tile_index_of(t)).collect();
                BuildPreview { ok: true, reason: None, detail: None, tiles, cost, build_time }
            }
            Err(f) => {
                let size = if rules.has(kind) { rules.spec(kind, 1).footprint } else { 1 };
                let (cost, build_time) = priced(kind, f.price.as_ref());
                BuildPreview { ok: false, reason: Some(f.fail.reason), detail: f.fail.detail, tiles: footprint(size), cost, build_time }
            }
        }
    }

    /// One surface tile for the tile panel: shape, deposit left, terrain (class, road, cost and time %),
    /// what stands there, every buildable kind checked here.
    pub fn tile_info(&self, body_id: &str, tile_index: usize) -> Option<TileInfo> {
        let tile = self.sim.grids.get(body_id)?.tiles.get(tile_index)?;
        let w = &self.sim.world;
        let rules = &self.sim.rules;
        let owner = w.structures.iter().find(|s| s.body_id == body_id && s.tiles.contains(&tile.id));
        let options = rules
            .buildable_kinds()
            .into_iter()
            .map(|kind| {
                let p = self.preview_build(body_id, tile_index, &kind, 0);
                let ext = rules.extraction(&kind);
                let matched = match &tile.deposit {
                    Some(d) => ext.iter().find(|e| e.material == d.resource),
                    None => rules.extracts_anywhere(&kind),
                };
                TileOption { kind, ok: p.ok, reason: p.reason, detail: p.detail, extracts: matched.map(|e| e.material.clone()) }
            })
            .collect();
        Some(TileInfo {
            body_id: body_id.to_string(),
            index: tile.index,
            kind: tile.kind,
            deposit: tile.deposit.as_ref().map(|d| TileDeposit {
                material: d.resource.clone(),
                initial: d.amount,
                remaining: w.deposits.get(&tile.id).copied().unwrap_or(d.amount),
            }),
            terrain: tile_terrain(tile, rules.terrain()),
            structure_id: owner.map(|s| s.id.clone()),
            options,
        })
    }

    /// Nearest valid tile to the body's port (or its top tile) for `kind`; rotations tried in order.
    /// With `material`, only tiles whose deposit is that material.
    pub fn suggest_tile(&self, body_id: &str, kind: &str, material: Option<&str>) -> SessionResult<Option<TileChoice>> {
        let Some(grid) = self.sim.grids.get(body_id) else { return Ok(None) };
        if kind != "PORT" && !self.sim.rules.has(kind) {
            return Err(format!("unknown building {kind}"));
        }
        let port = self.sim.world.structures.iter().find(|s| s.kind == "HQ" && s.body_id == body_id);
        let start = port.map(|p| tile_index_of(&p.tile_id)).unwrap_or_else(|| top_tile(grid).index);
        let single = kind != "PORT" && self.sim.rules.spec(kind, 1).footprint == 1;
        let mut seen = vec![false; grid.tiles.len()];
        seen[start] = true;
        let mut queue = vec![start];
        let mut q = 0;
        while q < queue.len() {
            let index = queue[q];
            q += 1;
            let tile = &grid.tiles[index];
            let wanted = material.is_none_or(|m| tile.deposit.as_ref().is_some_and(|d| d.resource == m));
            if wanted {
                for rotation in 0..tile.neighbors.len() as i64 {
                    if self.preview_build(body_id, index, kind, rotation).ok {
                        return Ok(Some(TileChoice { tile_index: index, rotation }));
                    }
                    if single {
                        break;
                    }
                }
            }
            for &n in &tile.neighbors {
                if !seen[n] {
                    seen[n] = true;
                    queue.push(n);
                }
            }
        }
        Ok(None)
    }

    pub fn frame(&self) -> FrameData {
        let snap = &self.sim.snapshot;
        FrameData {
            time: self.sim.time(),
            rovers: snap.rover_local_pos.iter().map(|(id, p)| (id.clone(), [p.x, p.y, p.z])).collect(),
            transit: snap.transit_progress.iter().map(|(id, u)| (id.clone(), *u)).collect(),
        }
    }

    pub fn save(&self) -> SaveFile {
        let meta = Meta { galaxy: self.galaxy.as_ref().map(|g| g.save()) };
        SaveFile {
            format: "space-game-save".to_string(),
            version: 1,
            scenario_id: self.scenario_id.clone(),
            economy: self.economy_params.clone(),
            step_seconds: self.step_seconds,
            tempos: self.tempos.clone(),
            step: self.step_index,
            world: self.sim.world.clone(),
            commands: self.commands.clone(),
            meta: serde_json::to_value(meta).expect("galaxy state serialises"),
        }
    }

    /// Continues a saved game from its world.
    pub fn load(&mut self, file: SaveFile) -> SessionResult<GameSnapshot> {
        Self::assert_file(&file)?;
        let scenario = scenario_by_id(&file.scenario_id).ok_or_else(|| format!("unknown scenario {}", file.scenario_id))?;
        let eco = compute_economy(file.economy.clone().unwrap_or_default());
        self.galaxy = galaxy_of_save(&file.meta, &eco, self.galaxy_options);
        self.sim = Simulation::new(scenario, SimulationOptions { economy: Some(eco), world: Some(file.world) });
        self.scenario_id = file.scenario_id;
        self.economy_params = file.economy;
        self.tempos = file.tempos;
        self.tempo = self.tempos.last().map(|t| t.tempo).unwrap_or(self.start_tempo);
        self.step_index = file.step;
        self.commands = file.commands;
        self.accumulator = 0.0;
        self.generation += 1;
        Ok(self.snapshot())
    }

    /// Save file plus the step state: [`GameSession::restore`] continues it exactly.
    pub fn checkpoint(&self) -> Checkpoint {
        Checkpoint { save: self.save(), sim: self.sim.export_state() }
    }

    /// Continues a checkpoint exactly where it was taken, at its step length.
    pub fn restore(&mut self, cp: Checkpoint) -> SessionResult<()> {
        self.step_seconds = cp.save.step_seconds;
        self.load(cp.save)?;
        self.sim.import_state(&cp.sim);
        Ok(())
    }

    /// Follows changes made elsewhere (the server's world, a log tail): at each step from the current
    /// one, its tempo changes and commands, then the step, up to `step`; the changes at `step` itself
    /// come last. Same order as `replay`, so the result is the same world. Returns the events.
    pub fn follow(&mut self, step: u64, tempos: &[TempoChange], commands: &[RecordedCommand]) -> SessionResult<Vec<DomainEvent>> {
        let from = self.step_index;
        if step < from {
            return Err(format!("cannot follow back to step {step} from {from}"));
        }
        let in_range = |s: u64| (from..=step).contains(&s);
        if !tempos.windows(2).all(|w| w[0].step <= w[1].step) || !tempos.iter().all(|t| in_range(t.step)) {
            return Err(format!("tempo changes outside steps {from}..={step}"));
        }
        if !commands.windows(2).all(|w| w[0].step <= w[1].step) || !commands.iter().all(|c| in_range(c.step)) {
            return Err(format!("commands outside steps {from}..={step}"));
        }
        let (mut ti, mut ci) = (0usize, 0usize);
        let mut events = Vec::new();
        loop {
            let s = self.step_index;
            while ti < tempos.len() && tempos[ti].step == s {
                self.apply_tempo(tempos[ti])?;
                ti += 1;
            }
            while ci < commands.len() && commands[ci].step == s {
                events.extend(self.command(commands[ci].command.clone()).events);
                ci += 1;
            }
            if s >= step {
                return Ok(events);
            }
            events.extend(self.step());
        }
    }

    /// FNV-1a 64 of everything that decides the future of the game (world, step state, simulated
    /// players, step, tempo), as hex. Equal on the server and on the client's replica.
    pub fn state_hash(&self) -> String {
        // into a byte buffer (the serialiser the module already has), then FNV-1a 64
        let galaxy = self.galaxy.as_ref().map(|g| g.save());
        let bytes =
            serde_json::to_vec(&(&self.sim.world, self.sim.export_state(), &galaxy, self.step_index, self.tempo)).unwrap_or_default();
        let hash = bytes.iter().fold(0xcbf2_9ce4_8422_2325u64, |h, &b| (h ^ b as u64).wrapping_mul(0x0000_0100_0000_01b3));
        format!("{hash:016x}")
    }

    /// Re-runs the scenario from its start with the file's commands and tempos, up to its step.
    pub fn replay(&mut self, file: SaveFile) -> SessionResult<ReplayResult> {
        Self::assert_file(&file)?;
        if file.step_seconds != self.step_seconds {
            return Err(format!("step length differs: {} vs {}", file.step_seconds, self.step_seconds));
        }
        self.start(&file.scenario_id, file.economy.clone(), Some(file.tempos.first().map(|t| t.tempo).unwrap_or(self.start_tempo)))?;
        let (mut ti, mut ci, mut rejected) = (1usize, 0usize, 0u64);
        for s in 0..=file.step {
            while ti < file.tempos.len() && file.tempos[ti].step == s {
                self.set_tempo(file.tempos[ti].tempo)?;
                ti += 1;
            }
            while ci < file.commands.len() && file.commands[ci].step == s {
                if !self.command(file.commands[ci].command.clone()).ok {
                    rejected += 1;
                }
                ci += 1;
            }
            if s < file.step {
                self.step();
            }
        }
        self.generation += 1;
        Ok(ReplayResult { snapshot: self.snapshot(), replay_stats: ReplayStats { commands: file.commands.len() as u64, rejected } })
    }

    fn assert_file(file: &SaveFile) -> SessionResult<()> {
        if file.format != "space-game-save" || file.version != 1 {
            return Err("not a space-game save file (v1)".to_string());
        }
        if !SCENARIO_IDS.contains(&file.scenario_id.as_str()) {
            return Err(format!("unknown scenario {}", file.scenario_id));
        }
        Ok(())
    }

    /// The world, for the server's persistence.
    pub fn world(&self) -> &WorldState {
        &self.sim.world
    }

    /// Commands recorded since the start (the replay log).
    pub fn commands(&self) -> &[RecordedCommand] {
        &self.commands
    }

    pub fn tempos(&self) -> &[TempoChange] {
        &self.tempos
    }
}
