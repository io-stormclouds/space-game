import { BodyId } from '../shared/ids';
import { GAME_CONSTANTS } from './config/game-constants';
import { ASTEROID_ID, INITIAL_STOCKPILE, MOON_ID, PLANET_ID, SHIP_ID } from './config/initial-world';
import { WORLD_GRIDS, topTile } from './config/world';
import { powerBalance } from './economy/colony';
import { asteroidShape, depletionScale } from './math/asteroid-shape';
import { distance, length, vec3 } from './math/vec3';
import { DomainEvent } from './models/domain-event.model';
import { Tile, TileId } from './models/planet-grid.model';
import { Spacecraft } from './models/spacecraft.model';
import { StructureKind } from './models/structure.model';
import { cargoTotal, storageOf } from './reducer';
import { POC_SCENARIO } from './scenarios/poc';
import { Simulation } from './simulation';
import { GameClock, POC_TEMPO } from './systems/game-clock';

/**
 * Headless run of the PoC loop on the unified domain: Planet → Moon → Asteroid (mine Ferryt) →
 * Planet (land, unload, refuel) → build with a rover. No Angular, no Three.js.
 * Ported from poc/space-3d-poc full-loop.spec.ts; changes are listed in UNIFICATION.md, section 4.
 */
class Headless {
  readonly sim = new Simulation(POC_SCENARIO);
  readonly log: DomainEvent[] = [];

  get world() {
    return this.sim.world;
  }

  ship(): Spacecraft {
    return this.world.ships.find((s) => s.id === SHIP_ID)!;
  }

  order(to: BodyId): boolean {
    return this.send({ type: 'MOVE_SHIP', shipId: SHIP_ID, to });
  }

  build(body: BodyId, tileId: TileId, kind: StructureKind): boolean {
    return this.send({ type: 'BUILD', bodyId: body, tileId, kind });
  }

  driveRover(to: number): boolean {
    return this.send({ type: 'MOVE_ROVER', roverId: this.world.rovers[0]!.id, tileIndex: to });
  }

  step(dt = 1 / 60): void {
    this.log.push(...this.sim.step(dt));
  }

  runUntil(pred: () => boolean, maxMinutes = 600): number {
    const start = this.sim.time;
    while (!pred()) {
      this.step();
      if (this.sim.time - start > maxMinutes) throw new Error('timeout waiting for condition');
    }
    return this.sim.time - start;
  }

  private send(cmd: Parameters<Simulation['dispatch']>[0]): boolean {
    const events = this.sim.dispatch(cmd);
    this.log.push(...events);
    return !events.some((e) => e.type === 'COMMAND_REJECTED');
  }
}

describe('Full gameplay loop (headless)', () => {
  it('Planet → Moon → Asteroid (mining) → Planet: cargo delivered to the planet storage, fuel refilled, landed on the pad', () => {
    const g = new Headless();
    expect(g.ship()).toMatchObject({ state: 'DOCKED', currentBodyId: PLANET_ID, fuel: 100 });
    expect(cargoTotal(g.ship().cargo)).toBe(0);
    expect(storageOf(g.world, PLANET_ID)).toEqual(INITIAL_STOCKPILE);

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

    // 3. Mining fills the hold at 10 per minute → 5 min, then stops
    const miningTime = g.runUntil(() => g.ship().state === 'DOCKED');
    expect(g.ship().cargo).toEqual({ FER: 50 });
    expect(miningTime).toBeGreaterThanOrEqual(5);
    expect(miningTime).toBeLessThan(5.2);
    const asteroid = g.world.bodies.find((b) => b.id === ASTEROID_ID)!;
    expect(asteroid.resources?.['FER']).toBe(450);
    expect(g.ship().fuel).toBe(fuelAtAsteroid); // mining costs no fuel
    expect(depletionScale(asteroid.resources!['FER']!, 500)).toBeCloseTo(Math.cbrt(0.9), 6);
    expect(asteroidShape(asteroid).vertices).toHaveLength(162);

    // 4. Asteroid → Planet: lands on the pad, unloads into the planet storage, refuels
    expect(g.order(PLANET_ID)).toBe(true);
    g.runUntil(() => g.ship().state !== 'IN_TRANSIT');
    expect(g.ship()).toMatchObject({ state: 'DOCKED', currentBodyId: PLANET_ID, fuel: 100 });
    expect(cargoTotal(g.ship().cargo)).toBe(0);
    expect(storageOf(g.world, PLANET_ID)['FER']).toBe(INITIAL_STOCKPILE['FER']! + 50);
    // the docking point is the landing pad tile, just above the surface, not 1.25 R above the centre
    const planet = g.sim.solver.body(PLANET_ID);
    const pad = topTile(WORLD_GRIDS.get(PLANET_ID)!);
    const offset = g.sim.solver.dockingOffset(PLANET_ID, vec3());
    expect(length(offset)).toBeCloseTo(planet.radius * (1 + GAME_CONSTANTS.padLiftFactor), 6);
    expect(distance(offset, pad.center)).toBeLessThan(planet.radius * 0.1);

    const types = g.log.map((e) => e.type);
    expect(types.filter((t) => t === 'TRANSFER_STARTED')).toHaveLength(3);
    expect(types.filter((t) => t === 'TRANSFER_ARRIVED')).toHaveLength(3);
    expect(types).toContain('CARGO_UNLOADED');
    expect(types).toContain('REFUELED');
  });

  it('economy: the rover builds a mine that feeds the storage; crew and power gate the next ones', () => {
    const g = new Headless();
    g.sim.world = { ...g.world, storage: { [PLANET_ID]: { FER: 300, KRI: 50, SIL: 100 } } };
    const grid = WORLD_GRIDS.get(PLANET_ID)!;
    const used = () => new Set(g.world.structures.flatMap((s) => s.tiles));
    const ferrite = grid.tiles.filter((t) => t.deposit?.resource === 'FER' && !used().has(t.id));
    const free = (): Tile => grid.tiles.find((t) => !t.deposit && !used().has(t.id))!;

    // power 10 − 2 = 8 MW, crew 5 − 2 = 3: one mine fits, the second needs a habitat
    expect(powerBalance(g.world, g.sim.rules, PLANET_ID)).toMatchObject({ produced: 10, consumed: 2, available: 8 });
    expect(g.build(PLANET_ID, ferrite[0]!.id, 'MIN')).toBe(true);
    expect(g.build(PLANET_ID, ferrite[1]!.id, 'MIN')).toBe(false);
    expect(g.log.at(-1)).toMatchObject({ type: 'COMMAND_REJECTED', reason: 'NO_CREW' });
    expect(g.build(PLANET_ID, free().id, 'HAB')).toBe(true);
    expect(g.build(PLANET_ID, ferrite[1]!.id, 'MIN')).toBe(true); // 8 − 3 − 2 − 3 = 0 MW left
    expect(g.build(PLANET_ID, ferrite[2]!.id, 'MIN')).toBe(false);
    expect(g.log.at(-1)).toMatchObject({ type: 'COMMAND_REJECTED', reason: 'NO_POWER' });
    expect(g.build(PLANET_ID, free().id, 'WND')).toBe(true); // planned producers count
    expect(g.build(PLANET_ID, ferrite[2]!.id, 'MIN')).toBe(true);

    // one rover builds the five sites one after another (MIN 2 min, HAB 3 min, WND 2 min)
    const mine = `MIN@${ferrite[0]!.id}`;
    g.runUntil(() => g.world.structures.find((s) => s.id === mine)!.state === 'ACTIVE', 60);
    const before = storageOf(g.world, PLANET_ID)['FER']!;
    g.runUntil(() => storageOf(g.world, PLANET_ID)['FER']! >= before + 10, 60);
    expect(g.world.deposits[ferrite[0]!.id]).toBeLessThanOrEqual(ferrite[0]!.deposit!.amount - 10);
    g.runUntil(() => g.world.structures.every((s) => s.state === 'ACTIVE'), 120);
    expect(powerBalance(g.world, g.sim.rules, PLANET_ID).available).toBe(20 - 13);
    expect(g.log.filter((e) => e.type === 'STRUCTURE_BUILT')).toHaveLength(5);
  });

  it('rover: drives from the landing pad to a neighbouring tile and arrives', () => {
    const g = new Headless();
    const rover = g.world.rovers[0]!;
    const grid = WORLD_GRIDS.get(PLANET_ID)!;
    expect(rover.tileIndex).toBe(topTile(grid).index);
    const used = new Set(g.world.structures.flatMap((s) => s.tiles));
    const target = grid.tiles[rover.tileIndex]!.neighbors.find((n) => !used.has(grid.tiles[n]!.id))!;
    expect(g.driveRover(target)).toBe(true);
    expect(g.world.rovers[0]!.state).toBe('MOVING');
    const t = g.runUntil(() => g.world.rovers[0]!.state === 'IDLE', 60);
    expect(g.world.rovers[0]!.tileIndex).toBe(target);
    expect(t).toBeGreaterThan(0.2);
    expect(t).toBeLessThan(2);
  });

  it('rejects an order the ship cannot afford and leaves state untouched', () => {
    const g = new Headless();
    g.sim.world = { ...g.world, ships: g.world.ships.map((s) => ({ ...s, fuel: 1 })) };
    const before = g.ship();
    expect(g.order(ASTEROID_ID)).toBe(false);
    expect(g.ship()).toEqual(before);
    expect(g.sim.transfers.isActive(SHIP_ID)).toBe(false);
  });

  it('time clamp prevents a huge frame from skipping the arrival', () => {
    const g = new Headless();
    const clock = new GameClock(GAME_CONSTANTS.timeClamp);
    g.order(MOON_ID);
    const dt = clock.advance(5, POC_TEMPO); // tab was in background for 5 s: clamped to 0.1 s of real time
    g.step(dt);
    expect(clock.time).toBeCloseTo(0.1);
    expect(g.ship().state).toBe('IN_TRANSIT');
  });
});
