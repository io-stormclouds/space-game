import { BodyId, RoverId, ShipId } from '../shared/ids';
import { GameConstants } from './config/game-constants';
import { crewBalance, fits, powerBalance, storageCapacity, storageUse } from './economy/colony';
import { FrameSnapshot, createSnapshot } from './frame-snapshot';
import { AsteroidShape, asteroidShape } from './math/asteroid-shape';
import { OrbitSolver } from './math/orbit-solver';
import { DomainEvent } from './models/domain-event.model';
import { PlanetGrid, TileId } from './models/planet-grid.model';
import { Cost, Stockpile } from './models/resource.model';
import { StructureKind, isWorking } from './models/structure.model';
import { WorldState, reduceAll, storageOf } from './reducer';
import { Rules } from './rules';
import { Scenario, buildWorldGrids, createWorld, landingPadTileOf, padDockingOffset, scenarioConstants } from './scenario';
import { BuildSystem } from './systems/build-system';
import { ColonySystem } from './systems/colony-system';
import { ConstructionSystem } from './systems/construction-system';
import { DockingSystem } from './systems/docking-system';
import { ExtractionSystem } from './systems/extraction-system';
import { MiningSystem } from './systems/mining-system';
import { ProductionSystem } from './systems/production-system';
import { RoverSystem } from './systems/rover-system';
import { TransferSystem } from './systems/transfer-system';
import type { Economy } from '../economy';

/** Player orders. The mock server (F2) receives these through GameApi. */
export type Command =
  | { type: 'MOVE_SHIP'; shipId: ShipId; to: BodyId }
  | { type: 'BUILD'; bodyId: BodyId; tileId: TileId; kind: StructureKind; rotation?: number }
  | { type: 'UPGRADE'; structureId: string }
  | { type: 'CANCEL_CONSTRUCTION'; structureId: string }
  | { type: 'DEMOLISH'; structureId: string }
  | { type: 'SET_RECIPE'; structureId: string; recipe: string }
  | { type: 'MOVE_ROVER'; roverId: RoverId; tileIndex: number }
  | { type: 'ASSIGN_ROVER'; roverId: RoverId; structureId: string }
  | { type: 'PRODUCE_ROVER'; bodyId: BodyId }
  | { type: 'SCAN_SYSTEM'; shipId: ShipId }
  | { type: 'CHOOSE_COLONY_SITE'; bodyId: BodyId }
  | { type: 'PLACE_SPACEPORT'; bodyId: BodyId; tileId: TileId; rotation?: number }
  | { type: 'CALL_SHUTTLE'; bodyId: BodyId; cargo: Cost };

export type CommandType = Command['type'];

export interface SimulationOptions {
  /** Economy with changed parameters (F6 designer panel); default catalog otherwise. */
  economy?: Economy;
  /** Continue from a saved world instead of the scenario's start. */
  world?: WorldState;
}

/** Colony summary of a body, for the HUD. */
export interface ColonyReadout {
  storage: Stockpile;
  capacity: ReturnType<typeof storageCapacity>;
  used: ReturnType<typeof storageUse>;
  power: ReturnType<typeof powerBalance>;
  crew: ReturnType<typeof crewBalance>;
}

/**
 * The whole game without a framework: one scenario, its rules, the systems, the clock and the
 * per-frame snapshot. `step(dt)` advances model minutes; `dispatch(cmd)` validates an order.
 * Same scenario + same commands at the same times + same steps ⇒ the same world.
 */
export class Simulation {
  readonly rules: Rules;
  readonly cfg: GameConstants;
  readonly grids: ReadonlyMap<BodyId, PlanetGrid>;
  readonly shapes: ReadonlyMap<BodyId, AsteroidShape>;
  readonly solver: OrbitSolver;
  readonly snapshot: FrameSnapshot;
  readonly transfers: TransferSystem;
  readonly rovers: RoverSystem;
  readonly builder: BuildSystem;
  readonly colony: ColonySystem;
  private readonly mining: MiningSystem;
  private readonly docking = new DockingSystem();
  private readonly construction: ConstructionSystem;
  private readonly extraction: ExtractionSystem;
  private readonly production: ProductionSystem;
  world: WorldState;

  constructor(
    readonly scenario: Scenario,
    opts: SimulationOptions = {},
  ) {
    this.rules = new Rules(opts.economy, scenario.overrides);
    this.cfg = scenarioConstants(scenario);
    this.grids = buildWorldGrids(scenario.bodies);
    this.shapes = new Map(scenario.bodies.filter((b) => b.shape).map((b) => [b.id, asteroidShape(b)]));
    this.solver = new OrbitSolver(scenario.bodies);
    this.snapshot = createSnapshot(scenario.bodies.map((b) => b.id));
    this.transfers = new TransferSystem(this.solver, this.cfg);
    this.rovers = new RoverSystem(this.grids, this.cfg);
    this.builder = new BuildSystem(this.grids, this.rules);
    this.colony = new ColonySystem(this.rules, this.grids, this.builder, scenario.colonization);
    this.mining = new MiningSystem(this.cfg);
    this.construction = new ConstructionSystem(this.rules, this.rovers);
    this.extraction = new ExtractionSystem(this.rules, this.grids);
    this.production = new ProductionSystem(this.rules);
    this.world = opts.world ?? createWorld(scenario, this.grids, this.rules);
    for (const b of scenario.bodies) this.refreshDockingOffset(b.id);
    for (const [id, out] of this.snapshot.bodyLocalPos) this.solver.localPosition(id, this.world.time, out);
  }

  get time(): number {
    return this.world.time;
  }

  /** Advances the world by `dt` model minutes. Returns the discrete events that occurred. */
  step(dt: number): DomainEvent[] {
    const all: DomainEvent[] = [];
    const t = this.world.time + Math.max(0, dt);
    this.world = { ...this.world, time: t };
    const snap = this.snapshot;
    snap.time = t;
    for (const [id, out] of snap.bodyLocalPos) this.solver.localPosition(id, t, out);

    const first: DomainEvent[] = [];
    first.push(...this.transfers.update(this.world.ships, t, dt, snap));
    first.push(...this.mining.update(this.world.ships, this.world.bodies, dt));
    first.push(...this.colony.update(this.world));
    first.push(...this.rovers.update(this.world.rovers, dt, snap));
    this.apply(first, all);

    const docked: DomainEvent[] = [];
    for (const e of first) {
      if (e.type !== 'TRANSFER_ARRIVED') continue;
      const ship = this.world.ships.find((s) => s.id === e.shipId);
      const body = this.world.bodies.find((b) => b.id === e.bodyId);
      if (ship && body) docked.push(...this.docking.onArrival(ship, body, (cargo) => this.fitting(body.id, cargo)));
    }
    this.apply(docked, all);

    this.apply(this.construction.assign(this.world), all);
    const built = this.construction.progress(this.world, dt);
    this.world = built.world;
    this.apply(built.events, all);
    this.afterConstruction(built.events, all);

    this.apply(this.extraction.update(this.world, dt), all);
    const made = this.production.update(this.world, dt);
    this.world = made.world;
    this.apply(made.events, all);

    const focus = this.world.ships.find((s) => s.state === 'IN_TRANSIT')?.id ?? null;
    this.transfers.writeTrajectory(focus, snap);
    return all;
  }

  /** Validates and applies one order. Returns its events (COMMAND_REJECTED when refused). */
  dispatch(cmd: Command): DomainEvent[] {
    const all: DomainEvent[] = [];
    const w = this.world;
    switch (cmd.type) {
      case 'MOVE_SHIP':
        this.apply([this.orderTransfer(cmd.shipId, cmd.to)], all);
        break;
      case 'BUILD':
        this.apply([this.builder.build(w, cmd.bodyId, cmd.tileId, cmd.kind, w.time, cmd.rotation)], all);
        break;
      case 'UPGRADE':
        this.apply([this.builder.upgrade(w, cmd.structureId)], all);
        break;
      case 'CANCEL_CONSTRUCTION':
        this.apply([this.builder.cancel(w, cmd.structureId)], all);
        break;
      case 'DEMOLISH':
        this.apply([this.builder.demolish(w, cmd.structureId)], all);
        break;
      case 'SET_RECIPE': {
        const s = w.structures.find((x) => x.id === cmd.structureId);
        const ok = s && this.rules.processes(s.kind).some((r) => r.id === cmd.recipe);
        this.apply([ok ? { type: 'RECIPE_SET', structureId: cmd.structureId, recipe: cmd.recipe } : { type: 'COMMAND_REJECTED', reason: s ? 'NO_RECIPE' : 'NO_STRUCTURE' }], all);
        break;
      }
      case 'MOVE_ROVER':
        this.apply([this.orderRoverMove(cmd.roverId, cmd.tileIndex)], all);
        break;
      case 'ASSIGN_ROVER': {
        const site = w.structures.find((s) => s.id === cmd.structureId);
        const rover = w.rovers.find((r) => r.id === cmd.roverId);
        if (!site || site.state === 'ACTIVE') this.apply([{ type: 'COMMAND_REJECTED', reason: 'NO_STRUCTURE' }], all);
        else if (!rover) this.apply([{ type: 'COMMAND_REJECTED', reason: 'NO_ROVER' }], all);
        else if (rover.state === 'MOVING' || rover.job) this.apply([{ type: 'COMMAND_REJECTED', reason: 'ROVER_MOVING' }], all);
        else {
          const order = this.construction.sendTo(w, rover.id, site);
          this.apply(order.length ? order : [{ type: 'COMMAND_REJECTED', reason: 'NO_PATH' }], all);
        }
        break;
      }
      case 'PRODUCE_ROVER':
        this.apply([this.colony.produceRover(w, cmd.bodyId)], all);
        break;
      case 'SCAN_SYSTEM':
        this.apply([this.colony.scan(w, cmd.shipId)], all);
        break;
      case 'CHOOSE_COLONY_SITE':
        this.apply([this.colony.chooseSite(w, cmd.bodyId)], all);
        break;
      case 'PLACE_SPACEPORT':
        this.apply([this.colony.placeSpaceport(w, cmd.bodyId, cmd.tileId, cmd.rotation)], all);
        break;
      case 'CALL_SHUTTLE':
        this.apply([this.colony.callShuttle(w, cmd.bodyId, cmd.cargo)], all);
        break;
    }
    return all;
  }

  /** Storage, capacity, power and crew of a body. */
  colonyOf(bodyId: BodyId): ColonyReadout {
    return {
      storage: storageOf(this.world, bodyId),
      capacity: storageCapacity(this.world, this.rules, bodyId),
      used: storageUse(this.world, this.rules, bodyId),
      power: powerBalance(this.world, this.rules, bodyId),
      crew: crewBalance(this.world, this.rules, bodyId),
    };
  }

  /** Replaces the world (load a saved game). Flights and drives are rebuilt from the state. */
  load(world: WorldState): void {
    this.world = world;
    for (const b of this.scenario.bodies) this.refreshDockingOffset(b.id);
  }

  private orderTransfer(shipId: ShipId, to: BodyId): DomainEvent {
    const w = this.world;
    const ship = w.ships.find((s) => s.id === shipId);
    if (!ship) return { type: 'COMMAND_REJECTED', reason: 'NO_SHIP' };
    // a star is no destination: nothing to dock at or land on
    const target = w.bodies.find((b) => b.id === to);
    if (target?.kind === 'STAR') return { type: 'COMMAND_REJECTED', shipId, reason: 'NOT_LANDABLE', detail: target.name };
    if (ship.state === 'IN_TRANSIT' || !ship.currentBodyId) return { type: 'COMMAND_REJECTED', shipId, reason: 'IN_TRANSIT' };
    if (ship.currentBodyId === to) return { type: 'COMMAND_REJECTED', shipId, reason: 'ALREADY_THERE' };
    if (w.scan.state === 'RUNNING' && w.scan.shipId === shipId) return { type: 'COMMAND_REJECTED', shipId, reason: 'SCAN_RUNNING' };
    const cost = this.transfers.fuelCost(ship.currentBodyId, to, w.time);
    if (ship.fuel < cost) {
      return { type: 'COMMAND_REJECTED', shipId, reason: 'NO_FUEL', detail: `potrzeba ${cost.toFixed(0)}, dostępne ${ship.fuel.toFixed(0)}` };
    }
    const home = w.bodies.find((b) => b.isHomeBase);
    if (home && to !== home.id && ship.role === 'SHIP') {
      const reserve = this.transfers.returnReserve(to, home.id);
      if (ship.fuel - cost < reserve) {
        return { type: 'COMMAND_REJECTED', shipId, reason: 'NO_RETURN_RESERVE', detail: `po locie zostanie ${(ship.fuel - cost).toFixed(0)}, rezerwa na powrót ${reserve.toFixed(0)}` };
      }
    }
    return { type: 'TRANSFER_STARTED', shipId, plan: this.transfers.plan(ship, to, w.time) };
  }

  private orderRoverMove(roverId: RoverId, tileIndex: number): DomainEvent {
    const rover = this.world.rovers.find((r) => r.id === roverId);
    if (!rover) return { type: 'COMMAND_REJECTED', reason: 'NO_ROVER' };
    if (rover.state !== 'IDLE' || rover.job) return { type: 'COMMAND_REJECTED', reason: 'ROVER_MOVING' };
    const path = this.rovers.findPath(rover.bodyId, rover.tileIndex, tileIndex, this.world.structures);
    if (!path || path.length === 0) return { type: 'COMMAND_REJECTED', reason: 'NO_PATH' };
    this.rovers.start(rover, path);
    return { type: 'ROVER_MOVE_ORDERED', roverId, path };
  }

  /** The part of a cargo that fits into a body's storage. */
  private fitting(bodyId: BodyId, cargo: Stockpile): Stockpile {
    if (fits(this.world, this.rules, bodyId, cargo)) return cargo;
    const out: Record<string, number> = {};
    let probe = this.world;
    for (const [code, q] of Object.entries(cargo)) {
      let take = q;
      while (take > 0 && !fits(probe, this.rules, bodyId, { [code]: take })) take = Math.floor(take / 2);
      if (take > 0) {
        out[code] = take;
        probe = { ...probe, storage: { ...probe.storage, [bodyId]: { ...storageOf(probe, bodyId), [code]: (storageOf(probe, bodyId)[code] ?? 0) + take } } };
      }
    }
    return out;
  }

  /** Founding the colony when the port is finished; docking points follow new landing pads. */
  private afterConstruction(events: ReadonlyArray<DomainEvent>, all: DomainEvent[]): void {
    for (const e of events) {
      if (e.type !== 'STRUCTURE_BUILT') continue;
      const s = e.structure;
      if (s.kind === 'LAND') this.refreshDockingOffset(s.bodyId);
      if (s.kind === 'HQ' && this.world.colony.foundedAt === null && this.world.colony.siteBodyId === s.bodyId) {
        this.apply([{ type: 'COLONY_FOUNDED', bodyId: s.bodyId, structureId: s.id }], all);
      }
    }
  }

  private refreshDockingOffset(bodyId: BodyId): void {
    const tile = landingPadTileOf(this.grids, this.world.structures.filter(isWorking), bodyId);
    const grid = this.grids.get(bodyId);
    if (tile && grid) this.solver.setDockingOffset(bodyId, padDockingOffset(grid, tile, this.cfg.padLiftFactor));
  }

  private apply(events: ReadonlyArray<DomainEvent>, into: DomainEvent[]): void {
    if (events.length === 0) return;
    this.world = reduceAll(this.world, events);
    into.push(...events);
  }
}
