import { BodyId } from '../shared/ids';
import { GAME_CONSTANTS } from './config/game-constants';
import { ASTEROID_ID, INITIAL_BODIES, INITIAL_STOCKPILE, MOON_ID, PLANET_ID, SHIP_ID } from './config/initial-world';
import { WORLD_GRIDS, createInitialWorld, landingPadTile, padDockingOffset, topTile } from './config/world';
import { powerBalance } from './economy/power';
import { createSnapshot } from './frame-snapshot';
import { asteroidShape, depletionScale } from './math/asteroid-shape';
import { OrbitSolver } from './math/orbit-solver';
import { distance, length, vec3 } from './math/vec3';
import { DomainEvent } from './models/domain-event.model';
import { TileId } from './models/planet-grid.model';
import { Spacecraft } from './models/spacecraft.model';
import { StructureKind } from './models/structure.model';
import { WorldState, cargoTotal, reduceAll } from './reducer';
import { BuildSystem } from './systems/build-system';
import { DockingSystem } from './systems/docking-system';
import { ExtractionSystem } from './systems/extraction-system';
import { GameClock } from './systems/game-clock';
import { MiningSystem } from './systems/mining-system';
import { RoverSystem } from './systems/rover-system';
import { TransferSystem } from './systems/transfer-system';

/**
 * Headless simulation of the whole PoC economy:
 * Planet (landing pad) → Moon → Asteroid (mine Ferryt) → Planet (land, unload, refuel) → build.
 * No Angular, no Three.js.
 */
class Headless {
  readonly solver = new OrbitSolver(INITIAL_BODIES);
  readonly clock = new GameClock(GAME_CONSTANTS.timeClamp);
  readonly transfers = new TransferSystem(this.solver, GAME_CONSTANTS);
  readonly mining = new MiningSystem(GAME_CONSTANTS);
  readonly docking = new DockingSystem();
  readonly builder = new BuildSystem(WORLD_GRIDS);
  readonly extraction = new ExtractionSystem();
  readonly rovers = new RoverSystem(WORLD_GRIDS, GAME_CONSTANTS);
  readonly snap = createSnapshot(INITIAL_BODIES.map((b) => b.id));
  world: WorldState = createInitialWorld();
  readonly log: DomainEvent[] = [];

  constructor() {
    const pad = landingPadTile(this.world.structures, PLANET_ID);
    if (pad) this.solver.setDockingOffset(PLANET_ID, padDockingOffset(WORLD_GRIDS.get(PLANET_ID)!, pad));
  }

  ship(): Spacecraft {
    return this.world.ships.find((s) => s.id === SHIP_ID)!;
  }

  order(to: BodyId): boolean {
    const ship = this.ship();
    if (ship.state === 'IN_TRANSIT' || !ship.currentBodyId || ship.currentBodyId === to) return false;
    const cost = this.transfers.fuelCost(ship.currentBodyId, to, this.clock.time);
    if (ship.fuel < cost) return false;
    const plan = this.transfers.plan(ship, to, this.clock.time);
    this.apply([{ type: 'TRANSFER_STARTED', shipId: ship.id, plan }]);
    return true;
  }

  build(body: BodyId, tileId: TileId, kind: StructureKind): boolean {
    const e = this.builder.build(this.world, body, tileId, kind, this.clock.time);
    this.apply([e]);
    return e.type === 'STRUCTURE_BUILT';
  }

  driveRover(to: number): boolean {
    const rover = this.world.rovers[0];
    const path = this.rovers.findPath(rover.bodyId, rover.tileIndex, to, this.world.structures);
    if (!path) return false;
    this.rovers.start(rover, path);
    this.apply([{ type: 'ROVER_MOVE_ORDERED', roverId: rover.id, path }]);
    return true;
  }

  step(dt = 1 / 60): void {
    const gameDt = this.clock.advance(dt, 1);
    const t = this.clock.time;
    const events: DomainEvent[] = [];
    events.push(...this.transfers.update(this.world.ships, t, gameDt, this.snap));
    events.push(...this.mining.update(this.world.ships, this.world.bodies, gameDt));
    events.push(...this.extraction.update(this.world, gameDt));
    events.push(...this.rovers.update(this.world.rovers, gameDt, this.snap));
    // apply arrivals first so docking sees the updated ship, then docking effects
    this.apply(events);
    for (const e of events) {
      if (e.type === 'TRANSFER_ARRIVED') {
        const ship = this.ship();
        const body = this.world.bodies.find((b) => b.id === e.bodyId)!;
        this.apply(this.docking.onArrival(ship, body));
      }
    }
  }

  runUntil(pred: () => boolean, maxSeconds = 600): number {
    const start = this.clock.time;
    while (!pred()) {
      this.step();
      if (this.clock.time - start > maxSeconds) throw new Error('timeout waiting for condition');
    }
    return this.clock.time - start;
  }

  private apply(events: DomainEvent[]): void {
    this.log.push(...events);
    this.world = reduceAll(this.world, events);
  }
}

describe('Full gameplay loop (headless)', () => {
  it('Planet → Moon → Asteroid (mining) → Planet: cargo delivered to the stockpile, fuel refilled, landed on the pad', () => {
    const g = new Headless();
    expect(g.ship()).toMatchObject({ state: 'DOCKED', currentBodyId: PLANET_ID, fuel: 100 });
    expect(cargoTotal(g.ship().cargo)).toBe(0);
    expect(g.world.stockpile).toEqual(INITIAL_STOCKPILE);

    // 1. Planet → Moon
    expect(g.order(MOON_ID)).toBe(true);
    expect(g.ship().state).toBe('IN_TRANSIT');
    const fuelAfterLaunch = g.ship().fuel;
    expect(fuelAfterLaunch).toBeLessThan(100);
    g.runUntil(() => g.ship().state !== 'IN_TRANSIT');
    expect(g.ship()).toMatchObject({ state: 'DOCKED', currentBodyId: MOON_ID });
    expect(g.ship().fuel).toBe(fuelAfterLaunch);

    // 2. Moon → Asteroid, auto-switch to MINING
    expect(g.order(ASTEROID_ID)).toBe(true);
    g.runUntil(() => g.ship().state !== 'IN_TRANSIT');
    expect(g.ship()).toMatchObject({ state: 'MINING', currentBodyId: ASTEROID_ID });
    const fuelAtAsteroid = g.ship().fuel;

    // 3. Mining fills the hold at 10/s → 5 s, then stops
    const miningTime = g.runUntil(() => g.ship().state === 'DOCKED');
    expect(g.ship().cargo).toEqual({ FERRITE: 50, CRYOL: 0, SILICITE: 0 });
    expect(miningTime).toBeGreaterThanOrEqual(5);
    expect(miningTime).toBeLessThan(5.2);
    const asteroid = g.world.bodies.find((b) => b.id === ASTEROID_ID)!;
    expect(asteroid.resources?.FERRITE).toBe(450);
    expect(g.ship().fuel).toBe(fuelAtAsteroid); // mining costs no fuel
    expect(depletionScale(asteroid.resources!.FERRITE!, 500)).toBeCloseTo(Math.cbrt(0.9), 6);
    expect(asteroidShape(asteroid).vertices).toHaveLength(162);

    // 4. Asteroid → Planet: lands on the pad, unloads, refuels
    expect(g.order(PLANET_ID)).toBe(true);
    g.runUntil(() => g.ship().state !== 'IN_TRANSIT');
    expect(g.ship()).toMatchObject({ state: 'DOCKED', currentBodyId: PLANET_ID, fuel: 100 });
    expect(cargoTotal(g.ship().cargo)).toBe(0);
    expect(g.world.stockpile.FERRITE).toBe(INITIAL_STOCKPILE.FERRITE + 50);
    // the docking point is the landing pad tile, just above the surface, not 1.25 R above the centre
    const planet = g.solver.body(PLANET_ID);
    const pad = topTile(WORLD_GRIDS.get(PLANET_ID)!);
    const offset = g.solver.dockingOffset(PLANET_ID, vec3());
    expect(length(offset)).toBeCloseTo(planet.radius * (1 + GAME_CONSTANTS.padLiftFactor), 6);
    expect(distance(offset, pad.center)).toBeLessThan(planet.radius * 0.1);

    const types = g.log.map((e) => e.type);
    expect(types.filter((t) => t === 'TRANSFER_STARTED')).toHaveLength(3);
    expect(types.filter((t) => t === 'TRANSFER_ARRIVED')).toHaveLength(3);
    expect(types).toContain('CARGO_UNLOADED');
    expect(types).toContain('REFUELED');
  });

  it('economy: extractor on a deposit feeds the stockpile, power blocks the second extractor until a wind turbine', () => {
    const g = new Headless();
    const grid = WORLD_GRIDS.get(PLANET_ID)!;
    const ferrite = grid.tiles.filter((t) => t.deposit?.resource === 'FERRITE');
    const free = grid.tiles.find((t) => !t.deposit && !g.world.structures.some((s) => s.tileId === t.id))!;

    // initial power: pad −2, solar +5 → 3 left: one mine fits
    expect(powerBalance(g.world.structures, PLANET_ID)).toEqual({ produced: 5, consumed: 2, available: 3 });
    expect(g.build(PLANET_ID, ferrite[0].id, 'MINE')).toBe(true);
    expect(g.build(PLANET_ID, ferrite[1].id, 'MINE')).toBe(false); // NO_POWER
    expect(g.log.at(-1)).toMatchObject({ type: 'COMMAND_REJECTED', reason: 'NO_POWER' });
    const before = g.world.stockpile.FERRITE;

    // the mine extracts 2 Ferryt per second
    g.runUntil(() => g.world.stockpile.FERRITE >= before + 10);
    expect(g.world.deposits[ferrite[0].id]).toBe(ferrite[0].deposit!.amount - 10);

    // a wind turbine unlocks the second mine
    expect(g.build(PLANET_ID, free.id, 'WIND')).toBe(true);
    expect(g.build(PLANET_ID, ferrite[1].id, 'MINE')).toBe(true);
    expect(powerBalance(g.world.structures, PLANET_ID).available).toBe(15 - 8);
  });

  it('rover: drives from the landing pad to a neighbouring tile and arrives', () => {
    const g = new Headless();
    const rover = g.world.rovers[0];
    const grid = WORLD_GRIDS.get(PLANET_ID)!;
    expect(rover.tileIndex).toBe(topTile(grid).index);
    const target = grid.tiles[rover.tileIndex].neighbors.find((n) => !g.world.structures.some((s) => s.tileId === grid.tiles[n].id))!;
    expect(g.driveRover(target)).toBe(true);
    expect(g.world.rovers[0].state).toBe('MOVING');
    const t = g.runUntil(() => g.world.rovers[0].state === 'IDLE', 60);
    expect(g.world.rovers[0].tileIndex).toBe(target);
    expect(t).toBeGreaterThan(0.2);
    expect(t).toBeLessThan(2);
  });

  it('rejects an order the ship cannot afford and leaves state untouched', () => {
    const g = new Headless();
    g.world = { ...g.world, ships: g.world.ships.map((s) => ({ ...s, fuel: 1 })) };
    const before = g.ship();
    expect(g.order(ASTEROID_ID)).toBe(false);
    expect(g.ship()).toEqual(before);
    expect(g.transfers.isActive(SHIP_ID)).toBe(false);
  });

  it('time clamp prevents a huge frame from skipping the arrival', () => {
    const g = new Headless();
    g.order(MOON_ID);
    g.step(5); // tab was in background for 5 s: clamped to 0.1 s of game time
    expect(g.clock.time).toBeCloseTo(0.1);
    expect(g.ship().state).toBe('IN_TRANSIT');
  });
});
