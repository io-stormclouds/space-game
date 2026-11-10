import { TC_C, computeEconomy, dressTerrain, isNatureDecor, tileIndexOf } from '@space-game/domain';
import { LOAD_SPECS, buildLoad } from './load';
import { MockServer } from './server';

describe('load scenarios (F5)', () => {
  const eco = computeEconomy();

  it.each(['S', 'M', 'L'] as const)('level %s has the specified buildings, ships and rovers, set in motion', (level) => {
    const spec = LOAD_SPECS[level];
    const sim = buildLoad(level, eco);
    expect(sim.world.structures.length).toBe(spec.structures);
    expect(sim.world.ships.filter((s) => s.role === 'SHIP').length).toBe(spec.ships);
    expect(sim.world.rovers.length).toBe(spec.rovers);
    expect(sim.world.ships.filter((s) => s.state === 'IN_TRANSIT').length).toBeGreaterThan(spec.ships * 0.8);
    expect(sim.world.rovers.filter((r) => r.state === 'MOVING').length).toBeGreaterThan(spec.rovers * 0.5);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(buildLoad('M', eco).world)).toBe(JSON.stringify(buildLoad('M', eco).world));
  });

  it('MT is the M world unchanged plus a colony beside the ruins of Tau Ceti c, where the colony site moves', () => {
    const m = buildLoad('M', eco);
    const mt = buildLoad('MT', eco);
    const w = mt.world;
    expect(w.structures.slice(0, m.world.structures.length)).toEqual(m.world.structures);
    expect(w.ships).toEqual(m.world.ships);
    expect(w.rovers).toEqual(m.world.rovers);
    expect(w.colony.siteBodyId).toBe(TC_C);
    const colony = w.structures.slice(m.world.structures.length);
    expect(colony.length).toBe(LOAD_SPECS.MT.terrainColony!.buildings);
    expect(colony.every((s) => s.bodyId === TC_C && s.state === 'ACTIVE')).toBe(true);
    expect(colony[0]!.kind).toBe('HQ');
    expect(new Set(colony.map((s) => s.level))).toEqual(new Set([1, 3, 5]));
    // beside the settlement: within a few rings of its centre, never on a ruin building or another structure
    const grid = mt.grids.get(TC_C)!;
    const plan = dressTerrain(grid);
    const ring = new Map([[plan.settlementCenter!, 0]]);
    for (const [t, d] of ring) for (const n of grid.tiles[t]!.neighbors) if (!ring.has(n)) ring.set(n, d + 1);
    const tiles = colony.flatMap((s) => s.tiles.map(tileIndexOf));
    expect(Math.max(...tiles.map((t) => ring.get(t)!))).toBeLessThanOrEqual(5);
    const ruins = new Set(plan.decor.filter((d) => !isNatureDecor(d.model)).map((d) => d.tile));
    expect(tiles.filter((t) => ruins.has(t))).toEqual([]);
    const all = w.structures.filter((s) => s.bodyId === TC_C).flatMap((s) => s.tiles);
    expect(new Set(all).size).toBe(all.length);
  });

  it('starts through the mock server and keeps stepping', () => {
    const s = new MockServer();
    s.start('load-m');
    s.stepMany(60);
    expect(s.snapshot().world.structures.length).toBe(300);
    expect(s.snapshot().scenarioId).toBe('load-m');
    s.start('load-m-teren');
    s.stepMany(60);
    expect(s.snapshot().world.structures.length).toBe(300 + LOAD_SPECS.MT.terrainColony!.buildings);
    expect(s.snapshot().world.colony.siteBodyId).toBe(TC_C);
  });
});
