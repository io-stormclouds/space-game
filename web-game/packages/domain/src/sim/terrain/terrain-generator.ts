import { hash3 } from '../math/seeded-noise';
import { PlanetGrid } from '../models/planet-grid.model';
import { ClassifyOptions, TerrainClassification, classifyTerrain, clearSettlement, gridClassification, noiseKinds, ring2Built, terrainConfigOf } from './terrain-classify';
import { BIOMES, DecorSet, biomeRules } from './terrain-biomes';
import { DecorItem, TerrainConfig, TerrainKind, TerrainPlan, TileVariant } from './terrain-types';
import { buildTileFrames } from './tile-frame';
import { chooseVariant } from './tile-variant';

/** Decor budget per body (≈ 287–579 triangles per tree, 552–1102 per rock). See docs/planet-terrain-design.md §4.8. */
export const MAX_TREES = 200;
export const MAX_ROCKS = 60;

/** Biome, noise seed, the config's overrides and the settlement direction (`classifyTerrain`). */
export type TerrainOptions = ClassifyOptions;

/**
 * Classes, kit tile per hexagon, ruined settlement and decor of a body: `classifyTerrain` (gameplay)
 * followed by `dressTerrain` (render). Pure and deterministic.
 */
export function generateTerrain(grid: PlanetGrid, opts: TerrainOptions): TerrainPlan {
  return dressTerrain(grid, { ...terrainConfigOf(opts), ...classifyTerrain(grid, opts) });
}

/**
 * Render-only half of the terrain: kit tile per hexagon, settlement buildings, trees and rocks, on top of a
 * classification (default: the one the grid carries, `buildWorldGrids` for bodies with
 * `surfaceGrid.terrain`). Pure and deterministic; TypeScript only (the Rust port needs only the classes).
 *
 * Rules that keep the plan compatible with the game: no building on a deposit tile, no raised transition
 * or pond under a deposit; pentagons keep a plain plate and no kit tile.
 */
export function dressTerrain(grid: PlanetGrid, terrain: TerrainConfig & TerrainClassification = classified(grid)): TerrainPlan {
  const { biome, seed, kinds, road } = terrain;
  const rules = biomeRules(terrain);
  const dress = BIOMES[biome].dress;
  const tiles = grid.tiles;
  const frames = buildTileFrames(grid);
  const hasDeposit = (i: number): boolean => tiles[i]!.deposit !== null;

  const decor: DecorItem[] = [];
  const center = terrain.settlementCenter;
  if (center !== null && terrain.rings) {
    // the buildings were laid out on the cleared classes, before the roads turned to ground
    const cleared = noiseKinds(grid, terrain);
    clearSettlement(cleared, center, terrain.rings, rules);
    settlementDecor(grid, cleared, center, terrain.rings, seed, decor);
  }

  // trees, rocks, mountains
  const taken = new Set(decor.map((d) => d.tile));
  const scatter: DecorItem[] = [];
  tiles.forEach((_, i) => {
    if (road.has(i) || hasDeposit(i) || taken.has(i)) return;
    scatterDecor(dress.decor, i, kinds[i]!, rules.ground, seed, scatter);
  });
  const isTree = (d: DecorItem): boolean => d.model.startsWith('detail_tree');
  const treeKeep = Math.min(1, MAX_TREES / Math.max(1, scatter.filter(isTree).length));
  const rockKeep = Math.min(1, MAX_ROCKS / Math.max(1, scatter.filter((d) => !isTree(d)).length));
  let trees = 0;
  let rocks = 0;
  scatter.forEach((d, n) => {
    const tree = isTree(d);
    if (hash3(seed, d.tile, 17, n) >= (tree ? treeKeep : rockKeep)) return;
    // the thinning meets the budget only on average: stop at the cap so it is a hard limit
    if (tree ? trees >= MAX_TREES : rocks >= MAX_ROCKS) return;
    if (tree) trees++;
    else rocks++;
    decor.push(d);
  });

  // kit tile per hexagon
  const variants: (TileVariant | null)[] = tiles.map((t, i) => {
    if (t.kind !== 'HEX') return null;
    const v = chooseVariant(i, frames[i]!, kinds, road, seed, dress);
    // a raised half would bury a structure standing on a deposit, a pond would put it in water
    if (hasDeposit(i) && (v.id.startsWith('hex_forest_transition') || v.id === 'hex_forest_waterD')) return { id: 'hex_forest', k0: 0 };
    return v;
  });

  return { bodyId: grid.bodyId, biome, seed, basin: rules.basin, ground: rules.ground, kinds, variants, road, decor, settlementCenter: center };
}

function classified(grid: PlanetGrid): TerrainConfig & TerrainClassification {
  const c = gridClassification(grid);
  if (!c) throw new Error(`dressTerrain: grid ${grid.bodyId} has no terrain`);
  return c;
}

/**
 * Scattered nature on one free tile, by the biome's decor set (only models of the hex kit):
 * - temperate: 2–3 trees on forest; a mountain or a rock pile on rock;
 * - winter: the same (crowns in the ice tone are a render step of T5 phase 2), plus a few small rocks on the snow;
 * - dry: mountains and rock piles on rock; small rocks and a few bushes (small trees) on the ground.
 */
function scatterDecor(set: DecorSet, i: number, kind: TerrainKind, ground: TerrainKind, seed: number, out: DecorItem[]): void {
  const h = hash3(seed, i, 5, 0);
  if (kind === 'forest' && set !== 'dry') {
    out.push({ model: 'detail_treeA', tile: i, fill: 0.3, ox: -0.2, oz: 0.1 });
    out.push({ model: 'detail_treeC', tile: i, fill: 0.3, ox: 0.15, oz: -0.18 });
    if (h > 0.6) out.push({ model: 'detail_treeB', tile: i, fill: 0.28, ox: 0.18, oz: 0.2 });
  } else if (kind === 'rock') {
    if (h > 0.62) out.push({ model: 'mountain', tile: i, fill: 0.8, yaw: h * Math.PI * 2 });
    else out.push({ model: h > 0.3 ? 'detail_rocks' : 'detail_rocks_small', tile: i, fill: h > 0.3 ? 0.75 : 0.35, yaw: h * Math.PI * 2 });
  } else if (kind === ground && set !== 'temperate') {
    const g = hash3(seed, i, 15, 0);
    if (set === 'dry' && g > 0.985) {
      out.push({ model: g > 0.9925 ? 'detail_treeA' : 'detail_treeC', tile: i, fill: 0.25, ox: 0.12, oz: -0.1, sm: 0.7 });
    } else if (g > (set === 'dry' ? 0.925 : 0.95)) {
      out.push({ model: 'detail_rocks_small', tile: i, fill: 0.3, yaw: g * Math.PI * 2 });
    }
  }
}

/** Castle, watchtowers, market, barracks, houses, fields and workshops around the centre (ruins). */
function settlementDecor(
  grid: PlanetGrid,
  cleared: ReadonlyArray<TerrainKind>,
  center: number,
  rings: NonNullable<TerrainClassification['rings']>,
  seed: number,
  decor: DecorItem[],
): void {
  const tiles = grid.tiles;
  const { r1, r2, r3 } = rings;
  const free = (i: number): boolean => tiles[i]!.kind === 'HEX' && !tiles[i]!.deposit;

  if (free(center)) decor.push({ model: 'castle', tile: center, fill: 0.95 });
  r1.filter(free).forEach((i, k) => {
    if (k === 0 || k === 3) decor.push({ model: 'watchtower', tile: i, fill: 0.5, ox: 0.28, oz: 0.1 });
    if (k === 1) decor.push({ model: 'market', tile: i, fill: 0.6, ox: -0.25, oz: 0.15 });
    if (k === 4) decor.push({ model: 'barracks', tile: i, fill: 0.62, ox: -0.22, oz: -0.12 });
  });
  r2.forEach((i, k) => {
    if (!ring2Built(grid, cleared, i, k)) return;
    const h = hash3(seed, i, 9, 0);
    if (k % 3 === 0) {
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
  // workshops on ring 3 by its classes before the spokes became roads
  const lumber = r3.find((i) => free(i) && cleared[i] === 'forest');
  if (lumber !== undefined) decor.push({ model: 'lumbermill', tile: lumber, fill: 0.7 });
  const mine = r3.find((i) => free(i) && cleared[i] === 'rock');
  if (mine !== undefined) decor.push({ model: 'mine', tile: mine, fill: 0.75 });
}
