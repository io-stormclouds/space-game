import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INITIAL_BODIES, PLANET_ID } from '../config/initial-world';
import { INITIAL_STRUCTURES } from '../config/world';
import { buildGoldbergGrid } from '../math/goldberg-grid';
import { CelestialBody } from '../models/celestial-body.model';
import { buildWorldGrids } from '../scenario';
import { TAU_CETI_BODIES, TC_C } from '../scenarios/tau-ceti';
import { classifyTerrain, terrainAim } from './terrain-classify';
import { dressTerrain, generateTerrain } from './terrain-generator';
import { TerrainPlan } from './terrain-types';

/*
 * Golden of the terrain split (T8 A1): `__fixtures__/terrain-golden.json` was recorded with the generator
 * BEFORE it was split into `classifyTerrain` (gameplay) and `dressTerrain` (render). Both halves, every
 * path into them and the classes the grid carries must reproduce it exactly (the settlement must not move).
 *
 * T5 keeps the fixture: the configs it was recorded with (`medieval/2`, `mixed/7`) still reproduce it
 * exactly. The bodies changed on purpose: Tau Ceti c is `medieval/2` with dried lake beds (`basin: 'dune'`,
 * T-26), so its world grid is the golden with every lake a dune and nothing else changed; the PoC planet is
 * `mixed/7` with a dry landing cap (`landingCap: 0.9`), so its world grid is the golden with the lakes
 * where n.y > 0.9 turned to grass (two tiles under the port of the preset) and nothing else changed.
 */

interface Golden {
  kinds: string[];
  road: number[];
  settlementCenter: number | null;
  variants: unknown[];
  decor: unknown[];
}

const FIXTURE = resolve(dirname(fileURLToPath(import.meta.url)), '__fixtures__/terrain-golden.json');
const GOLDEN = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, Golden>;

/** The golden with its lakes dried out (T-26): only the class changes, the kit tiles and decor stay. */
const dried = (g: Golden): Golden => ({ ...g, kinds: g.kinds.map((k) => (k === 'water' ? 'dune' : k)) });

/** The plan as the golden stores it (JSON round trip: exact for doubles). */
const asGolden = (plan: TerrainPlan): Golden =>
  JSON.parse(
    JSON.stringify({
      kinds: plan.kinds,
      road: [...plan.road].sort((a, b) => a - b),
      settlementCenter: plan.settlementCenter,
      variants: plan.variants,
      decor: plan.decor,
    }),
  );

const freshGrid = (b: CelestialBody) =>
  buildGoldbergGrid(b.id, b.radius, b.surfaceGrid!.frequency, b.surfaceGrid!.depositSeed, b.surfaceGrid!.depositWeights);

describe('terrain golden (recorded before the classify/dress split)', () => {
  const tcBody = TAU_CETI_BODIES.find((b) => b.id === TC_C)!;
  const tc = GOLDEN['tc-c medieval/2']!;
  const pocBody = INITIAL_BODIES.find((b) => b.id === PLANET_ID)!;
  const poc = GOLDEN['planet mixed/7']!;

  it('Tau Ceti c carries medieval/2 with dried lake beds on the body and its grid', () => {
    expect(tcBody.surfaceGrid!.terrain).toEqual({ biome: 'medieval', seed: 2, basin: 'dune' });
    const grid = buildWorldGrids(TAU_CETI_BODIES).get(TC_C)!;
    expect(grid.terrain).toEqual({ biome: 'medieval', seed: 2, basin: 'dune', settlementCenter: tc.settlementCenter });
    expect(grid.tiles.map((t) => t.terrain)).toEqual(dried(tc).kinds);
    expect(grid.tiles.filter((t) => t.road).map((t) => t.index)).toEqual(tc.road);
    // `road` is set only on road tiles, never `false`
    expect(grid.tiles.every((t) => t.road === undefined || t.road === true)).toBe(true);
  });

  it('classifyTerrain reproduces the classes, roads and centre of Tau Ceti c', () => {
    const c = classifyTerrain(freshGrid(tcBody), { biome: 'medieval', seed: 2, aim: terrainAim(tcBody) });
    expect(c.kinds).toEqual(tc.kinds);
    expect([...c.road]).toEqual(tc.road); // ascending already
    expect(c.settlementCenter).toBe(tc.settlementCenter);
    expect(c.rings!.r1).toHaveLength(6);
    // the dried lakes change the basin class and nothing else: same roads, same centre
    const d = classifyTerrain(freshGrid(tcBody), { biome: 'medieval', seed: 2, basin: 'dune', aim: terrainAim(tcBody) });
    expect(d.kinds).toEqual(dried(tc).kinds);
    expect([...d.road]).toEqual(tc.road);
    expect(d.settlementCenter).toBe(tc.settlementCenter);
  });

  it('dressTerrain on the grid of the world reproduces the whole Tau Ceti c plan, lakes dried', () => {
    const grid = buildWorldGrids(TAU_CETI_BODIES).get(TC_C)!;
    expect(asGolden(dressTerrain(grid))).toEqual(dried(tc));
  });

  it('generateTerrain reproduces it too; every Tau Ceti body with a grid carries terrain', () => {
    expect(asGolden(generateTerrain(freshGrid(tcBody), { biome: 'medieval', seed: 2, aim: terrainAim(tcBody) }))).toEqual(tc);
    expect(asGolden(generateTerrain(freshGrid(tcBody), { ...tcBody.surfaceGrid!.terrain!, aim: terrainAim(tcBody) }))).toEqual(dried(tc));
    const grids = buildWorldGrids(TAU_CETI_BODIES);
    expect([...grids].filter(([, g]) => g.terrain).map(([id]) => id)).toEqual(['tc-b', 'tc-c', 'tc-d', 'tc-e', 'tc-f']);
  });

  it('reproduces the PoC home planet as mixed/7 (no settlement)', () => {
    const plan = generateTerrain(freshGrid(pocBody), { biome: 'mixed', seed: 7, aim: terrainAim(pocBody) });
    expect(asGolden(plan)).toEqual(poc);
    expect(poc.settlementCenter).toBeNull();
    expect(poc.road).toEqual([]);
  });

  it('the PoC planet of the world is the golden with a plain landing zone around the top tile', () => {
    expect(pocBody.surfaceGrid!.terrain).toEqual({ biome: 'mixed', seed: 7, landingCap: 0.9 });
    const grid = buildWorldGrids(INITIAL_BODIES).get(PLANET_ID)!;
    const zone = new Set(grid.tiles.filter((t) => t.normal.y > 0.9).map((t) => t.index));
    const want = poc.kinds.map((k, i) => (zone.has(i) ? 'grass' : k));
    // the zone turns the polar snow and the two lakes under the port of the preset (53, 114) into grass, nothing outside it changes
    expect(want.flatMap((k, i) => (k !== poc.kinds[i] ? [i] : []))).toEqual([...zone].filter((i) => poc.kinds[i] !== 'grass').sort((a, b) => a - b));
    expect(want.flatMap((k, i) => (k !== poc.kinds[i] ? [i] : []))).toEqual(expect.arrayContaining([53, 114]));
    expect(grid.tiles.map((t) => t.terrain)).toEqual(want);
    // so the pad, the panel and the port stand where they stood before T5
    expect(INITIAL_STRUCTURES.map((s) => `${s.kind}:${s.tiles.map((t) => t.split(':')[1]).join(',')}`)).toEqual(['LAND:48', 'SOL:102', 'HQ:53,45,1']);
  });

  it('bodies without a terrain config keep plain grids', () => {
    const plain = [...INITIAL_BODIES, ...TAU_CETI_BODIES].map((b): CelestialBody => {
      if (!b.surfaceGrid) return b;
      const { terrain: _, ...surfaceGrid } = b.surfaceGrid;
      return { ...b, surfaceGrid };
    });
    const grids = buildWorldGrids(plain);
    expect(grids.size).toBeGreaterThan(5);
    for (const grid of grids.values()) {
      expect(grid.terrain).toBeUndefined();
      expect(grid.tiles.some((t) => 'terrain' in t || 'road' in t)).toBe(false);
    }
  });
});
