import { GAME_CONSTANTS } from '../config/game-constants';
import { INITIAL_BODIES, PLANET_ID } from '../config/initial-world';
import { POC_RULES, WORLD_GRIDS, createInitialWorld, topTile } from '../config/world';
import { powerBalance } from '../economy/colony';
import { createSnapshot } from '../frame-snapshot';
import { generateDeposits } from '../math/deposit-generator';
import { buildGoldbergGrid } from '../math/goldberg-grid';
import { distance, length } from '../math/vec3';
import { Tile } from '../models/planet-grid.model';
import { WorldState, reduceAll, storageOf } from '../reducer';
import { standingStructure } from '../scenario';
import { ExtractionSystem } from './extraction-system';
import { RoverSystem, tileIndexOf } from './rover-system';

describe('deposits', () => {
  const grid = buildGoldbergGrid(PLANET_ID, 50, 8);
  const neighbors = grid.tiles.map((t) => t.neighbors);

  it('cover 8–18% of tiles in clusters and are deterministic', () => {
    const a = generateDeposits(neighbors, 11);
    const b = generateDeposits(neighbors, 11);
    expect([...a.entries()]).toEqual([...b.entries()]);
    const share = a.size / grid.tiles.length;
    expect(share).toBeGreaterThan(0.08);
    expect(share).toBeLessThan(0.18);
    // clusters: most deposit tiles have a deposit neighbour of the same resource
    let clustered = 0;
    for (const [i, d] of a) if (neighbors[i]!.some((n) => a.get(n)?.resource === d.resource)) clustered++;
    expect(clustered / a.size).toBeGreaterThan(0.7);
    // the three PoC resources, now under catalog codes
    expect(new Set([...a.values()].map((d) => d.resource))).toEqual(new Set(['FER', 'KRI', 'SIL']));
    expect(generateDeposits(neighbors, 12).size).not.toBe(0);
  });

  it('follow material weights (Tau Ceti e: five materials from the scan profile)', () => {
    const weights = { FER: 60, SIL: 55, KRI: 75, KAR: 45, KUP: 15 };
    const a = generateDeposits(neighbors, 104, undefined, weights);
    const kinds = new Set([...a.values()].map((d) => d.resource));
    for (const k of kinds) expect(Object.keys(weights)).toContain(k);
    expect(kinds.size).toBeGreaterThanOrEqual(4);
  });

  it('world grids carry deposits and the initial world tracks their amounts', () => {
    const w = createInitialWorld();
    const planet = WORLD_GRIDS.get(PLANET_ID)!;
    const withDeposit = planet.tiles.filter((t) => t.deposit);
    expect(withDeposit.length).toBeGreaterThan(40);
    for (const t of withDeposit) expect(w.deposits[t.id]).toBe(t.deposit!.amount);
  });
});

describe('ExtractionSystem', () => {
  const grid = WORLD_GRIDS.get(PLANET_ID)!;
  const free = (resource: string): Tile[] => {
    const used = new Set(createInitialWorld().structures.flatMap((s) => s.tiles));
    return grid.tiles.filter((t) => t.deposit?.resource === resource && !used.has(t.id));
  };
  const withExtractors = (kind: string, tiles: Tile[]): WorldState => {
    const w = createInitialWorld();
    return { ...w, structures: [...w.structures, ...tiles.map((t) => standingStructure(kind, PLANET_ID, [t.index]))] };
  };

  it('pulls the extractor rate per model minute into the planet storage and depletes the deposit', () => {
    const tile = free('KRI')[0]!;
    let w = withExtractors('ICE', [tile]);
    const sys = new ExtractionSystem(POC_RULES, WORLD_GRIDS);
    const before = storageOf(w, PLANET_ID)['KRI'] ?? 0;
    for (let i = 0; i < 59; i++) expect(sys.update(w, 1 / 60)).toEqual([]);
    const events = sys.update(w, 2 / 60);
    expect(events).toEqual([{ type: 'EXTRACTION_TICK', bodyId: PLANET_ID, tileId: tile.id, resource: 'KRI', amount: 2 }]);
    w = reduceAll(w, events);
    expect(storageOf(w, PLANET_ID)['KRI']).toBe(before + 2);
    expect(w.deposits[tile.id]).toBe(tile.deposit!.amount - 2);

    // nearly empty deposit: last tick takes what is left and reports depletion
    w = { ...w, deposits: { ...w.deposits, [tile.id]: 1 } };
    const last = sys.update(w, 1);
    expect(last).toEqual([
      { type: 'EXTRACTION_TICK', bodyId: PLANET_ID, tileId: tile.id, resource: 'KRI', amount: 1 },
      { type: 'DEPOSIT_DEPLETED', bodyId: PLANET_ID, tileId: tile.id },
    ]);
    w = reduceAll(w, last);
    expect(sys.update(w, 1)).toEqual([]);
  });

  it('counts every minute of a long step (W09: the PoC lost ticks above one unit per frame)', () => {
    const tile = free('FER')[0]!;
    const sys = new ExtractionSystem(POC_RULES, WORLD_GRIDS);
    const events = sys.update(withExtractors('MIN', [tile]), 3);
    expect(events.map((e) => e.type)).toEqual(['EXTRACTION_TICK', 'EXTRACTION_TICK', 'EXTRACTION_TICK']);
  });

  it('works slower under a power deficit (Z4): output × produced / demand', () => {
    const tiles = free('FER').slice(0, 4);
    const w = withExtractors('MIN', tiles); // 4 × 3 MW + pad 2 = 14 MW demand, 10 MW produced
    const balance = powerBalance(w, POC_RULES, PLANET_ID);
    expect(balance.efficiency[2]).toBeCloseTo(10 / 14, 6);
    const ticks = new ExtractionSystem(POC_RULES, WORLD_GRIDS).update(w, 1);
    expect(ticks.filter((e) => e.type === 'EXTRACTION_TICK').map((e) => (e as { amount: number }).amount)).toEqual(
      Array(4).fill(Math.round(2 * (10 / 14) * 1000) / 1000),
    );
  });

  it('stops when the storage class of the body is full (Z3: the port stores 2000 j. of bulk)', () => {
    const tile = free('KRI')[0]!;
    const w = withExtractors('ICE', [tile]);
    const full = { ...w, storage: { [PLANET_ID]: { FER: 1000, SIL: 999, KRI: 0 } } };
    const events = new ExtractionSystem(POC_RULES, WORLD_GRIDS).update(full, 1);
    expect(events).toEqual([{ type: 'EXTRACTION_TICK', bodyId: PLANET_ID, tileId: tile.id, resource: 'KRI', amount: 1 }]);
  });
});

describe('RoverSystem', () => {
  const grid = WORLD_GRIDS.get(PLANET_ID)!;
  const planet = INITIAL_BODIES.find((b) => b.id === PLANET_ID)!;

  it('finds a shortest path over neighbours and avoids structures except landing pads', () => {
    const w = createInitialWorld();
    const sys = new RoverSystem(WORLD_GRIDS, GAME_CONSTANTS);
    const start = topTile(grid).index;
    const occupied = new Set(w.structures.flatMap((s) => s.tiles.map(tileIndexOf)));
    const target = grid.tiles[start]!.neighbors.find((n) => !occupied.has(n))!;
    const path = sys.findPath(PLANET_ID, start, target, w.structures);
    expect(path).toEqual([target]);
    // two steps away through a tile with the solar panel must route around it
    const solar = w.structures.find((s) => s.kind === 'SOL')!;
    const solarIdx = tileIndexOf(solar.tileId);
    const beyond = grid.tiles[solarIdx]!.neighbors.find((n) => n !== start && !grid.tiles[start]!.neighbors.includes(n))!;
    const around = sys.findPath(PLANET_ID, start, beyond, w.structures)!;
    expect(around).not.toContain(solarIdx);
    expect(around[around.length - 1]).toBe(beyond);
    expect(around.length).toBeLessThanOrEqual(3);
    // destination occupied by a building is unreachable, unless it is the site being built
    expect(sys.findPath(PLANET_ID, start, solarIdx, w.structures)).toBeNull();
    expect(sys.findPath(PLANET_ID, start, solarIdx, w.structures, new Set([solarIdx]))).toEqual([solarIdx]);
    // every tile is reachable on an empty planet
    const far = grid.tiles.reduce((best, t) => (t.normal.y < best.normal.y ? t : best), grid.tiles[0]!);
    const long = sys.findPath(PLANET_ID, start, far.index, [])!;
    expect(long.length).toBeGreaterThan(10);
    expect(long.length).toBeLessThan(30);
  });

  it('drives along the path at roverSpeed over the surface and arrives', () => {
    const w = createInitialWorld();
    const sys = new RoverSystem(WORLD_GRIDS, GAME_CONSTANTS);
    const rover = w.rovers[0]!;
    const path = sys.findPath(PLANET_ID, rover.tileIndex, grid.tiles[rover.tileIndex]!.neighbors[2]!, w.structures)!;
    sys.start(rover, path);
    const moving = { ...rover, state: 'MOVING' as const, path };
    const snap = createSnapshot(INITIAL_BODIES.map((b) => b.id));
    let t = 0;
    let arrived = false;
    for (let i = 0; i < 600 && !arrived; i++) {
      const events = sys.update([moving], 1 / 60, snap);
      t += 1 / 60;
      const pos = snap.roverLocalPos.get(rover.id)!;
      expect(length(pos)).toBeGreaterThan(planet.radius);
      expect(length(pos)).toBeLessThan(planet.radius * 1.02);
      arrived = events.some((e) => e.type === 'ROVER_ARRIVED');
    }
    expect(arrived).toBe(true);
    const a = grid.tiles[rover.tileIndex]!.center;
    const b = grid.tiles[path[0]!]!.center;
    const expected = distance(a, b) / GAME_CONSTANTS.roverSpeed;
    expect(Math.abs(t - expected) / expected).toBeLessThan(0.2);
    expect(distance(snap.roverLocalPos.get(rover.id)!, b)).toBeLessThan(planet.radius * 0.01 + 0.5);
  });
});
