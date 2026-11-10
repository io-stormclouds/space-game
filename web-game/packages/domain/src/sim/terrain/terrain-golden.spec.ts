import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INITIAL_BODIES, PLANET_ID } from '../config/initial-world';
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

  it('Tau Ceti c carries medieval/2 on the body and its grid', () => {
    expect(tcBody.surfaceGrid!.terrain).toEqual({ biome: 'medieval', seed: 2 });
    const grid = buildWorldGrids(TAU_CETI_BODIES).get(TC_C)!;
    expect(grid.terrain).toEqual({ biome: 'medieval', seed: 2, settlementCenter: tc.settlementCenter });
    expect(grid.tiles.map((t) => t.terrain)).toEqual(tc.kinds);
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
  });

  it('dressTerrain on the grid of the world reproduces the whole Tau Ceti c plan', () => {
    const grid = buildWorldGrids(TAU_CETI_BODIES).get(TC_C)!;
    expect(asGolden(dressTerrain(grid))).toEqual(tc);
  });

  it('generateTerrain reproduces it too; only Tau Ceti c carries terrain', () => {
    expect(asGolden(generateTerrain(freshGrid(tcBody), { biome: 'medieval', seed: 2, aim: terrainAim(tcBody) }))).toEqual(tc);
    const grids = buildWorldGrids(TAU_CETI_BODIES);
    expect([...grids].filter(([, g]) => g.terrain).map(([id]) => id)).toEqual([TC_C]);
  });

  it('reproduces the PoC home planet as mixed/7 (no settlement)', () => {
    const plan = generateTerrain(freshGrid(pocBody), { biome: 'mixed', seed: 7, aim: terrainAim(pocBody) });
    expect(asGolden(plan)).toEqual(poc);
    expect(poc.settlementCenter).toBeNull();
    expect(poc.road).toEqual([]);
  });

  it('bodies without terrain keep plain grids', () => {
    for (const grid of buildWorldGrids([...INITIAL_BODIES, ...TAU_CETI_BODIES.filter((b) => b.id !== TC_C)]).values()) {
      expect(grid.terrain).toBeUndefined();
      expect(grid.tiles.some((t) => 'terrain' in t || 'road' in t)).toBe(false);
    }
  });
});
