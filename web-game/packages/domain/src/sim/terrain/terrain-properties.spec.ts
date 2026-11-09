import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bodyId } from '../../shared/ids';
import { INITIAL_BODIES } from '../config/initial-world';
import { buildGoldbergGrid } from '../math/goldberg-grid';
import { fbm } from '../math/seeded-noise';
import { Vec3, vec3 } from '../math/vec3';
import { CelestialBody } from '../models/celestial-body.model';
import { PlanetGrid } from '../models/planet-grid.model';
import { TAU_CETI_BODIES } from '../scenarios/tau-ceti';
import { MAX_ROCKS, MAX_TREES, generateTerrain } from './terrain-generator';
import { TerrainBiome, TerrainKind, TerrainPlan } from './terrain-types';
import { TileFrame, buildTileFrames } from './tile-frame';
import { ROAD_MASKS, SHORE_MASKS } from './tile-variant';

/*
 * Property tests of the terrain generator over a matrix: Goldberg grids n = 3…8 (the real Tau Ceti and PoC
 * deposit layouts plus single-ore layouts) × noise seeds × biomes × settlement aims. Each check collects
 * every offender as "<combination> tile <i>: <what>" and asserts the list is empty, so one run shows them
 * all. `terrain.spec.ts` keeps the detailed checks of Tau Ceti c.
 */

const KIT_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../apps/game/public/assets/kaykit-hex',
);
const KIT_SUFFIX = '.gltf.glb';
const KIT_FILES = new Set(
  readdirSync(KIT_DIR)
    .filter((f) => f.endsWith(KIT_SUFFIX))
    .map((f) => f.slice(0, -KIT_SUFFIX.length)),
);

// ---------------------------------------------------------------------------------------------- matrix

interface GridCase {
  label: string;
  n: number;
  depositSeed: number;
  weights?: Readonly<Record<string, number>>;
  /** Body phase φ; the second aim is (−cos φ, 0.9, −sin φ) like `terrainAim`. */
  phi: number;
}

const fromBody = (b: CelestialBody): GridCase => ({
  label: b.id,
  n: b.surfaceGrid!.frequency,
  depositSeed: b.surfaceGrid!.depositSeed!,
  weights: b.surfaceGrid!.depositWeights,
  phi: b.initialAngle,
});

const GRID_CASES: GridCase[] = [
  // PoC home planet (n = 8) and moon (n = 3), Tau Ceti b–f (n = 5, 5, 6, 8, 6)
  ...[...INITIAL_BODIES, ...TAU_CETI_BODIES].filter((b) => b.surfaceGrid).map(fromBody),
  // PoC medieval showcase planet (poc/space-3d-poc config: COLONY_SURFACE, phase 0.85π + 2 · 12°)
  { label: 'poc-medieval', n: 8, depositSeed: 31, phi: Math.PI * 0.85 + (24 * Math.PI) / 180 },
  // single-ore layouts
  { label: 'kri-only', n: 3, depositSeed: 5, weights: { KRI: 1 }, phi: 0.3 },
  { label: 'fer-only', n: 4, depositSeed: 7, weights: { FER: 1 }, phi: 1 },
];

const SEEDS = [1, 2, 7, 11, 23, 102];
const BIOMES: TerrainBiome[] = ['mixed', 'medieval'];

interface Combo {
  tag: string;
  gridCase: GridCase;
  n: number;
  seed: number;
  biome: TerrainBiome;
  aim: Vec3 | undefined;
  grid: PlanetGrid;
  frames: TileFrame[];
}

interface Run extends Combo {
  plan: TerrainPlan;
  again: TerrainPlan;
}

const GRIDS = GRID_CASES.map((g) => {
  const grid = buildGoldbergGrid(bodyId(g.label), (50 * g.n) / 8, g.n, g.depositSeed, g.weights);
  return { gridCase: g, grid, frames: buildTileFrames(grid) };
});

const COMBOS: Combo[] = GRIDS.flatMap(({ gridCase, grid, frames }) =>
  SEEDS.flatMap((seed) =>
    BIOMES.flatMap((biome) =>
      [undefined, vec3(-Math.cos(gridCase.phi), 0.9, -Math.sin(gridCase.phi))].map((aim) => ({
        tag: `n=${gridCase.n} grid=${gridCase.label} seed=${seed} biome=${biome} aim=${aim ? 'phi' : 'default'}`,
        gridCase,
        n: gridCase.n,
        seed,
        biome,
        aim,
        grid,
        frames,
      })),
    ),
  ),
);

const optsOf = (c: Combo) => ({ biome: c.biome, seed: c.seed, aim: c.aim });

/** Plans of every combination, generated lazily (so a throw fails a test, not the collection) and once. */
let runCache: Run[] | null = null;
function runs(): Run[] {
  if (!runCache) {
    const plans = COMBOS.map((c) => generateTerrain(c.grid, optsOf(c)));
    // the second pass runs after all the others: a hidden cache or a mutated grid would show up here
    const again = COMBOS.map((c) => generateTerrain(c.grid, optsOf(c)));
    runCache = COMBOS.map((c, k) => ({ ...c, plan: plans[k], again: again[k] }));
  }
  return runCache;
}

// --------------------------------------------------------------------------------------------- helpers

type Fail = (tile: number | null, what: string) => void;

/** Runs `check` on every combination and returns all failures, each naming the combination and tile. */
function collect<T extends Combo>(
  list: ReadonlyArray<T>,
  check: (c: T, fail: Fail) => void,
): string[] {
  const out: string[] = [];
  for (const c of list)
    check(c, (tile, what) => out.push(`${c.tag}${tile === null ? '' : ` tile ${tile}`}: ${what}`));
  return out;
}

function expectNone(failures: string[]): void {
  expect(failures.slice(0, 30), `${failures.length} failure(s)`).toEqual([]);
}

const TREES = new Set(['detail_treeA', 'detail_treeB', 'detail_treeC']);
const ROCKS = new Set(['detail_rocks', 'detail_rocks_small', 'mountain']);
/** Settlement models (everything that is not scattered nature). */
const isBuilding = (model: string): boolean => !model.startsWith('detail_') && model !== 'mountain';

/** Kit side k of a tile turned by k0 lies on tile edge (k0 + k + 5) mod 6 (see `chooseVariant`). */
const edgeOfSide = (k0: number, k: number): number => (k0 + k + 5) % 6;

/** Tile edges the '1' sides of a six-side mask fall on. */
const maskEdges = (mask: string, k0: number): Set<number> => {
  const out = new Set<number>();
  for (let k = 0; k < 6; k++) if (mask[k] === '1') out.add(edgeOfSide(k0, k));
  return out;
};

/** Number of sides where the mask and the wanted edge set disagree. */
const mismatches = (mask: string, k0: number, want: ReadonlyArray<boolean>): number => {
  let bad = 0;
  for (let k = 0; k < 6; k++) if ((mask[k] === '1') !== want[edgeOfSide(k0, k)]) bad++;
  return bad;
};

/** BFS ring of every tile within `maxRing` steps of `center`. */
function ringsAround(grid: PlanetGrid, center: number, maxRing: number): Map<number, number> {
  const ring = new Map<number, number>([[center, 0]]);
  let frontier = [center];
  for (let r = 1; r <= maxRing; r++) {
    const next: number[] = [];
    for (const t of frontier) {
      for (const nb of grid.tiles[t].neighbors) {
        if (!ring.has(nb)) {
          ring.set(nb, r);
          next.push(nb);
        }
      }
    }
    frontier = next;
  }
  return ring;
}

const firstDiff = (a: ReadonlyArray<unknown>, b: ReadonlyArray<unknown>): number => {
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return i;
  return -1;
};

// ------------------------------------------------------------- classification replica (for the Rust port)

/** Thresholds of `generateTerrain`, per biome (`settle` = medieval). */
const THRESHOLDS: Readonly<
  Record<TerrainBiome, { water: number; snow: number; rock: number; forest: number }>
> = {
  mixed: { water: 0.42, snow: 0.84, rock: 0.64, forest: 0.57 },
  medieval: { water: 0.36, snow: 0.88, rock: 0.67, forest: 0.55 },
};

/**
 * The class chain of `generateTerrain` replicated term for term, plus the distance of each compared value
 * to its threshold (only the comparisons the chain actually makes).
 */
function classify(
  normal: Vec3,
  seed: number,
  biome: TerrainBiome,
): { kind: TerrainKind; margin: number; at: string } {
  const T = THRESHOLDS[biome];
  const p = (k: number): Vec3 => vec3(normal.x * k + 7, normal.y * k + 7, normal.z * k + 7);
  const f1 = fbm(seed, p(2.6));
  const f2 = fbm(seed + 11, p(3.4));
  const f3 = fbm(seed + 23, p(4.2));
  const lat = Math.abs(normal.y);
  let margin = Math.abs(f1 - T.water);
  let at = 'f1/water';
  const note = (d: number, what: string): void => {
    if (Math.abs(d) < margin) {
      margin = Math.abs(d);
      at = what;
    }
  };
  if (f1 < T.water) return { kind: 'water', margin, at };
  note(lat - T.snow, 'lat/snow');
  if (lat > T.snow) return { kind: 'snow', margin, at };
  note(f2 - T.rock, 'f2/rock');
  if (f2 > T.rock) return { kind: 'rock', margin, at };
  note(f3 - T.forest, 'f3/forest');
  if (f3 > T.forest) return { kind: 'forest', margin, at };
  return { kind: 'grass', margin, at };
}

/** Classes before the settlement, per grid × seed × biome (the aim does not enter the classification). */
const CLASSIFIED = GRIDS.flatMap(({ gridCase, grid }) =>
  SEEDS.flatMap((seed) =>
    BIOMES.map((biome) => ({
      key: `${gridCase.label}/${seed}/${biome}`,
      tag: `n=${gridCase.n} grid=${gridCase.label} seed=${seed} biome=${biome}`,
      tiles: grid.tiles.map((t) => {
        const c = classify(t.normal, seed, biome);
        // no water on a pentagon or a deposit (the generator's fix-up, no threshold involved)
        const kind: TerrainKind =
          c.kind === 'water' && (t.kind === 'PENT' || t.deposit !== null) ? 'grass' : c.kind;
        return { ...c, kind };
      }),
    })),
  ),
);
const CLASSIFIED_BY_KEY = new Map(CLASSIFIED.map((c) => [c.key, c]));

let MIN_MARGIN = Infinity;
let MIN_MARGIN_AT = '';
for (const c of CLASSIFIED) {
  c.tiles.forEach((t, i) => {
    if (t.margin < MIN_MARGIN) {
      MIN_MARGIN = t.margin;
      MIN_MARGIN_AT = `${c.tag} tile ${i} ${t.at}`;
    }
  });
}

// ----------------------------------------------------------------------------------------------- tests

describe(`terrain generator properties (${COMBOS.length} combinations)`, () => {
  it('covers every grid size, seed and biome in at least 60 combinations', () => {
    expect(COMBOS.length).toBeGreaterThanOrEqual(60);
    expect(new Set(COMBOS.map((c) => c.n))).toEqual(new Set([3, 4, 5, 6, 8]));
    expect(KIT_FILES.has('hex_forest')).toBe(true);
  });

  it('tile frames: every edge of every tile faces a distinct neighbour that faces back', () => {
    const failures: string[] = [];
    for (const { gridCase, grid, frames } of GRIDS) {
      for (const f of frames) {
        const t = grid.tiles[f.index];
        const where = `n=${gridCase.n} grid=${gridCase.label} tile ${f.index}`;
        if (f.m !== (t.kind === 'PENT' ? 5 : 6) || f.edgeNb.length !== f.m)
          failures.push(`${where}: ${f.edgeNb.length} edges`);
        if (new Set(f.edgeNb).size !== f.m || f.edgeNb.some((nb) => !t.neighbors.includes(nb)))
          failures.push(`${where}: edge neighbours ${f.edgeNb}`);
        for (const nb of f.edgeNb)
          if (!frames[nb].edgeNb.includes(f.index))
            failures.push(`${where}: neighbour ${nb} does not face back`);
      }
    }
    expectNone(failures);
  });

  it('is deterministic: a second run gives the same kinds, variants, decor, roads and centre', () => {
    expectNone(
      collect(runs(), ({ plan, again }, fail) => {
        const kinds = firstDiff(plan.kinds, again.kinds);
        if (kinds >= 0) fail(kinds, `kind ${plan.kinds[kinds]} vs ${again.kinds[kinds]}`);
        const variants = firstDiff(plan.variants, again.variants);
        if (variants >= 0)
          fail(
            variants,
            `variant ${JSON.stringify(plan.variants[variants])} vs ${JSON.stringify(again.variants[variants])}`,
          );
        const decor = firstDiff(plan.decor, again.decor);
        if (decor >= 0)
          fail(
            plan.decor[decor]?.tile ?? again.decor[decor]?.tile ?? null,
            `decor #${decor} differs`,
          );
        const road = firstDiff([...plan.road], [...again.road]);
        if (road >= 0) fail([...plan.road][road] ?? null, `road #${road} differs`);
        if (plan.settlementCenter !== again.settlementCenter)
          fail(plan.settlementCenter, `centre vs ${again.settlementCenter}`);
      }),
    );
  });

  it('ignores the aim on mixed bodies (it only places the settlement)', () => {
    const byKey = new Map<string, TerrainPlan>();
    expectNone(
      collect(
        runs().filter((r) => r.biome === 'mixed'),
        (r, fail) => {
          const key = `${r.gridCase.label}/${r.seed}`;
          const other = byKey.get(key);
          if (!other) return void byKey.set(key, r.plan);
          const i = firstDiff(
            [...r.plan.variants, ...r.plan.decor],
            [...other.variants, ...other.decor],
          );
          if (i >= 0) fail(i < r.plan.variants.length ? i : null, 'plan depends on the aim');
        },
      ),
    );
  });

  it('gives every hexagon an existing kit tile with a whole-side rotation and every pentagon none', () => {
    expectNone(
      collect(runs(), ({ grid, plan }, fail) => {
        if (plan.kinds.length !== grid.tiles.length || plan.variants.length !== grid.tiles.length)
          fail(null, 'array lengths');
        grid.tiles.forEach((t, i) => {
          const v = plan.variants[i];
          if ((v === null) !== (t.kind === 'PENT'))
            return fail(i, `${t.kind} has variant ${JSON.stringify(v)}`);
          if (!v) return;
          if (!Number.isInteger(v.k0) || v.k0 < 0 || v.k0 > 5) fail(i, `k0 ${v.k0}`);
          if (!v.id.startsWith('hex_') || !KIT_FILES.has(v.id)) fail(i, `unknown kit tile ${v.id}`);
          if (v.id.startsWith('hex_forest_road') !== plan.road.has(i))
            fail(i, `${v.id} but road = ${plan.road.has(i)}`);
        });
      }),
    );
  });

  it('keeps deposits free of water, roads, decor and raised transitions; pentagons free of water, roads and buildings', () => {
    expectNone(
      collect(runs(), ({ grid, plan }, fail) => {
        const decorOn = new Map<number, string[]>();
        for (const d of plan.decor) decorOn.set(d.tile, [...(decorOn.get(d.tile) ?? []), d.model]);
        grid.tiles.forEach((t, i) => {
          if (t.deposit) {
            if (plan.kinds[i] === 'water') fail(i, 'water on a deposit');
            if (plan.road.has(i)) fail(i, 'road on a deposit');
            if (decorOn.has(i)) fail(i, `decor ${decorOn.get(i)} on a deposit`);
            if (plan.variants[i]?.id.startsWith('hex_forest_transition') || plan.variants[i]?.id === 'hex_forest_waterD')
              fail(i, `${plan.variants[i]!.id} on a deposit`);
          }
          if (t.kind === 'PENT') {
            if (plan.kinds[i] === 'water') fail(i, 'water on a pentagon');
            if (plan.road.has(i)) fail(i, 'road on a pentagon');
            const buildings = (decorOn.get(i) ?? []).filter(isBuilding);
            if (buildings.length) fail(i, `building ${buildings} on a pentagon`);
          }
        });
      }),
    );
  });

  /*
   * Road rule of `chooseVariant`: best fit, not exact match. Every mask of ROAD_MASKS at every rotation is
   * scored 3·(exits facing a road neighbour) − 2·(sides that disagree), first maximum wins; no road
   * neighbour → roadA. Every set of 2…6 sides is a rotation of some mask, so with ≥ 2 road neighbours the
   * best fit is exact (every exit faces a road and every road neighbour gets an exit); with exactly one it
   * is a two-exit mask with one exit on that neighbour and one dangling (a spoke end). Asserted: (a) no
   * mask/rotation has strictly fewer mismatches than the chosen one, (b) exact with ≥ 2 road neighbours,
   * (c) the single road neighbour gets an exit.
   */
  it('road tiles: the chosen mask is a best fit, exact with two or more road neighbours', () => {
    expectNone(
      collect(runs(), ({ plan, frames }, fail) => {
        for (const i of plan.road) {
          const v = plan.variants[i];
          if (!v) {
            fail(i, 'road on a tile without a kit tile');
            continue;
          }
          if (plan.kinds[i] !== 'grass') fail(i, `road tile is ${plan.kinds[i]}`);
          const want = frames[i].edgeNb.map((nb) => plan.road.has(nb));
          const roadSides = want.filter(Boolean).length;
          if (roadSides === 0) {
            if (v.id !== 'hex_forest_roadA' || v.k0 !== 0)
              fail(i, `isolated road tile is ${v.id}/${v.k0}`);
            continue;
          }
          const letter = /^hex_forest_road([A-Z])$/.exec(v.id)?.[1];
          const mask = letter === undefined ? undefined : ROAD_MASKS[letter];
          if (mask === undefined) {
            fail(i, `road tile with ${roadSides} road neighbours is ${v.id}`);
            continue;
          }
          const chosen = mismatches(mask, v.k0, want);
          let best = Infinity;
          for (const m of Object.values(ROAD_MASKS))
            for (let k0 = 0; k0 < 6; k0++) best = Math.min(best, mismatches(m, k0, want));
          if (chosen > best) fail(i, `${v.id}/${v.k0} has ${chosen} mismatches, ${best} possible`);
          const exits = maskEdges(mask, v.k0);
          if (roadSides >= 2 && chosen !== 0)
            fail(
              i,
              `${v.id}/${v.k0} exits [${[...exits]}] ≠ road edges [${want.flatMap((w, e) => (w ? [e] : []))}]`,
            );
          if (roadSides === 1 && !exits.has(want.indexOf(true)))
            fail(i, `spoke end ${v.id}/${v.k0} misses its road neighbour`);
        }
      }),
    );
  });

  /*
   * Shore rule of `chooseVariant`: exact match. A land tile (not road) with 1 water side or 2 adjacent water
   * sides gets waterB/C or waterA turned so the mask's water sides are exactly the water edges; anything
   * else gets no shore tile. The pond waterD needs grass and no water neighbour.
   */
  it('shore tiles match the water edges exactly, ponds sit away from water, hex_water only on water', () => {
    expectNone(
      collect(runs(), ({ grid, plan, frames }, fail) => {
        grid.tiles.forEach((t, i) => {
          const v = plan.variants[i];
          if (!v) return;
          if ((v.id === 'hex_water') !== (plan.kinds[i] === 'water'))
            fail(i, `${v.id} on ${plan.kinds[i]}`);
          const water = frames[i].edgeNb.map((nb) => plan.kinds[nb] === 'water');
          const nWater = water.filter(Boolean).length;
          const shore = /^hex_forest_water([ABC])$/.exec(v.id)?.[1];
          if (shore !== undefined) {
            const mask = SHORE_MASKS[shore]!;
            if (plan.kinds[i] === 'water' || plan.road.has(i))
              fail(i, `${v.id} on ${plan.kinds[i]} road=${plan.road.has(i)}`);
            if (mismatches(mask, v.k0, water) !== 0)
              fail(
                i,
                `${v.id}/${v.k0} water sides [${[...maskEdges(mask, v.k0)]}] ≠ water edges [${water.flatMap((w, e) => (w ? [e] : []))}]`,
              );
          }
          if (v.id === 'hex_forest_waterD') {
            if (plan.kinds[i] !== 'grass') fail(i, `pond on ${plan.kinds[i]}`);
            if (t.neighbors.some((nb) => plan.kinds[nb] === 'water')) fail(i, 'pond next to water');
          }
          // coverage: a shore the masks can express is never missed
          if (plan.kinds[i] !== 'water' && !plan.road.has(i)) {
            const adjacentPair = nWater === 2 && water.some((w, e) => w && water[(e + 1) % 6]);
            if (nWater === 1 && v.id !== 'hex_forest_waterB' && v.id !== 'hex_forest_waterC')
              fail(i, `one water side but ${v.id}`);
            if (adjacentPair && v.id !== 'hex_forest_waterA')
              fail(i, `two adjacent water sides but ${v.id}`);
          }
        });
      }),
    );
  });

  it('uses both one-side shore tiles (waterB and waterC) about equally', () => {
    let b = 0;
    let c = 0;
    for (const { plan } of runs()) for (const v of plan.variants) {
      if (v?.id === 'hex_forest_waterB') b++;
      if (v?.id === 'hex_forest_waterC') c++;
    }
    expect(b).toBeGreaterThan(100);
    expect(c / (b + c)).toBeGreaterThan(0.35);
    expect(c / (b + c)).toBeLessThan(0.65);
  });

  /*
   * Transition rule of `chooseVariant`: only grass or forest tiles; B when a neighbour is snow (and a hash
   * passes), else A when a neighbour is rock. The raised half (kit side 0, tile edge (k0 + 5) mod 6) faces
   * the FIRST edge with that neighbour (findIndex). Never on a deposit (the generator falls back to hex_forest).
   */
  it('raised transitions face the first rock (A) or snow (B) neighbour of a grass or forest tile', () => {
    const target: Readonly<Record<string, TerrainKind>> = {
      hex_forest_transitionA: 'rock',
      hex_forest_transitionB: 'snow',
    };
    expectNone(
      collect(runs(), ({ grid, plan, frames }, fail) => {
        plan.variants.forEach((v, i) => {
          const want = v ? target[v.id] : undefined;
          if (!v || want === undefined) return;
          if (plan.kinds[i] !== 'grass' && plan.kinds[i] !== 'forest')
            fail(i, `${v.id} on ${plan.kinds[i]}`);
          if (grid.tiles[i].deposit) fail(i, `${v.id} on a deposit`);
          const raised = (v.k0 + 5) % 6;
          const first = frames[i].edgeNb.findIndex((nb) => plan.kinds[nb] === want);
          if (first < 0) fail(i, `${v.id} without a ${want} neighbour`);
          else if (raised !== first)
            fail(i, `${v.id}/${v.k0} raised edge ${raised}, first ${want} edge ${first}`);
        });
      }),
    );
  });

  it('places decor on existing tiles within budget: trees on forest, rocks on rock, one building per tile', () => {
    expectNone(
      collect(runs(), ({ grid, plan }, fail) => {
        const buildingOn = new Map<number, string>();
        for (const d of plan.decor) {
          if (!isBuilding(d.model)) continue;
          if (buildingOn.has(d.tile))
            fail(d.tile, `${d.model} and ${buildingOn.get(d.tile)} on one tile`);
          buildingOn.set(d.tile, d.model);
        }
        let trees = 0;
        let rocks = 0;
        for (const d of plan.decor) {
          const i = d.tile;
          if (!Number.isInteger(i) || i < 0 || i >= grid.tiles.length) {
            fail(null, `${d.model} on missing tile ${i}`);
            continue;
          }
          if (!KIT_FILES.has(d.model)) fail(i, `unknown model ${d.model}`);
          if (TREES.has(d.model)) {
            trees++;
            if (plan.kinds[i] !== 'forest') fail(i, `${d.model} on ${plan.kinds[i]}`);
          } else if (ROCKS.has(d.model)) {
            rocks++;
            if (plan.kinds[i] !== 'rock') fail(i, `${d.model} on ${plan.kinds[i]}`);
          } else if (grid.tiles[i].kind !== 'HEX' || grid.tiles[i].deposit) {
            fail(i, `${d.model} on ${grid.tiles[i].kind} deposit=${!!grid.tiles[i].deposit}`);
          }
          if ((TREES.has(d.model) || ROCKS.has(d.model)) && (plan.road.has(i) || buildingOn.has(i)))
            fail(i, `${d.model} on a road or under ${buildingOn.get(i)}`);
        }
        if (trees > MAX_TREES) fail(null, `${trees} trees > ${MAX_TREES}`);
        if (rocks > MAX_ROCKS) fail(null, `${rocks} rocks and mountains > ${MAX_ROCKS}`);
      }),
    );
  });

  /*
   * GP(n,0) puts the 12 pentagons n steps apart, so with n ≤ 4 no hexagon is 3 steps from every pentagon
   * and there is no valid centre; from n = 5 on there always is one.
   */
  it('medieval: plans a settlement far from pentagons when the grid allows one, none otherwise', () => {
    for (const c of COMBOS.filter((x) => x.biome === 'medieval' && x.n <= 4)) {
      expect(() => generateTerrain(c.grid, optsOf(c)), c.tag).not.toThrow();
    }
    expectNone(
      collect(runs(), ({ grid, plan, n, biome }, fail) => {
        const center = plan.settlementCenter;
        const buildings = plan.decor.filter((d) => isBuilding(d.model));
        if (biome === 'mixed' || center === null) {
          if (biome === 'medieval' && n >= 5) fail(null, 'no settlement centre');
          if (center !== null) fail(center, 'mixed body has a settlement centre');
          if (plan.road.size)
            fail([...plan.road][0]!, `${plan.road.size} road tiles without a settlement`);
          if (buildings.length)
            fail(buildings[0]!.tile, `${buildings.length} buildings without a settlement`);
          return;
        }
        if (n <= 4) fail(center, 'centre on a grid too small for one');
        const ring = ringsAround(grid, center, 3);
        if (grid.tiles[center].kind !== 'HEX') fail(center, 'centre is a pentagon');
        for (const [j, r] of ring)
          if (r <= 2 && grid.tiles[j].kind === 'PENT')
            fail(j, `pentagon in ring ${r} of centre ${center}`);
        const castle = plan.decor.some((d) => d.model === 'castle' && d.tile === center);
        if (castle === !!grid.tiles[center].deposit)
          fail(center, `castle = ${castle}, deposit = ${!!grid.tiles[center].deposit}`);
        for (const i of plan.road) {
          if (grid.tiles[i].kind !== 'HEX' || grid.tiles[i].deposit)
            fail(i, 'road on a pentagon or a deposit');
          if (!ring.has(i) || ring.get(i)! < 1)
            fail(i, `road tile outside rings 1–3 of centre ${center}`);
        }
        for (const d of buildings)
          if (!ring.has(d.tile)) fail(d.tile, `${d.model} outside ring 3 of centre ${center}`);
      }),
    );
  });

  it('keeps the class shares in a sane band for n ≥ 5', () => {
    // measured over this matrix (n ≥ 5): mixed grass 0.35–0.47, water 0.15–0.31, forest 0.11–0.21;
    // medieval grass 0.44–0.56, water 0.05–0.19, forest 0.19–0.32. The bands only catch degenerate output.
    const bands: Readonly<
      Record<TerrainBiome, Readonly<Record<'grass' | 'water' | 'forest', [number, number]>>>
    > = {
      mixed: { grass: [0.25, 0.6], water: [0.08, 0.45], forest: [0.05, 0.35] },
      medieval: { grass: [0.3, 0.7], water: [0.02, 0.35], forest: [0.1, 0.45] },
    };
    const seen: Record<string, [number, number]> = {};
    const failures = collect(
      runs().filter((r) => r.n >= 5),
      ({ plan, biome }, fail) => {
        for (const kind of ['grass', 'water', 'forest'] as const) {
          const share = plan.kinds.filter((k) => k === kind).length / plan.kinds.length;
          const key = `${biome} ${kind}`;
          const [lo, hi] = seen[key] ?? [1, 0];
          seen[key] = [Math.min(lo, share), Math.max(hi, share)];
          const [min, max] = bands[biome][kind];
          if (share < min || share > max)
            fail(null, `${kind} share ${share.toFixed(3)} outside ${min}–${max}`);
        }
      },
    );
    console.log(
      'terrain class shares (n ≥ 5):',
      Object.entries(seen)
        .map(([k, [lo, hi]]) => `${k} ${lo.toFixed(3)}–${hi.toFixed(3)}`)
        .join(', '),
    );
    expectNone(failures);
  });

  it('classification replica matches the generator (outside the settlement, which rewrites classes)', () => {
    expectNone(
      collect(runs(), ({ gridCase, seed, biome, grid, plan }, fail) => {
        const replica = CLASSIFIED_BY_KEY.get(`${gridCase.label}/${seed}/${biome}`)!;
        const rewritten =
          plan.settlementCenter === null
            ? new Map<number, number>()
            : ringsAround(grid, plan.settlementCenter, 3);
        replica.tiles.forEach((t, i) => {
          if (!rewritten.has(i) && t.kind !== plan.kinds[i])
            fail(i, `replica ${t.kind}, generator ${plan.kinds[i]}`);
        });
      }),
    );
  });

  // A bit-exact port must classify every tile the same; the closer a value sits to its threshold, the more
  // a last-bit difference in fbm (e.g. a fused multiply-add) could flip the class.
  it(`classification noise stays > 1e-12 from every compared threshold (min ${MIN_MARGIN.toExponential(3)} at ${MIN_MARGIN_AT})`, () => {
    console.log(`terrain threshold margin: min ${MIN_MARGIN} at ${MIN_MARGIN_AT}`);
    expect(MIN_MARGIN).toBeGreaterThan(1e-12);
  });
});
