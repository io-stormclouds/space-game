import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TERRAIN_RULES } from '../../economy/terrain-data';
import { bodyId } from '../../shared/ids';
import { INITIAL_BODIES, MOON_ID, PLANET_ID } from '../config/initial-world';
import { buildGoldbergGrid } from '../math/goldberg-grid';
import { footprintTiles } from '../math/footprint';
import { fbm } from '../math/seeded-noise';
import { Vec3, vec3 } from '../math/vec3';
import { CelestialBody } from '../models/celestial-body.model';
import { PlanetGrid } from '../models/planet-grid.model';
import { buildWorldGrids } from '../scenario';
import { TAU_CETI_BODIES, TC_B, TC_C, TC_D, TC_E, TC_F } from '../scenarios/tau-ceti';
import { BIOMES } from './terrain-biomes';
import { MAX_ROCKS, MAX_TREES, generateTerrain } from './terrain-generator';
import { TerrainBiome, TerrainConfig, TerrainKind, TerrainPlan } from './terrain-types';
import { TileFrame, buildTileFrames } from './tile-frame';
import { ROAD_MASKS, SHORE_MASKS } from './tile-variant';

/*
 * Property tests of the terrain generator over a matrix: Goldberg grids n = 3…8 (the real Tau Ceti and PoC
 * deposit layouts plus single-ore layouts) × noise seeds × styles (the four biomes and the config overrides
 * the bodies use: regolith ground, dried lake beds, the start planet's fewer lakes and dry landing cap) ×
 * settlement aims. Each check collects every offender as "<combination> tile <i>: <what>" and asserts the
 * list is empty, so one run shows them all. `terrain.spec.ts` keeps the detailed checks of Tau Ceti c.
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

const GAME_BODIES = [...INITIAL_BODIES, ...TAU_CETI_BODIES].filter((b) => b.surfaceGrid);

const GRID_CASES: GridCase[] = [
  // PoC home planet (n = 8) and moon (n = 3), Tau Ceti b–f (n = 5, 5, 6, 8, 6)
  ...GAME_BODIES.map(fromBody),
  // PoC medieval showcase planet (poc/space-3d-poc config: COLONY_SURFACE, phase 0.85π + 2 · 12°)
  { label: 'poc-medieval', n: 8, depositSeed: 31, phi: Math.PI * 0.85 + (24 * Math.PI) / 180 },
  // single-ore layouts
  { label: 'kri-only', n: 3, depositSeed: 5, weights: { KRI: 1 }, phi: 0.3 },
  { label: 'fer-only', n: 4, depositSeed: 7, weights: { FER: 1 }, phi: 1 },
];

const SEEDS = [1, 2, 7, 11, 23, 102];

/** A terrain config without its seed (the seed comes from `SEEDS`). */
type Style = Omit<TerrainConfig, 'seed'>;

/** The four biomes and the overrides the bodies use (T-25, T-26). */
const STYLES: ReadonlyArray<{ label: string; style: Style }> = [
  { label: 'mixed', style: { biome: 'mixed' } },
  { label: 'medieval', style: { biome: 'medieval' } },
  { label: 'winter', style: { biome: 'winter' } },
  { label: 'dry', style: { biome: 'dry' } },
  { label: 'dry/regolith', style: { biome: 'dry', ground: 'regolith' } },
  { label: 'medieval/dune', style: { biome: 'medieval', basin: 'dune' } },
  { label: 'mixed/start', style: { biome: 'mixed', basinLevel: 0.39, landingCap: 0.6 } },
];

interface Combo {
  tag: string;
  gridCase: GridCase;
  n: number;
  seed: number;
  label: string;
  style: Style;
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

/** Grid × seed × style: the matrix, plus every game body with its own config (label `body`). */
interface Case {
  g: (typeof GRIDS)[number];
  seed: number;
  label: string;
  style: Style;
}
const CASES: Case[] = [
  ...GRIDS.flatMap((g) => SEEDS.flatMap((seed) => STYLES.map(({ label, style }) => ({ g, seed, label, style })))),
  ...GAME_BODIES.map((b) => {
    const { seed, ...style } = b.surfaceGrid!.terrain!;
    return { g: GRIDS.find((x) => x.gridCase.label === b.id)!, seed, label: 'body', style };
  }),
];

const COMBOS: Combo[] = CASES.flatMap(({ g: { gridCase, grid, frames }, seed, label, style }) =>
  [undefined, vec3(-Math.cos(gridCase.phi), 0.9, -Math.sin(gridCase.phi))].map((aim) => ({
    tag: `n=${gridCase.n} grid=${gridCase.label} seed=${seed} style=${label} aim=${aim ? 'phi' : 'default'}`,
    gridCase,
    n: gridCase.n,
    seed,
    label,
    style,
    biome: style.biome,
    aim,
    grid,
    frames,
  })),
);

const optsOf = (c: Combo) => ({ ...c.style, seed: c.seed, aim: c.aim });

/** Plans of every combination, generated once (in `beforeAll`, so a throw fails the suite, not the collection). */
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

/** Classes drawn as a lowered basin (`hex_water`): lakes, frozen lakes, dune hollows and dried lake beds. */
const BASINS = new Set<TerrainKind>(['water', 'ice', 'dune']);
const isBasin = (k: TerrainKind | undefined): boolean => k !== undefined && BASINS.has(k);
const buildable = (k: TerrainKind): boolean => TERRAIN_RULES.kinds[k].buildable;

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

/** Tile with the largest `normal.y` (first one on a tie): the top tile. */
const topIndex = (grid: PlanetGrid): number =>
  grid.tiles.reduce((best, t) => (t.normal.y > grid.tiles[best].normal.y ? t.index : best), 0);

const firstDiff = (a: ReadonlyArray<unknown>, b: ReadonlyArray<unknown>): number => {
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    if (JSON.stringify(a[i]) !== JSON.stringify(b[i])) return i;
  return -1;
};

// ------------------------------------------------------------- classification replica (for the Rust port)

/** Gameplay table of the biomes, written out here (the Rust port mirrors it); `null` = rule off. */
interface ReplicaRules {
  ground: TerrainKind;
  basin: TerrainKind;
  basinLevel: number;
  polar: number | null;
  rock: number | null;
  forest: number | null;
  forestLat: number | null;
  settlement: boolean;
}

const REPLICA: Readonly<Record<TerrainBiome, ReplicaRules>> = {
  mixed: { ground: 'grass', basin: 'water', basinLevel: 0.42, polar: 0.84, rock: 0.64, forest: 0.57, forestLat: null, settlement: false },
  medieval: { ground: 'grass', basin: 'water', basinLevel: 0.36, polar: 0.88, rock: 0.67, forest: 0.55, forestLat: null, settlement: true },
  winter: { ground: 'snow', basin: 'ice', basinLevel: 0.44, polar: null, rock: 0.66, forest: 0.6, forestLat: 0.7, settlement: false },
  dry: { ground: 'sand', basin: 'dune', basinLevel: 0.33, polar: null, rock: 0.62, forest: null, forestLat: null, settlement: false },
};

const rulesOf = (s: Style): ReplicaRules => {
  const b = REPLICA[s.biome];
  return { ...b, ground: s.ground ?? b.ground, basin: s.basin ?? b.basin, basinLevel: s.basinLevel ?? b.basinLevel };
};

/** Smallest distance seen per compared threshold (`f1/basin`, `lat/polar`, …), for the margin report. */
const MARGIN_BY: Record<string, number> = {};

/**
 * The class chain of `classifyTerrain` replicated term for term, plus the distance of each compared value
 * to its threshold (only the comparisons the chain actually makes).
 */
function classify(normal: Vec3, seed: number, T: ReplicaRules): { kind: TerrainKind; margin: number; at: string } {
  const p = (k: number): Vec3 => vec3(normal.x * k + 7, normal.y * k + 7, normal.z * k + 7);
  const f1 = fbm(seed, p(2.6));
  const f2 = fbm(seed + 11, p(3.4));
  const f3 = fbm(seed + 23, p(4.2));
  const lat = Math.abs(normal.y);
  let margin = Math.abs(f1 - T.basinLevel);
  let at = 'f1/basin';
  MARGIN_BY[at] = Math.min(MARGIN_BY[at] ?? Infinity, margin);
  const note = (d: number, what: string): void => {
    MARGIN_BY[what] = Math.min(MARGIN_BY[what] ?? Infinity, Math.abs(d));
    if (Math.abs(d) < margin) {
      margin = Math.abs(d);
      at = what;
    }
  };
  if (f1 < T.basinLevel) return { kind: T.basin, margin, at };
  if (T.polar !== null) {
    note(lat - T.polar, 'lat/polar');
    if (lat > T.polar) return { kind: 'snow', margin, at };
  }
  if (T.rock !== null) {
    note(f2 - T.rock, 'f2/rock');
    if (f2 > T.rock) return { kind: 'rock', margin, at };
  }
  if (T.forest !== null) {
    note(f3 - T.forest, 'f3/forest');
    if (f3 > T.forest) {
      if (T.forestLat === null) return { kind: 'forest', margin, at };
      note(lat - T.forestLat, 'lat/forestLat');
      if (lat < T.forestLat) return { kind: 'forest', margin, at };
    }
  }
  return { kind: T.ground, margin, at };
}

/** Classes before the settlement, per grid × seed × style (the aim does not enter the classification). */
const CLASSIFIED = CASES.map(({ g: { gridCase, grid }, seed, label, style }) => {
  const T = rulesOf(style);
  const cap = style.landingCap;
  return {
    key: `${gridCase.label}/${seed}/${label}`,
    tag: `n=${gridCase.n} grid=${gridCase.label} seed=${seed} style=${label}`,
    tiles: grid.tiles.map((t) => {
      const c = classify(t.normal, seed, T);
      // no basin on a pentagon or a deposit (a fix-up, no threshold involved)
      const fixed = c.kind === T.basin && (t.kind === 'PENT' || t.deposit !== null) ? { ...c, kind: T.ground } : c;
      if (cap === undefined) return fixed;
      // the landing zone compares normal.y with a threshold on every tile: it counts for the margin
      const d = Math.abs(t.normal.y - cap);
      MARGIN_BY['n.y/landingCap'] = Math.min(MARGIN_BY['n.y/landingCap'] ?? Infinity, d);
      const margin = d < fixed.margin ? { margin: d, at: 'n.y/landingCap' } : {};
      return { ...fixed, ...margin, kind: t.normal.y > cap ? T.ground : fixed.kind };
    }),
  };
});
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
  beforeAll(() => {
    runs();
  }, 120_000);

  it('covers every grid size, seed and style in at least 60 combinations', () => {
    expect(COMBOS.length).toBeGreaterThanOrEqual(60);
    expect(new Set(COMBOS.map((c) => c.n))).toEqual(new Set([3, 4, 5, 6, 8]));
    expect(new Set(COMBOS.map((c) => c.biome))).toEqual(new Set(['mixed', 'medieval', 'winter', 'dry']));
    // every game body with its own config (seed and overrides), both aims
    expect(COMBOS.filter((c) => c.label === 'body').map((c) => c.gridCase.label)).toEqual(GAME_BODIES.flatMap((b) => [b.id, b.id]));
    expect(KIT_FILES.has('hex_forest')).toBe(true);
  });

  it('the replica table is the biome table of the generator', () => {
    for (const biome of Object.keys(REPLICA) as TerrainBiome[]) {
      const { dress: _, ...rules } = BIOMES[biome];
      expect(rules, biome).toEqual(REPLICA[biome]);
    }
    expect(Object.keys(BIOMES).sort()).toEqual(Object.keys(REPLICA).sort());
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

  it('ignores the aim on bodies without a settlement (it only places the settlement)', () => {
    const byKey = new Map<string, TerrainPlan>();
    expectNone(
      collect(
        runs().filter((r) => !REPLICA[r.biome].settlement),
        (r, fail) => {
          const key = `${r.gridCase.label}/${r.seed}/${r.label}`;
          const other = byKey.get(key);
          if (!other) return void byKey.set(key, r.plan);
          const i = firstDiff(
            [...r.plan.kinds, ...r.plan.variants, ...r.plan.decor],
            [...other.kinds, ...other.variants, ...other.decor],
          );
          if (i >= 0) fail(null, `plan depends on the aim (item ${i})`);
        },
      ),
    );
  });

  it('uses only the classes of its biome; the plan names the basin and the ground of the config', () => {
    const allowed: Readonly<Record<TerrainBiome, ReadonlyArray<TerrainKind>>> = {
      mixed: ['grass', 'forest', 'rock', 'snow', 'water'],
      medieval: ['grass', 'forest', 'rock', 'snow', 'water'],
      winter: ['snow', 'forest', 'rock', 'ice'],
      dry: ['sand', 'rock', 'dune'],
    };
    expectNone(
      collect(runs(), ({ plan, style, biome, grid }, fail) => {
        const T = rulesOf(style);
        if (plan.basin !== T.basin) fail(null, `plan basin ${plan.basin}, config ${T.basin}`);
        if (plan.ground !== T.ground) fail(null, `plan ground ${plan.ground}, config ${T.ground}`);
        // the ground and the basin of the config replace the biome's
        const ok = new Set(allowed[biome].map((k) => (k === REPLICA[biome].ground ? T.ground : k === REPLICA[biome].basin ? T.basin : k)));
        plan.kinds.forEach((k, i) => {
          if (!ok.has(k)) fail(i, `${k} on a ${biome} body`);
          // winter forest only at |lat| < 0.7
          if (biome === 'winter' && k === 'forest' && Math.abs(grid.tiles[i].normal.y) >= 0.7)
            fail(i, `forest at |lat| ${Math.abs(grid.tiles[i].normal.y).toFixed(3)}`);
        });
      }),
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

  it('keeps deposits free of basins, unbuildable classes, roads, decor and raised transitions; pentagons free of basins, unbuildable classes, roads and buildings', () => {
    expectNone(
      collect(runs(), ({ grid, plan }, fail) => {
        const decorOn = new Map<number, string[]>();
        for (const d of plan.decor) decorOn.set(d.tile, [...(decorOn.get(d.tile) ?? []), d.model]);
        grid.tiles.forEach((t, i) => {
          const k = plan.kinds[i];
          if (t.deposit) {
            if (isBasin(k)) fail(i, `${k} on a deposit`);
            if (!buildable(k)) fail(i, `unbuildable ${k} on a deposit`);
            if (plan.road.has(i)) fail(i, 'road on a deposit');
            if (decorOn.has(i)) fail(i, `decor ${decorOn.get(i)} on a deposit`);
            if (plan.variants[i]?.id.startsWith('hex_forest_transition') || plan.variants[i]?.id === 'hex_forest_waterD')
              fail(i, `${plan.variants[i]!.id} on a deposit`);
          }
          if (t.kind === 'PENT') {
            if (isBasin(k)) fail(i, `${k} on a pentagon`);
            if (!buildable(k)) fail(i, `unbuildable ${k} on a pentagon`);
            if (plan.road.has(i)) fail(i, 'road on a pentagon');
            const buildings = (decorOn.get(i) ?? []).filter(isBuilding);
            if (buildings.length) fail(i, `building ${buildings} on a pentagon`);
          }
        });
      }),
    );
  });

  it('makes the landing zone plain ground: every tile with normal.y > landingCap, the top tile inside', () => {
    expectNone(
      collect(
        runs().filter((r) => r.style.landingCap !== undefined),
        ({ grid, plan, style }, fail) => {
          const cap = style.landingCap!;
          if (!(grid.tiles[topIndex(grid)].normal.y > cap)) fail(topIndex(grid), 'top tile outside the cap');
          grid.tiles.forEach((t, i) => {
            if (t.normal.y > cap && plan.kinds[i] !== rulesOf(style).ground) fail(i, `${plan.kinds[i]} in the landing zone`);
          });
        },
      ),
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
          if (plan.kinds[i] !== plan.ground) fail(i, `road tile is ${plan.kinds[i]}, ground ${plan.ground}`);
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
   * Shore rule of `chooseVariant`: exact match. Every basin class (water, ice, dune) is a lowered hex_water
   * tile, and a land tile (not road) with 1 basin side or 2 adjacent basin sides gets waterB/C or waterA
   * turned so the mask's water sides are exactly the basin edges; anything else gets no shore tile. The
   * pond waterD needs the biome's pond class (grass in mixed and medieval, none in winter and dry) and no
   * basin neighbour.
   */
  it('shore tiles match the basin edges exactly, ponds sit away from basins, hex_water only on basins', () => {
    expectNone(
      collect(runs(), ({ grid, plan, frames, biome }, fail) => {
        const pond = BIOMES[biome].dress.pond;
        grid.tiles.forEach((t, i) => {
          const v = plan.variants[i];
          if (!v) return;
          if ((v.id === 'hex_water') !== isBasin(plan.kinds[i]))
            fail(i, `${v.id} on ${plan.kinds[i]}`);
          const water = frames[i].edgeNb.map((nb) => isBasin(plan.kinds[nb]));
          const nWater = water.filter(Boolean).length;
          const shore = /^hex_forest_water([ABC])$/.exec(v.id)?.[1];
          if (shore !== undefined) {
            const mask = SHORE_MASKS[shore]!;
            if (isBasin(plan.kinds[i]) || plan.road.has(i))
              fail(i, `${v.id} on ${plan.kinds[i]} road=${plan.road.has(i)}`);
            if (mismatches(mask, v.k0, water) !== 0)
              fail(
                i,
                `${v.id}/${v.k0} water sides [${[...maskEdges(mask, v.k0)]}] ≠ basin edges [${water.flatMap((w, e) => (w ? [e] : []))}]`,
              );
          }
          if (v.id === 'hex_forest_waterD') {
            if (pond === null || plan.kinds[i] !== pond) fail(i, `pond on ${plan.kinds[i]} in ${biome}`);
            if (t.neighbors.some((nb) => isBasin(plan.kinds[nb]))) fail(i, 'pond next to a basin');
          }
          // coverage: a shore the masks can express is never missed
          if (!isBasin(plan.kinds[i]) && !plan.road.has(i)) {
            const adjacentPair = nWater === 2 && water.some((w, e) => w && water[(e + 1) % 6]);
            if (nWater === 1 && v.id !== 'hex_forest_waterB' && v.id !== 'hex_forest_waterC')
              fail(i, `one basin side but ${v.id}`);
            if (adjacentPair && v.id !== 'hex_forest_waterA')
              fail(i, `two adjacent basin sides but ${v.id}`);
          }
        });
      }),
    );
  });

  it('uses both one-side shore tiles (waterB and waterC) about equally, in every biome', () => {
    for (const biome of ['mixed', 'medieval', 'winter', 'dry'] as const) {
      let b = 0;
      let c = 0;
      for (const { plan } of runs().filter((r) => r.biome === biome)) for (const v of plan.variants) {
        if (v?.id === 'hex_forest_waterB') b++;
        if (v?.id === 'hex_forest_waterC') c++;
      }
      expect(b, biome).toBeGreaterThan(100);
      expect(c / (b + c), biome).toBeGreaterThan(0.35);
      expect(c / (b + c), biome).toBeLessThan(0.65);
    }
  });

  /*
   * Transition rule of `chooseVariant`: only on the biome's `transitionOn` classes (grass and forest in
   * mixed and medieval; forest and the snow ground in winter; none in dry); B when a neighbour is snow (and a hash
   * passes), else A when a neighbour is rock, never towards its own class. The raised half (kit side 0,
   * tile edge (k0 + 5) mod 6) faces the FIRST edge with that neighbour (findIndex). Never on a deposit (the
   * generator falls back to hex_forest).
   */
  it('raised transitions face the first rock (A) or snow (B) neighbour of a tile the biome raises', () => {
    const target: Readonly<Record<string, TerrainKind>> = {
      hex_forest_transitionA: 'rock',
      hex_forest_transitionB: 'snow',
    };
    const raises: Readonly<Record<TerrainBiome, ReadonlyArray<TerrainKind>>> = {
      mixed: ['grass', 'forest'],
      medieval: ['grass', 'forest'],
      winter: ['forest', 'snow'],
      dry: [],
    };
    const seen: Record<string, number> = {};
    expectNone(
      collect(runs(), ({ grid, plan, frames, biome }, fail) => {
        expect(BIOMES[biome].dress.transitionOn).toEqual(raises[biome]);
        plan.variants.forEach((v, i) => {
          const want = v ? target[v.id] : undefined;
          if (!v || want === undefined) return;
          seen[`${biome} ${plan.kinds[i]} ${v.id}`] = (seen[`${biome} ${plan.kinds[i]} ${v.id}`] ?? 0) + 1;
          if (!raises[biome].includes(plan.kinds[i])) fail(i, `${v.id} on ${plan.kinds[i]} in ${biome}`);
          if (plan.kinds[i] === want) fail(i, `${v.id} towards its own class`);
          if (grid.tiles[i].deposit) fail(i, `${v.id} on a deposit`);
          const raised = (v.k0 + 5) % 6;
          const first = frames[i].edgeNb.findIndex((nb) => plan.kinds[nb] === want);
          if (first < 0) fail(i, `${v.id} without a ${want} neighbour`);
          else if (raised !== first)
            fail(i, `${v.id}/${v.k0} raised edge ${raised}, first ${want} edge ${first}`);
        });
      }),
    );
    // winter raises its forest (B) and its snow ground (A); dry is flat
    expect(seen['winter forest hex_forest_transitionB']).toBeGreaterThan(0);
    expect(seen['winter snow hex_forest_transitionA']).toBeGreaterThan(0);
    expect(Object.keys(seen).filter((k) => k.startsWith('dry '))).toEqual([]);
  });

  /*
   * Decor: trees on forest (temperate and winter), and in dry a few small trees as bushes (`sm` < 1) on the
   * ground; mountains and rock piles on rock; small rocks also on the ground in winter and dry. Only models
   * of the hex kit, within the budget.
   */
  it('places decor on existing tiles within budget: trees and rocks where the biome puts them, one building per tile', () => {
    const counts: Record<string, number> = {};
    expectNone(
      collect(runs(), ({ grid, plan, biome }, fail) => {
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
          const k = plan.kinds[i];
          if (!KIT_FILES.has(d.model)) fail(i, `unknown model ${d.model}`);
          if (TREES.has(d.model)) {
            trees++;
            const bush = biome === 'dry' && k === plan.ground && d.sm !== undefined && d.sm < 1;
            if (bush) counts[`${biome} bush`] = (counts[`${biome} bush`] ?? 0) + 1;
            if (!(k === 'forest' && biome !== 'dry') && !bush) fail(i, `${d.model} on ${k} in ${biome} (sm ${d.sm})`);
          } else if (ROCKS.has(d.model)) {
            rocks++;
            const onGround = d.model === 'detail_rocks_small' && k === plan.ground && (biome === 'winter' || biome === 'dry');
            if (onGround) counts[`${biome} ground rocks`] = (counts[`${biome} ground rocks`] ?? 0) + 1;
            if (k !== 'rock' && !onGround) fail(i, `${d.model} on ${k} in ${biome}`);
          } else if (grid.tiles[i].kind !== 'HEX' || grid.tiles[i].deposit) {
            fail(i, `${d.model} on ${grid.tiles[i].kind} deposit=${!!grid.tiles[i].deposit}`);
          }
          if ((TREES.has(d.model) || ROCKS.has(d.model)) && (plan.road.has(i) || buildingOn.has(i)))
            fail(i, `${d.model} on a road or under ${buildingOn.get(i)}`);
          if ((TREES.has(d.model) || ROCKS.has(d.model)) && grid.tiles[i].deposit) fail(i, `${d.model} on a deposit`);
        }
        if (trees > MAX_TREES) fail(null, `${trees} trees > ${MAX_TREES}`);
        if (rocks > MAX_ROCKS) fail(null, `${rocks} rocks and mountains > ${MAX_ROCKS}`);
      }),
    );
    expect(counts['dry bush']).toBeGreaterThan(0);
    expect(counts['dry ground rocks']).toBeGreaterThan(0);
    expect(counts['winter ground rocks']).toBeGreaterThan(0);
  });

  /*
   * GP(n,0) puts the 12 pentagons n steps apart, so with n ≤ 4 no hexagon is 3 steps from every pentagon
   * and there is no valid centre; from n = 5 on there always is one.
   */
  it('medieval: plans a settlement far from pentagons when the grid allows one, none otherwise or in other biomes', () => {
    for (const c of COMBOS.filter((x) => REPLICA[x.biome].settlement && x.n <= 4)) {
      expect(() => generateTerrain(c.grid, optsOf(c)), c.tag).not.toThrow();
    }
    expectNone(
      collect(runs(), ({ grid, plan, n, biome }, fail) => {
        const center = plan.settlementCenter;
        const buildings = plan.decor.filter((d) => isBuilding(d.model));
        const settles = REPLICA[biome].settlement;
        if (!settles || center === null) {
          if (settles && n >= 5) fail(null, 'no settlement centre');
          if (center !== null) fail(center, `${biome} body has a settlement centre`);
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
        // the cleared ground: no basin within two rings of the castle
        for (const [j, r] of ring) if (r <= 2 && isBasin(plan.kinds[j])) fail(j, `${plan.kinds[j]} in ring ${r} of the settlement`);
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

  it('dried lake beds change the basin class only: medieval/dune is medieval with every lake a dune', () => {
    const plain = new Map(runs().filter((r) => r.label === 'medieval').map((r) => [`${r.gridCase.label}/${r.seed}/${r.aim ? 'phi' : 'default'}`, r.plan]));
    expectNone(
      collect(
        runs().filter((r) => r.label === 'medieval/dune'),
        (r, fail) => {
          const m = plain.get(`${r.gridCase.label}/${r.seed}/${r.aim ? 'phi' : 'default'}`)!;
          const i = firstDiff(r.plan.kinds, m.kinds.map((k) => (k === 'water' ? 'dune' : k)));
          if (i >= 0) fail(i, `${r.plan.kinds[i]} vs medieval ${m.kinds[i]}`);
          const j = firstDiff([...r.plan.variants, ...r.plan.decor, ...r.plan.road], [...m.variants, ...m.decor, ...m.road]);
          if (j >= 0) fail(null, `kit tiles, decor or roads differ (item ${j})`);
          if (r.plan.settlementCenter !== m.settlementCenter) fail(r.plan.settlementCenter, 'centre moved');
        },
      ),
    );
  });

  it('keeps the class shares of every style in its band for n ≥ 5', () => {
    // measured over this matrix (n ≥ 5): mixed grass 0.35–0.47, water 0.15–0.31, forest 0.11–0.21; medieval
    // grass 0.45–0.56, water 0.05–0.19, forest 0.19–0.31; winter snow 0.48–0.65, ice 0.19–0.36, forest
    // 0.06–0.12, rock 0.02–0.11; dry ground 0.69–0.86, rock 0.12–0.21, dune 0.02–0.15; mixed/start water
    // 0.06–0.19. The bands only catch degenerate output (and the start planet's water ceiling, T-25).
    type Bands = Partial<Record<TerrainKind, [number, number]>>;
    const bands: Readonly<Record<string, Bands>> = {
      mixed: { grass: [0.25, 0.6], water: [0.08, 0.45], forest: [0.05, 0.35], rock: [0.01, 0.2], snow: [0.05, 0.25] },
      medieval: { grass: [0.3, 0.7], water: [0.02, 0.35], forest: [0.1, 0.45], rock: [0.005, 0.2], snow: [0.03, 0.2] },
      winter: { snow: [0.4, 0.75], ice: [0.12, 0.45], forest: [0.02, 0.2], rock: [0.01, 0.2] },
      dry: { sand: [0.6, 0.92], rock: [0.07, 0.3], dune: [0.01, 0.2] },
      'dry/regolith': { regolith: [0.6, 0.92], rock: [0.07, 0.3], dune: [0.01, 0.2] },
      'medieval/dune': { grass: [0.3, 0.7], dune: [0.02, 0.35], forest: [0.1, 0.45], water: [0, 0] },
      'mixed/start': { grass: [0.3, 0.65], water: [0.03, 0.2], forest: [0.05, 0.35] },
    };
    const seen: Record<string, [number, number]> = {};
    const failures = collect(
      runs().filter((r) => r.n >= 5 && r.label !== 'body'), // the bodies: `terrain of the game bodies`
      ({ plan, label }, fail) => {
        for (const [kind, [min, max]] of Object.entries(bands[label]!) as Array<[TerrainKind, [number, number]]>) {
          const share = plan.kinds.filter((k) => k === kind).length / plan.kinds.length;
          const key = `${label} ${kind}`;
          const [lo, hi] = seen[key] ?? [1, 0];
          seen[key] = [Math.min(lo, share), Math.max(hi, share)];
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
    expect(Object.keys(bands).sort()).toEqual(STYLES.map((s) => s.label).sort());
    expectNone(failures);
  });

  it('classification replica matches the generator (outside the settlement, which rewrites classes)', () => {
    expectNone(
      collect(runs(), ({ gridCase, seed, label, grid, plan }, fail) => {
        const replica = CLASSIFIED_BY_KEY.get(`${gridCase.label}/${seed}/${label}`)!;
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
    console.log(`terrain threshold margin: min ${MIN_MARGIN} at ${MIN_MARGIN_AT}; per threshold ${JSON.stringify(MARGIN_BY)}`);
    expect(MIN_MARGIN).toBeGreaterThan(1e-12);
    // every threshold of every style was compared somewhere in the matrix
    expect(Object.keys(MARGIN_BY).sort()).toEqual(['f1/basin', 'f2/rock', 'f3/forest', 'lat/forestLat', 'lat/polar', 'n.y/landingCap']);
  });
});

// ------------------------------------------------------------------------------- the bodies of the game

describe('terrain of the game bodies (T-25, T-26)', () => {
  const grids = buildWorldGrids([...INITIAL_BODIES, ...TAU_CETI_BODIES]);
  const share = (grid: PlanetGrid, kind: TerrainKind) => grid.tiles.filter((t) => t.terrain === kind).length / grid.tiles.length;

  it('gives every body with a grid its biome', () => {
    const biomes = Object.fromEntries([...grids].map(([id, g]) => [id, g.terrain && { biome: g.terrain.biome, ground: g.terrain.ground, basin: g.terrain.basin }]));
    expect(biomes).toEqual({
      [PLANET_ID]: { biome: 'mixed', ground: undefined, basin: undefined },
      [MOON_ID]: { biome: 'dry', ground: 'regolith', basin: undefined },
      [TC_B]: { biome: 'dry', ground: undefined, basin: undefined },
      [TC_C]: { biome: 'medieval', ground: undefined, basin: 'dune' },
      [TC_D]: { biome: 'dry', ground: 'regolith', basin: undefined },
      [TC_E]: { biome: 'mixed', ground: undefined, basin: undefined },
      [TC_F]: { biome: 'winter', ground: undefined, basin: undefined },
    });
  });

  it('no water where the profile says there is none: b, c and d have dunes, f frozen lakes', () => {
    for (const id of [TC_B, TC_C, TC_D, TC_F, MOON_ID]) expect(share(grids.get(id)!, 'water'), id).toBe(0);
    expect(share(grids.get(TC_B)!, 'sand')).toBeGreaterThan(0.5);
    expect(share(grids.get(TC_D)!, 'regolith')).toBeGreaterThan(0.5);
    expect(share(grids.get(TC_C)!, 'dune')).toBeGreaterThan(0.05);
    expect(share(grids.get(TC_F)!, 'ice')).toBeGreaterThan(0.1);
    expect(share(grids.get(TC_F)!, 'snow')).toBeGreaterThan(0.4);
  });

  it('Tau Ceti e, the start planet: water ≤ 20 % and a dry cap n.y > 0.6 (holding the top tile and 5 rings around it)', () => {
    const grid = grids.get(TC_E)!;
    expect(grid.terrain).toMatchObject({ biome: 'mixed', basinLevel: 0.39, landingCap: 0.6 });
    expect(share(grid, 'water')).toBeGreaterThan(0.05);
    expect(share(grid, 'water')).toBeLessThanOrEqual(0.2);
    const cap = grid.tiles.filter((t) => t.normal.y > 0.6).map((t) => t.index);
    expect(cap.length).toBeGreaterThan(100);
    expect(cap.filter((i) => !buildable(grid.tiles[i].terrain!))).toEqual([]);
    // the cap holds the top tile and the rings around it the first buildings go to
    const rings = ringsAround(grid, topIndex(grid), 5);
    expect([...rings.keys()].filter((i) => !cap.includes(i))).toEqual([]);
  });

  it('Tau Ceti e: 2 dry rings around the port of the scripted first session and of the automatic placement', () => {
    const grid = grids.get(TC_E)!;
    const ok = (i: number) => buildable(grid.tiles[i].terrain!);
    // the scripted first session (simulation.spec, record-replays kanwa, the render harness): the first
    // hexagon clear of deposits around it whose footprint can be built on
    const scripted = grid.tiles.find(
      (t) =>
        t.neighbors.length === 6 &&
        [t.index, ...t.neighbors].every((i) => !grid.tiles[i].deposit) &&
        (footprintTiles(grid, t.index, 3, 0) ?? [-1]).every((i) => i >= 0 && ok(i)),
    )!;
    // the automatic placement (mock `suggestTile('PORT')`): breadth-first from the top tile, rotations in order
    let automatic: number | null = null;
    const queue = [topIndex(grid)];
    const seen = new Set(queue);
    for (let q = 0; q < queue.length && automatic === null; q++) {
      const t = grid.tiles[queue[q]];
      for (let r = 0; r < t.neighbors.length && automatic === null; r++)
        if ((footprintTiles(grid, t.index, 3, r) ?? [-1]).every((i) => i >= 0 && ok(i))) automatic = t.index;
      for (const nb of t.neighbors) {
        if (seen.has(nb)) continue;
        seen.add(nb);
        queue.push(nb);
      }
    }
    for (const anchor of [scripted.index, automatic!]) {
      const near = ringsAround(grid, anchor, 2);
      expect([...near.keys()].filter((i) => !ok(i)), `port at ${anchor}`).toEqual([]);
    }
  });
});
