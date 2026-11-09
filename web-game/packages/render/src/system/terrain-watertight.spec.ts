import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  INITIAL_BODIES,
  PLANET_ID,
  TAU_CETI_BODIES,
  TC_B,
  TC_C,
  TC_D,
  TC_E,
  TC_F,
  buildWorldGrids,
  buildWorldTerrain,
  type BodyId,
  type CelestialBody,
  type PlanetGrid,
  type TerrainConfig,
  type TerrainPlan,
} from '@space-game/domain';
import { HexKit, type KitModel } from './hex-kit';
import { TerrainView } from './terrain-view';

/**
 * Watertightness of the hex-kit terrain (T6B): every tile stays inside its own Goldberg polygon, and
 * radial rays from outside always land on an outward-facing surface between the water level and the
 * raised transition halves, on every gridded Tau Ceti body and the PoC home planet.
 */

const PUBLIC = join(process.cwd(), 'apps', 'game', 'public');
const fromDisk = async (url: string): Promise<ArrayBuffer> => {
  const b = readFileSync(join(PUBLIC, url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

const RAYS = 20_000;
/** Barycentric slack of the ray test: neighbouring tiles meet on float32 seams. */
const BARY_EPS = 1e-6;
/** |cos(normal, ray)| below which a triangle is edge-on: kit walls warp into radial planes. */
const GRAZING = 1e-4;
/** A vertex may stick out of its tile polygon by this much (× R): float32 positions. */
const OUTSIDE_TOL = 1e-6;
/** Radial window of a hit (× scale): water surface at 0.9 (−0.1), transition halves at 1.069 (+0.069). */
const MIN_DEPTH = 0.11;
const MAX_HEIGHT = 0.08;
/** Land rims lie at 0.95 (−0.05); used only to report how far flat land tops dip. */
const LAND_DEPTH = 0.06;

const CONFIGS: ReadonlyArray<[string, TerrainConfig]> = [
  ['medieval/2', { biome: 'medieval', seed: 2 }],
  ['mixed/7', { biome: 'mixed', seed: 7 }],
];

interface Case {
  body: string;
  config: string;
  grid: PlanetGrid;
  plan: TerrainPlan;
  view: TerrainView;
}

interface Failure {
  body: string;
  config: string;
  tileIndex: number;
  kind: 'PENT' | 'HEX';
  variant: string;
  reason: string;
}

function casesOf(bodies: ReadonlyArray<CelestialBody>, ids: ReadonlyArray<BodyId>): Case[] {
  const grids = buildWorldGrids(bodies);
  const out: Case[] = [];
  for (const id of ids) {
    const grid = grids.get(id)!;
    for (const [config, cfg] of CONFIGS) {
      const plan = buildWorldTerrain(bodies, grids, new Map([[id, cfg]])).get(id)!;
      out.push({ body: String(id), config, grid, plan, view: new TerrainView(grid, plan) });
    }
  }
  return out;
}

const CASES: Case[] = [...casesOf(TAU_CETI_BODIES, [TC_B, TC_C, TC_D, TC_E, TC_F]), ...casesOf(INITIAL_BODIES, [PLANET_ID])];

const variantOf = (c: Case, i: number): string => c.plan.variants[i]?.id ?? 'plate';
const kindOf = (c: Case, i: number): 'PENT' | 'HEX' => c.grid.tiles[i]!.kind;

function fail(c: Case, i: number, reason: string): Failure {
  return { body: c.body, config: c.config, tileIndex: i, kind: kindOf(c, i), variant: variantOf(c, i), reason };
}

function report(failures: ReadonlyArray<Failure>): string {
  const groups = new Map<string, number>();
  for (const f of failures) {
    const key = `${f.kind} ${f.variant}: ${f.reason.split(' ')[0]}`;
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }
  const lines = failures.slice(0, 20).map((f) => `${f.body} ${f.config} tile ${f.tileIndex} ${f.kind} ${f.variant}: ${f.reason}`);
  const summary = [...groups].map(([k, n]) => `${k} ×${n}`);
  return `${failures.length} failures\n${summary.join('\n')}\nfirst ${lines.length}:\n${lines.join('\n')}`;
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** `n` unit directions on a Fibonacci sphere, packed xyz. */
function fibonacci(n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    out.push(r * Math.cos(i * GOLDEN), y, r * Math.sin(i * GOLDEN));
  }
  return out;
}

interface Rays {
  /** Unit directions, packed xyz: RAYS on the Fibonacci sphere, then PENT_RAYS per pentagon. */
  dirs: Float64Array;
  /** Tile whose centre direction is nearest to each direction. */
  nearest: Int32Array;
}

/**
 * The 12 pentagons are small (≈ 0.56 of a mean tile): uniform rays reach them only 14–45 times, so each
 * also gets a sunflower of directions over a cap 1.15× its corner radius (seams with its neighbours
 * included). These rays go through the same checks.
 */
const PENT_RAYS = 150;

const raysCache = new Map<PlanetGrid, Rays>();
function raysOf(c: Case): Rays {
  const cached = raysCache.get(c.grid);
  if (cached) return cached;
  const list = fibonacci(RAYS);
  for (const f of c.view.frames) {
    if (f.m !== 5) continue;
    const n = f.y;
    const cap = 1.15 * Math.max(...f.corners.map((p) => Math.acos(Math.min(1, (p.x * n.x + p.y * n.y + p.z * n.z) / Math.hypot(p.x, p.y, p.z)))));
    for (let k = 0; k < PENT_RAYS; k++) {
      const rho = cap * Math.sqrt((k + 0.5) / PENT_RAYS);
      const cx = Math.cos(k * GOLDEN) * Math.sin(rho), cz = Math.sin(k * GOLDEN) * Math.sin(rho), cy = Math.cos(rho);
      list.push(f.x.x * cx + n.x * cy + f.z.x * cz, f.x.y * cx + n.y * cy + f.z.y * cz, f.x.z * cx + n.z * cy + f.z.z * cz);
    }
  }
  const dirs = Float64Array.from(list);
  const tiles = c.grid.tiles;
  const nearest = new Int32Array(dirs.length / 3);
  for (let k = 0; k < nearest.length; k++) {
    const dx = dirs[k * 3]!, dy = dirs[k * 3 + 1]!, dz = dirs[k * 3 + 2]!;
    let best = -1;
    let bd = -Infinity;
    for (let i = 0; i < tiles.length; i++) {
      const n = tiles[i]!.normal;
      const dot = n.x * dx + n.y * dy + n.z * dz;
      if (dot > bd) {
        bd = dot;
        best = i;
      }
    }
    nearest[k] = best;
  }
  const rays = { dirs, nearest };
  raysCache.set(c.grid, rays);
  return rays;
}

interface CastResult {
  failures: Failure[];
  /** Rays whose nearest hit lies on each tile: uniform rays, and all rays. */
  uniformHits: Int32Array;
  hits: Int32Array;
  rays: number;
  triangles: number;
  /** Lowest hit, lowest hit on a land triangle (no vertex below the rim) and highest hit, (r − R) / s. */
  low: number;
  landLow: number;
  high: number;
  ms: number;
}

/**
 * Casts a ray from 2R·d towards the centre for every direction d against the tile nearest to d and its
 * neighbours (Möller–Trumbore, both sides, nearest hit) and checks the hit.
 *
 * Depth bound: kit vertices sit at R + (y − 1)·s (water at y = 0.9 → R − 0.1·s), but the kit's top faces
 * are a few large flat triangles, and a flat triangle spanning a curved tile dips below the sphere of its
 * vertices (hits reach R − 0.19·s on water at n = 5, R − 0.16·s at n = 8). So the depth check is on the hit
 * triangle: all its vertices at or above the water level (R − 0.11·s). A hole that lets a ray reach the
 * tile bottom (R − s), an inner face or a wall foot fails it; walls themselves are radial, edge-on to the
 * ray, and skipped.
 */
function cast(c: Case): CastResult {
  const t0 = performance.now();
  const { dirs, nearest } = raysOf(c);
  const { grid, view } = c;
  const R = grid.radius;
  const s = view.scale;
  const pos = view.visual.geometry.getAttribute('position').array as Float32Array;
  const T = pos.length / 9;
  const v0 = new Float64Array(T * 3);
  const e1 = new Float64Array(T * 3);
  const e2 = new Float64Array(T * 3);
  const nl = new Float64Array(T);
  for (let t = 0; t < T; t++) {
    const o = t * 9;
    const ax = pos[o]!, ay = pos[o + 1]!, az = pos[o + 2]!;
    const ux = pos[o + 3]! - ax, uy = pos[o + 4]! - ay, uz = pos[o + 5]! - az;
    const wx = pos[o + 6]! - ax, wy = pos[o + 7]! - ay, wz = pos[o + 8]! - az;
    v0.set([ax, ay, az], t * 3);
    e1.set([ux, uy, uz], t * 3);
    e2.set([wx, wy, wz], t * 3);
    nl[t] = Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
  }
  const triStart = new Int32Array(grid.tiles.length);
  const triEnd = new Int32Array(grid.tiles.length);
  const owner = new Int32Array(T);
  for (const tile of grid.tiles) {
    const { start, count } = view.rangeOf(tile.index);
    triStart[tile.index] = start / 3;
    triEnd[tile.index] = (start + count) / 3;
    owner.fill(tile.index, start / 3, (start + count) / 3);
  }

  const failures: Failure[] = [];
  const hits = new Int32Array(grid.tiles.length);
  let uniformHits = new Int32Array(0);
  const water = R - MIN_DEPTH * s;
  const rMax = R + MAX_HEIGHT * s;
  let low = Infinity;
  let landLow = Infinity;
  let high = -Infinity;
  for (let k = 0; k < nearest.length; k++) {
    if (k === RAYS) uniformHits = hits.slice();
    const dx = dirs[k * 3]!, dy = dirs[k * 3 + 1]!, dz = dirs[k * 3 + 2]!;
    const ox = 2 * R * dx, oy = 2 * R * dy, oz = 2 * R * dz;
    const Dx = -dx, Dy = -dy, Dz = -dz;
    const home = nearest[k]!;
    let best = Infinity;
    let bestTri = -1;
    let bestDet = 0;
    const tiles = [home, ...grid.tiles[home]!.neighbors];
    for (const tile of tiles) {
      for (let t = triStart[tile]!; t < triEnd[tile]!; t++) {
        const o = t * 3;
        const e2x = e2[o]!, e2y = e2[o + 1]!, e2z = e2[o + 2]!;
        const px = Dy * e2z - Dz * e2y, py = Dz * e2x - Dx * e2z, pz = Dx * e2y - Dy * e2x;
        const e1x = e1[o]!, e1y = e1[o + 1]!, e1z = e1[o + 2]!;
        // det = d · (e1 × e2): > 0 when the triangle faces the incoming ray
        const det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) <= GRAZING * nl[t]!) continue;
        const inv = 1 / det;
        const tx = ox - v0[o]!, ty = oy - v0[o + 1]!, tz = oz - v0[o + 2]!;
        const u = (tx * px + ty * py + tz * pz) * inv;
        if (u < -BARY_EPS || u > 1 + BARY_EPS) continue;
        const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
        const v = (Dx * qx + Dy * qy + Dz * qz) * inv;
        if (v < -BARY_EPS || u + v > 1 + BARY_EPS) continue;
        const dist = (e2x * qx + e2y * qy + e2z * qz) * inv;
        if (dist <= 0 || dist >= best) continue;
        best = dist;
        bestTri = t;
        bestDet = det;
      }
    }
    const at = (): string => `d=(${dx.toFixed(4)}, ${dy.toFixed(4)}, ${dz.toFixed(4)})`;
    if (bestTri < 0) {
      failures.push(fail(c, home, `miss ${at()}`));
      continue;
    }
    const tile = owner[bestTri]!;
    hits[tile]!++;
    const r = 2 * R - best;
    const h = (r - R) / s;
    low = Math.min(low, h);
    high = Math.max(high, h);
    let corner = Infinity; // lowest vertex of the hit triangle
    for (let j = 0; j < 3; j++) {
      const o = bestTri * 9 + j * 3;
      corner = Math.min(corner, Math.hypot(pos[o]!, pos[o + 1]!, pos[o + 2]!));
    }
    if (corner >= R - LAND_DEPTH * s) landLow = Math.min(landLow, h);
    const sign = (v: number): string => (v < 0 ? `R${v.toFixed(4)}·s` : `R+${v.toFixed(4)}·s`);
    if (corner < water) failures.push(fail(c, tile, `deep r=${sign(h)}, triangle vertex at ${sign((corner - R) / s)} tri ${bestTri} ${at()}`));
    else if (r > rMax) failures.push(fail(c, tile, `high r=${sign(h)} tri ${bestTri} ${at()}`));
    if (bestDet <= 0) failures.push(fail(c, tile, `inward tri ${bestTri} cos=${(bestDet / nl[bestTri]!).toFixed(4)} r=${sign(h)} ${at()}`));
  }
  return { failures, uniformHits, hits, rays: nearest.length, triangles: T, low, landLow, high, ms: performance.now() - t0 };
}

describe('hex-kit terrain is watertight (Tau Ceti b–f and the PoC home planet, medieval/2 and mixed/7)', () => {
  let results: Map<Case, CastResult> | null = null;
  const castAll = (): Map<Case, CastResult> => (results ??= new Map(CASES.map((c) => [c, cast(c)])));

  beforeAll(async () => {
    const ids = new Set<string>();
    for (const c of CASES) for (const v of c.plan.variants) if (v) ids.add(v.id);
    const kit: ReadonlyMap<string, KitModel> = await new HexKit('assets/', fromDisk).loadAll(ids);
    expect(kit.size).toBe(ids.size);
    for (const c of CASES) c.view.applyKit(kit);
  }, 60_000);
  afterAll(() => {
    for (const c of CASES) c.view.dispose();
  });

  it('keeps every vertex of a tile inside its own polygon (nothing bleeds into a neighbour)', () => {
    const failures: Failure[] = [];
    for (const c of CASES) {
      const R = c.grid.radius;
      const pos = c.view.visual.geometry.getAttribute('position').array as Float32Array;
      for (const tile of c.grid.tiles) {
        const f = c.view.frames[tile.index]!;
        const C = f.center;
        // inward unit normals of the great-circle planes through the tile's edges
        const planes = f.corners.map((a, j) => {
          const b = f.corners[(j + 1) % f.m]!;
          let nx = a.y * b.z - a.z * b.y, ny = a.z * b.x - a.x * b.z, nz = a.x * b.y - a.y * b.x;
          if (nx * C.x + ny * C.y + nz * C.z < 0) [nx, ny, nz] = [-nx, -ny, -nz];
          const l = Math.hypot(nx, ny, nz);
          return [nx / l, ny / l, nz / l] as const;
        });
        const { start, count } = c.view.rangeOf(tile.index);
        let worst = Infinity;
        let worstV = -1;
        let onOutline = 0;
        for (let v = start; v < start + count; v++) {
          const x = pos[v * 3]!, y = pos[v * 3 + 1]!, z = pos[v * 3 + 2]!;
          const k = R / Math.hypot(x, y, z);
          let m = Infinity;
          for (const [nx, ny, nz] of planes) m = Math.min(m, (nx * x + ny * y + nz * z) * k);
          if (Math.abs(m) <= 1e-5 * R) onOutline++;
          if (m < worst) {
            worst = m;
            worstV = v - start;
          }
        }
        if (worst < -OUTSIDE_TOL * R) failures.push(fail(c, tile.index, `outside by ${(-worst / R).toExponential(2)}·R at vertex ${worstV}`));
        if (onOutline < f.m) failures.push(fail(c, tile.index, `only ${onOutline} vertices on the outline`));
      }
    }
    expect(failures.length, report(failures)).toBe(0);
  });

  it(`lands ${RAYS} radial rays per body on an outward-facing surface between the water level and the raised halves`, () => {
    const res = castAll();
    const failures = [...res.values()].flatMap((r) => r.failures);
    const rows = CASES.map((c) => {
      const r = res.get(c)!;
      const span = `hits R${r.low.toFixed(3)}·s..R+${r.high.toFixed(3)}·s (land ≥ R${r.landLow.toFixed(3)}·s)`;
      return `${c.body.padEnd(7)} ${c.config.padEnd(11)} n=${c.grid.frequency} tris=${r.triangles} rays=${r.rays} ${span} fails=${r.failures.length} ${r.ms.toFixed(0)} ms`;
    });
    console.log(`terrain-watertight:\n${rows.join('\n')}`);
    expect(failures.length, report(failures)).toBe(0);
  }, 60_000);

  it('reaches every pentagon plate with at least 50 rays (and with the uniform rays alone)', () => {
    const res = castAll();
    const low: string[] = [];
    for (const c of CASES) {
      const { hits, uniformHits } = res.get(c)!;
      const pents = c.grid.tiles.filter((t) => t.kind === 'PENT');
      expect(pents).toHaveLength(12);
      for (const t of pents) {
        if (hits[t.index]! < 50 || uniformHits[t.index]! < 10) low.push(`${c.body} ${c.config} pentagon ${t.index}: ${hits[t.index]} hits, ${uniformHits[t.index]} uniform`);
      }
    }
    expect(low, low.join('\n')).toEqual([]);
  }, 60_000);
});
