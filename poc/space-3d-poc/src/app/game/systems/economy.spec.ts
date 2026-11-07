import { GAME_CONSTANTS } from '../config/game-constants';
import { INITIAL_BODIES, PLANET_ID } from '../config/initial-world';
import { WORLD_GRIDS, createInitialWorld, topTile } from '../config/world';
import { createSnapshot } from '../frame-snapshot';
import { generateDeposits } from '../math/deposit-generator';
import { buildGoldbergGrid } from '../math/goldberg-grid';
import { distance, length } from '../math/vec3';
import { WorldState, reduceAll } from '../reducer';
import { BuildSystem } from './build-system';
import { ExtractionSystem } from './extraction-system';
import { RoverSystem } from './rover-system';

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
    for (const [i, d] of a) if (neighbors[i].some((n) => a.get(n)?.resource === d.resource)) clustered++;
    expect(clustered / a.size).toBeGreaterThan(0.7);
    // all three resources present
    expect(new Set([...a.values()].map((d) => d.resource)).size).toBe(3);
    expect(generateDeposits(neighbors, 12).size).not.toBe(0);
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
  it('pulls the extractor rate per second into the stockpile and depletes the deposit', () => {
    const builder = new BuildSystem(WORLD_GRIDS);
    const grid = WORLD_GRIDS.get(PLANET_ID)!;
    const tile = grid.tiles.find((t) => t.deposit?.resource === 'CRYOL')!;
    let w: WorldState = reduceAll(createInitialWorld(), [builder.build(createInitialWorld(), PLANET_ID, tile.id, 'ICE_EXTRACTOR', 0)]);
    const sys = new ExtractionSystem();
    const before = w.stockpile.CRYOL;
    for (let i = 0; i < 59; i++) expect(sys.update(w, 1 / 60)).toEqual([]);
    const events = sys.update(w, 2 / 60);
    expect(events).toEqual([{ type: 'EXTRACTION_TICK', bodyId: PLANET_ID, tileId: tile.id, resource: 'CRYOL', amount: 2 }]);
    w = reduceAll(w, events);
    expect(w.stockpile.CRYOL).toBe(before + 2);
    expect(w.deposits[tile.id]).toBe(tile.deposit!.amount - 2);

    // nearly empty deposit: last tick takes what is left and reports depletion
    w = { ...w, deposits: { ...w.deposits, [tile.id]: 1 } };
    const last = sys.update(w, 1);
    expect(last).toEqual([
      { type: 'EXTRACTION_TICK', bodyId: PLANET_ID, tileId: tile.id, resource: 'CRYOL', amount: 1 },
      { type: 'DEPOSIT_DEPLETED', bodyId: PLANET_ID, tileId: tile.id },
    ]);
    w = reduceAll(w, last);
    expect(sys.update(w, 1)).toEqual([]);
  });
});

describe('RoverSystem', () => {
  const grid = WORLD_GRIDS.get(PLANET_ID)!;
  const planet = INITIAL_BODIES.find((b) => b.id === PLANET_ID)!;

  it('finds a shortest path over neighbours and avoids structures except landing pads', () => {
    const w = createInitialWorld();
    const sys = new RoverSystem(WORLD_GRIDS, GAME_CONSTANTS);
    const start = topTile(grid).index;
    const occupied = new Set(w.structures.map((s) => Number(s.tileId.split(':')[1])));
    const target = grid.tiles[start].neighbors.find((n) => !occupied.has(n))!;
    const path = sys.findPath(PLANET_ID, start, target, w.structures);
    expect(path).toEqual([target]);
    // two steps away through a tile with the solar panel must route around it
    const solar = w.structures.find((s) => s.kind === 'SOLAR')!;
    const solarIdx = Number(solar.tileId.split(':')[1]);
    const beyond = grid.tiles[solarIdx].neighbors.find((n) => n !== start && !grid.tiles[start].neighbors.includes(n))!;
    const around = sys.findPath(PLANET_ID, start, beyond, w.structures)!;
    expect(around).not.toContain(solarIdx);
    expect(around[around.length - 1]).toBe(beyond);
    expect(around.length).toBeLessThanOrEqual(3);
    // destination occupied by a building is unreachable
    expect(sys.findPath(PLANET_ID, start, solarIdx, w.structures)).toBeNull();
    // every tile is reachable on an empty planet
    const far = grid.tiles.reduce((best, t) => (t.normal.y < best.normal.y ? t : best), grid.tiles[0]);
    const long = sys.findPath(PLANET_ID, start, far.index, [])!;
    expect(long.length).toBeGreaterThan(10);
    expect(long.length).toBeLessThan(30);
  });

  it('drives along the path at roverSpeed over the surface and arrives', () => {
    const w = createInitialWorld();
    const sys = new RoverSystem(WORLD_GRIDS, GAME_CONSTANTS);
    const rover = w.rovers[0];
    const path = sys.findPath(PLANET_ID, rover.tileIndex, grid.tiles[rover.tileIndex].neighbors[2], w.structures)!;
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
    const a = grid.tiles[rover.tileIndex].center;
    const b = grid.tiles[path[0]].center;
    const expected = distance(a, b) / GAME_CONSTANTS.roverSpeed;
    expect(Math.abs(t - expected) / expected).toBeLessThan(0.2);
    expect(distance(snap.roverLocalPos.get(rover.id)!, b)).toBeLessThan(planet.radius * 0.01 + 0.5);
  });
});
