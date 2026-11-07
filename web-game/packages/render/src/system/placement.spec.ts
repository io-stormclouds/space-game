import {
  MOON_ID,
  PLANET_ID,
  POC_SCENARIO,
  SHIP_ID,
  Simulation,
  TAU_CETI_SCENARIO,
  TC_E,
  footprintTiles,
  tileWidth,
  vec3,
  type PlanetGrid,
  type Structure,
  type Vec3,
} from '@space-game/domain';
import { footprintSpan } from './model-registry';
import {
  MIN_SITE_HEIGHT,
  defaultFocus,
  dockingOffsetOf,
  fitDistance,
  flightKey,
  flightPath,
  flightProgress,
  footprintFrame,
  nearestTile,
  rootBody,
  roverRestPosition,
  structureLook,
  systemExtent,
  workingStructures,
} from './placement';

const len = (v: Vec3) => Math.hypot(v.x, v.y, v.z);
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;

describe('footprint placement', () => {
  const sim = new Simulation(POC_SCENARIO);
  const grid = sim.grids.get(PLANET_ID)!;
  const hex = grid.tiles.find((t) => t.kind === 'HEX')!;

  function checkFrame(g: PlanetGrid, tiles: number[]) {
    const f = footprintFrame(g, tiles);
    expect(len(f.position)).toBeCloseTo(g.radius, 6); // on the sphere
    expect(len(f.normal)).toBeCloseTo(1, 9);
    expect(len(f.forward)).toBeCloseTo(1, 9);
    expect(Math.abs(dot(f.forward, f.normal))).toBeLessThan(1e-9); // tangent
    return f;
  }

  it('1 tile: at the tile centre along its normal, one tile wide', () => {
    const f = checkFrame(grid, [hex.index]);
    expect(f.normal.x).toBeCloseTo(hex.normal.x, 9);
    expect(f.normal.y).toBeCloseTo(hex.normal.y, 9);
    expect(f.width).toBeCloseTo(tileWidth(grid), 9);
  });

  it('3 tiles: at the corner the three share, facing the anchor, 1.8 tiles wide', () => {
    const tiles = footprintTiles(grid, hex.index, 3, 0)!;
    const f = checkFrame(grid, tiles);
    // the centroid of three mutually touching tiles is their shared corner
    const corner = hex.vertices.reduce((best, v) => {
      const d = (p: Vec3) => (p.x - f.position.x) ** 2 + (p.y - f.position.y) ** 2 + (p.z - f.position.z) ** 2;
      return d(v) < d(best) ? v : best;
    });
    expect(Math.hypot(corner.x - f.position.x, corner.y - f.position.y, corner.z - f.position.z)).toBeLessThan(tileWidth(grid) * 0.15);
    const toAnchor = vec3(hex.center.x - f.position.x, hex.center.y - f.position.y, hex.center.z - f.position.z);
    expect(dot(toAnchor, f.forward)).toBeGreaterThan(0);
    expect(f.width).toBeCloseTo(tileWidth(grid) * footprintSpan(3), 9);
  });

  it('7 tiles: at the anchor centre (the flower is symmetric), facing the first neighbour', () => {
    const tiles = footprintTiles(grid, hex.index, 7)!;
    const f = checkFrame(grid, tiles);
    // GP(n,0) hexagons are slightly irregular (most near the pentagons): within a tenth of a tile
    expect(Math.hypot(hex.center.x - f.position.x, hex.center.y - f.position.y, hex.center.z - f.position.z)).toBeLessThan(tileWidth(grid) * 0.1);
    const n1 = grid.tiles[tiles[1]!]!.center;
    expect(dot(vec3(n1.x - f.position.x, n1.y - f.position.y, n1.z - f.position.z), f.forward)).toBeGreaterThan(0);
    expect(f.width).toBeCloseTo(tileWidth(grid) * footprintSpan(7), 9);
  });

  it('is deterministic and never degenerate on pentagons', () => {
    for (const t of grid.tiles.filter((x) => x.kind === 'PENT')) {
      checkFrame(grid, [t.index]);
      checkFrame(grid, footprintTiles(grid, t.index, 3, 2)!);
    }
    expect(footprintFrame(grid, [5, 6])).toEqual(footprintFrame(grid, [5, 6]));
  });

  it('picks the footprint tile nearest to a point on the model', () => {
    const tiles = footprintTiles(grid, hex.index, 3, 1)!;
    for (const i of tiles) expect(nearestTile(grid, tiles, grid.tiles[i]!.center)).toBe(i);
  });

  it('rover rest position = tile centre lifted like the simulation', () => {
    const p = roverRestPosition(grid, hex.index);
    expect(len(p)).toBeCloseTo(grid.radius * 1.005, 6);
    // the simulation writes the same lift for a parked rover it drives
    const tile = grid.tiles[hex.index]!;
    expect(dot(p, tile.normal) / len(p)).toBeCloseTo(1, 9);
  });
});

describe('structure states', () => {
  const s = (state: Structure['state'], progress = 0) => structureLook({ state, progress });

  it('planned = ghost outline only, constructing rises with progress, upgrading = full + scaffold', () => {
    expect(s('PLANNED')).toEqual({ solid: false, height: 0, outline: true });
    expect(s('CONSTRUCTING', 0)).toEqual({ solid: true, height: MIN_SITE_HEIGHT, outline: true });
    expect(s('CONSTRUCTING', 0.5).height).toBe(0.5);
    expect(s('CONSTRUCTING', 1.7).height).toBe(1);
    expect(s('UPGRADING', 0.3)).toEqual({ solid: true, height: 1, outline: true });
    expect(s('ACTIVE')).toEqual({ solid: true, height: 1, outline: false });
  });
});

describe('docking point and flight path match the simulation', () => {
  it('docks above the working landing pad, else 1.25 R above the centre', () => {
    const sim = new Simulation(POC_SCENARIO);
    const working = workingStructures(sim.world);
    for (const id of [PLANET_ID, MOON_ID]) {
      const body = sim.world.bodies.find((b) => b.id === id)!;
      const mine = dockingOffsetOf(body, sim.grids, working);
      const theirs = sim.solver.dockingOffset(id, vec3());
      expect(mine.x).toBeCloseTo(theirs.x, 9);
      expect(mine.y).toBeCloseTo(theirs.y, 9);
      expect(mine.z).toBeCloseTo(theirs.z, 9);
    }
    const moon = sim.world.bodies.find((b) => b.id === MOON_ID)!;
    expect(dockingOffsetOf(moon, sim.grids, working).y).toBeCloseTo(moon.radius * 1.25, 9);
    // a pad that is still a construction site does not move the docking point
    const planet = sim.world.bodies.find((b) => b.id === PLANET_ID)!;
    expect(dockingOffsetOf(planet, sim.grids, []).y).toBeCloseTo(planet.radius * 1.25, 9);
  });

  it('a ship in transit is where the simulation puts it, at every step', () => {
    const sim = new Simulation(POC_SCENARIO);
    const events = sim.dispatch({ type: 'MOVE_SHIP', shipId: SHIP_ID, to: MOON_ID });
    expect(events[0]?.type).toBe('TRANSFER_STARTED');
    const plan = sim.world.ships[0]!.transfer!;
    const path = flightPath(plan);
    const out = vec3();
    let checked = 0;
    while (sim.world.ships[0]!.state === 'IN_TRANSIT') {
      sim.step(0.05);
      const pos = sim.snapshot.shipWorldPos.get(SHIP_ID);
      if (!pos) break;
      const u = flightProgress(plan, sim.time);
      expect(u).toBeCloseTo(sim.snapshot.transitProgress.get(SHIP_ID)!, 9);
      path.pointAt(u, out);
      expect(out.x).toBeCloseTo(pos.x, 6);
      expect(out.y).toBeCloseTo(pos.y, 6);
      expect(out.z).toBeCloseTo(pos.z, 6);
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
    expect(flightProgress(plan, plan.startTime - 1)).toBe(0);
    expect(flightProgress(plan, plan.startTime + plan.estimatedDuration + 1)).toBe(1);
    expect(flightKey(plan)).toBe(flightKey({ ...plan }));
  });
});

describe('camera framing', () => {
  it('the system extent holds every orbit; the fit distance grows with it', () => {
    const bodies = TAU_CETI_SCENARIO.bodies;
    const extent = systemExtent(bodies);
    for (const b of bodies) expect(extent).toBeGreaterThanOrEqual(b.orbitRadius);
    expect(rootBody(bodies)!.kind).toBe('STAR');
    const d = fitDistance(extent, 50, 16 / 9);
    expect(d * Math.sin((25 * Math.PI) / 180)).toBeGreaterThanOrEqual(extent); // fits vertically
    expect(fitDistance(extent, 50, 0.5)).toBeGreaterThan(d); // portrait: horizontal fov limits
  });

  it('defaults the planet camera to the colony site, the home base, then a revealed gridded body', () => {
    const poc = new Simulation(POC_SCENARIO);
    expect(defaultFocus(poc.world)).toBe(PLANET_ID);
    const tc = new Simulation(TAU_CETI_SCENARIO);
    expect(defaultFocus(tc.world)).toBe(TAU_CETI_SCENARIO.bodies.find((b) => b.kind === 'PLANET')!.id);
    expect(defaultFocus({ ...tc.world, colony: { siteBodyId: TC_E, foundedAt: null } })).toBe(TC_E);
  });
});
