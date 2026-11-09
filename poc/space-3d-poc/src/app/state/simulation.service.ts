import { Injectable, inject } from '@angular/core';
import { GAME_CONSTANTS } from '../game/config/game-constants';
import { INITIAL_BODIES } from '../game/config/initial-world';
import { COLONY_LAYOUTS, WORLD_GRIDS, WORLD_TERRAIN, landingPadTile, padDockingOffset } from '../game/config/world';
import { FrameSnapshot, createSnapshot } from '../game/frame-snapshot';
import { AsteroidShape, asteroidShape } from '../game/math/asteroid-shape';
import { OrbitSolver } from '../game/math/orbit-solver';
import { Vec3, vec3 } from '../game/math/vec3';
import { DomainEvent } from '../game/models/domain-event.model';
import { PlanetGrid } from '../game/models/planet-grid.model';
import { BuildSystem } from '../game/systems/build-system';
import { DockingSystem } from '../game/systems/docking-system';
import { ExtractionSystem } from '../game/systems/extraction-system';
import { GameClock } from '../game/systems/game-clock';
import { MiningSystem } from '../game/systems/mining-system';
import { RoverSystem } from '../game/systems/rover-system';
import { TransferSystem } from '../game/systems/transfer-system';
import { BodyId } from '../shared/ids';
import { GameStateService } from './game-state.service';

/**
 * Owns the pure game systems and the per-frame snapshot. Steps the simulation,
 * applies the resulting events to GameStateService and returns them for the engine.
 */
@Injectable({ providedIn: 'root' })
export class SimulationService {
  private readonly state = inject(GameStateService);

  readonly cfg = GAME_CONSTANTS;
  readonly solver = new OrbitSolver(INITIAL_BODIES);
  readonly clock = new GameClock(this.cfg.timeClamp);
  readonly transfers = new TransferSystem(this.solver, this.cfg);
  readonly mining = new MiningSystem(this.cfg);
  readonly docking = new DockingSystem();
  /** Surface grids of bodies that can be built on, generated once. */
  readonly grids: ReadonlyMap<BodyId, PlanetGrid> = WORLD_GRIDS;
  /** Showcase-colony layouts (visual dressing + their real pad and solar panel). */
  readonly colonies = COLONY_LAYOUTS;
  /** Hex-kit terrain plans (tiles, settlement, decor) of bodies that have them. */
  readonly terrain = WORLD_TERRAIN;
  /** Irregular meshes of bodies with a seeded shape (asteroids), generated once. */
  readonly shapes: ReadonlyMap<BodyId, AsteroidShape> = new Map(
    INITIAL_BODIES.filter((b) => b.shape).map((b) => [b.id, asteroidShape(b)]),
  );
  readonly builder = new BuildSystem(this.grids);
  readonly extraction = new ExtractionSystem();
  readonly rovers = new RoverSystem(this.grids, this.cfg);
  readonly snapshot: FrameSnapshot = createSnapshot(INITIAL_BODIES.map((b) => b.id));

  constructor() {
    for (const b of INITIAL_BODIES) this.refreshDockingOffset(b.id);
  }

  /** Docking point of a body in its local frame (landing pad if it has one). */
  dockingOffset(bodyId: BodyId, out: Vec3 = vec3()): Vec3 {
    return this.solver.dockingOffset(bodyId, out);
  }

  /** Re-reads the body's landing pad (if any) into the orbit solver. Returns true when a pad is used. */
  refreshDockingOffset(bodyId: BodyId): boolean {
    const tile = landingPadTile(this.state.structures(), bodyId);
    const grid = this.grids.get(bodyId);
    if (!tile || !grid) return false;
    this.solver.setDockingOffset(bodyId, padDockingOffset(grid, tile));
    return true;
  }

  /** Advances the world by one real-time delta. Returns the discrete events that occurred. */
  step(realDeltaSec: number): DomainEvent[] {
    const dt = this.clock.advance(realDeltaSec, this.state.timeScale());
    const t = this.clock.time;
    const snap = this.snapshot;
    snap.time = t;

    for (const [id, out] of snap.bodyLocalPos) this.solver.localPosition(id, t, out);

    const world = this.state.world();
    const events: DomainEvent[] = [];
    events.push(...this.transfers.update(world.ships, t, dt, snap));
    events.push(...this.mining.update(world.ships, world.bodies, dt));
    events.push(...this.extraction.update(world, dt));
    events.push(...this.rovers.update(world.rovers, dt, snap));
    this.state.apply(events);

    const arrivals = events.filter((e) => e.type === 'TRANSFER_ARRIVED');
    if (arrivals.length) {
      const docked: DomainEvent[] = [];
      for (const e of arrivals) {
        const ship = this.state.ship(e.shipId);
        const body = this.state.body(e.bodyId);
        if (ship && body) docked.push(...this.docking.onArrival(ship, body));
      }
      this.state.apply(docked);
      events.push(...docked);
    }

    const focus = this.state.selectedShipId() ?? world.ships.find((s) => s.state === 'IN_TRANSIT')?.id ?? null;
    this.transfers.writeTrajectory(focus, snap);
    return events;
  }
}
