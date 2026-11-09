import { Vec3, normalize, vec3 } from '../math/vec3';
import { fbm, hash3 } from '../math/seeded-noise';
import { PlanetGrid } from '../models/planet-grid.model';
import { DecorItem, TerrainBiome, TerrainKind, TerrainPlan, TileVariant } from './terrain-types';
import { buildTileFrames } from './tile-frame';
import { chooseVariant } from './tile-variant';

/** Decor budget per body (≈ 287–579 triangles per tree, 552–1102 per rock). See docs/planet-terrain-design.md §4.8. */
export const MAX_TREES = 200;
export const MAX_ROCKS = 60;

export interface TerrainOptions {
  biome: TerrainBiome;
  seed: number;
  /** Direction (body frame) the settlement faces; usually towards the sun at t = 0. */
  aim?: Vec3;
}

const DEFAULT_AIM = normalize(vec3(), vec3(0.35, 0.45, 0.82));

/**
 * Terrain classes, kit tile per hexagon, ruined settlement and decor of a body. Pure and deterministic:
 * the same grid and seed give the same plan, so a Rust port can reproduce it.
 *
 * Rules that keep the plan compatible with the game: no water on a deposit tile or a pentagon (the 12
 * pentagons keep a plain plate and no kit tile), no building or road on a deposit tile, no raised
 * transition under a deposit.
 */
export function generateTerrain(grid: PlanetGrid, opts: TerrainOptions): TerrainPlan {
  const { seed, biome } = opts;
  const tiles = grid.tiles;
  const frames = buildTileFrames(grid);
  const hasDeposit = (i: number): boolean => tiles[i].deposit !== null;

  // classes: three smooth noise fields on the tile normal plus latitude
  const settle = biome === 'medieval';
  const kinds: TerrainKind[] = tiles.map((t) => {
    const n = t.normal;
    const p = (k: number): Vec3 => vec3(n.x * k + 7, n.y * k + 7, n.z * k + 7);
    const f1 = fbm(seed, p(2.6));
    const f2 = fbm(seed + 11, p(3.4));
    const f3 = fbm(seed + 23, p(4.2));
    const lat = Math.abs(n.y);
    if (f1 < (settle ? 0.36 : 0.42)) return 'water';
    if (lat > (settle ? 0.88 : 0.84)) return 'snow';
    if (f2 > (settle ? 0.67 : 0.64)) return 'rock';
    if (f3 > (settle ? 0.55 : 0.57)) return 'forest';
    return 'grass';
  });
  tiles.forEach((t, i) => {
    if (kinds[i] === 'water' && (t.kind === 'PENT' || hasDeposit(i))) kinds[i] = 'grass';
  });

  const road = new Set<number>();
  const decor: DecorItem[] = [];
  let center: number | null = null;
  if (settle) center = planSettlement(grid, kinds, road, decor, seed, opts.aim ?? DEFAULT_AIM);

  // trees, rocks, mountains
  const taken = new Set(decor.map((d) => d.tile));
  const scatter: DecorItem[] = [];
  tiles.forEach((_, i) => {
    if (road.has(i) || hasDeposit(i) || taken.has(i)) return;
    const h = hash3(seed, i, 5, 0);
    if (kinds[i] === 'forest') {
      scatter.push({ model: 'detail_treeA', tile: i, fill: 0.3, ox: -0.2, oz: 0.1 });
      scatter.push({ model: 'detail_treeC', tile: i, fill: 0.3, ox: 0.15, oz: -0.18 });
      if (h > 0.6) scatter.push({ model: 'detail_treeB', tile: i, fill: 0.28, ox: 0.18, oz: 0.2 });
    } else if (kinds[i] === 'rock') {
      if (h > 0.62) scatter.push({ model: 'mountain', tile: i, fill: 0.8, yaw: h * Math.PI * 2 });
      else scatter.push({ model: h > 0.3 ? 'detail_rocks' : 'detail_rocks_small', tile: i, fill: h > 0.3 ? 0.75 : 0.35, yaw: h * Math.PI * 2 });
    }
  });
  const isTree = (d: DecorItem): boolean => d.model.startsWith('detail_tree');
  const treeKeep = Math.min(1, MAX_TREES / Math.max(1, scatter.filter(isTree).length));
  const rockKeep = Math.min(1, MAX_ROCKS / Math.max(1, scatter.filter((d) => !isTree(d)).length));
  scatter.forEach((d, n) => {
    if (hash3(seed, d.tile, 17, n) < (isTree(d) ? treeKeep : rockKeep)) decor.push(d);
  });

  // kit tile per hexagon
  const variants: (TileVariant | null)[] = tiles.map((t, i) => {
    if (t.kind !== 'HEX') return null;
    const v = chooseVariant(i, frames[i], kinds, road, seed);
    // a raised half would bury a structure standing on a deposit
    if (hasDeposit(i) && v.id.startsWith('hex_forest_transition')) return { id: 'hex_forest', k0: 0 };
    return v;
  });

  return { bodyId: grid.bodyId, biome, seed, kinds, variants, road, decor, settlementCenter: center };
}

/** Castle, roads, houses, fields and workshops around the best tile facing `aim`. Returns the centre tile. */
function planSettlement(grid: PlanetGrid, kinds: TerrainKind[], road: Set<number>, decor: DecorItem[], seed: number, aim: Vec3): number | null {
  const tiles = grid.tiles;
  const ringsOf = (c: number): { r1: number[]; r2: number[]; r3: number[] } => {
    const seen = new Set<number>([c]);
    const rings: number[][] = [[c]];
    for (let r = 1; r <= 3; r++) {
      const next: number[] = [];
      for (const t of rings[r - 1]) {
        for (const nb of tiles[t].neighbors) {
          if (!seen.has(nb)) {
            seen.add(nb);
            next.push(nb);
          }
        }
      }
      rings.push(next);
    }
    return { r1: rings[1], r2: rings[2], r3: rings[3] };
  };

  // centre: faces `aim`, no pentagon within two rings (the outer ring skips pentagons), few deposits nearby (they cannot hold buildings)
  let center = -1;
  let best = -Infinity;
  tiles.forEach((t, i) => {
    if (t.kind !== 'HEX') return;
    const { r1, r2, r3 } = ringsOf(i);
    if ([...r1, ...r2].some((j) => tiles[j].kind === 'PENT')) return;
    const near = [i, ...r1, ...r2];
    const score = t.normal.x * aim.x + t.normal.y * aim.y + t.normal.z * aim.z - 0.06 * near.filter((j) => tiles[j].deposit).length;
    if (score > best) {
      best = score;
      center = i;
    }
  });
  if (center < 0) return null;

  const { r1, r2, r3 } = ringsOf(center);
  const free = (i: number): boolean => tiles[i].kind === 'HEX' && !tiles[i].deposit;
  for (const i of [center, ...r1, ...r2]) if (kinds[i] === 'water' || kinds[i] === 'rock' || kinds[i] === 'snow') kinds[i] = 'grass';
  for (const i of r1) if (kinds[i] === 'forest') kinds[i] = 'grass';

  if (free(center)) decor.push({ model: 'castle', tile: center, fill: 0.95 });
  r1.filter(free).forEach((i, k) => {
    road.add(i);
    if (k === 0 || k === 3) decor.push({ model: 'watchtower', tile: i, fill: 0.5, ox: 0.28, oz: 0.1 });
    if (k === 1) decor.push({ model: 'market', tile: i, fill: 0.6, ox: -0.25, oz: 0.15 });
    if (k === 4) decor.push({ model: 'barracks', tile: i, fill: 0.62, ox: -0.22, oz: -0.12 });
  });
  r2.forEach((i, k) => {
    if (!free(i)) return;
    const h = hash3(seed, i, 9, 0);
    if (kinds[i] === 'forest' && k % 2) return;
    if (k % 3 === 0) {
      road.add(i);
      decor.push({ model: 'house', tile: i, fill: 0.55, ox: 0.25, oz: 0.2 });
    } else if (k % 3 === 1) {
      decor.push({ model: 'farm_plot', tile: i, fill: 0.8, yaw: h * Math.PI * 2 });
    } else if (k === 2) {
      decor.push({ model: 'mill', tile: i, fill: 0.6 });
    } else if (k === 5) {
      decor.push({ model: 'well', tile: i, fill: 0.35 });
    } else {
      decor.push({ model: 'house', tile: i, fill: 0.55, yaw: h * Math.PI * 2 });
    }
  });
  const lumber = r3.find((i) => free(i) && kinds[i] === 'forest');
  if (lumber !== undefined) decor.push({ model: 'lumbermill', tile: lumber, fill: 0.7 });
  const mine = r3.find((i) => free(i) && kinds[i] === 'rock');
  if (mine !== undefined) decor.push({ model: 'mine', tile: mine, fill: 0.75 });

  // four spokes from the outer ring towards the castle, greedy along the neighbour closest to it
  const cc = tiles[center].center;
  const dist2 = (i: number): number => (tiles[i].center.x - cc.x) ** 2 + (tiles[i].center.y - cc.y) ** 2 + (tiles[i].center.z - cc.z) ** 2;
  r3.filter((_, k) => k % 4 === 0)
    .slice(0, 4)
    .forEach((target) => {
      let cur = target;
      for (let step = 0; step < 4; step++) {
        if (!free(cur)) break;
        road.add(cur);
        const next = tiles[cur].neighbors.filter((j) => free(j)).sort((a, b) => dist2(a) - dist2(b))[0];
        if (next === undefined || dist2(next) >= dist2(cur)) break;
        cur = next;
        if (r1.includes(cur)) {
          road.add(cur);
          break;
        }
      }
    });
  // a road tile is plain grass
  for (const i of road) kinds[i] = 'grass';
  return center;
}
