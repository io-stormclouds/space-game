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
/**
 * Craters and boulders on the dry ground (Kenney Space Kit, 60–176 triangles each, ≤ 11 k per body): a cap of
 * their own, so they never thin out the rocks and mountains on the rock tiles.
 */
export const MAX_GROUND_DECOR = 60;

/**
 * Prefix of the Kenney Space Kit decor models (CC0, decision T-31): `kenney:crater` is
 * `assets/kenney/crater.glb` in the render. Everything else is a Medieval Hexagon file.
 */
export const KENNEY = 'kenney:';

export const isKenneyModel = (model: string): boolean => model.startsWith(KENNEY);

/**
 * Scattered nature (trees, rock piles, mountains, craters, crystals). Every other decor model is a
 * building of the ruined settlement (faded in the render, kept free by the colony presets).
 */
export const isNatureDecor = (model: string): boolean => model.startsWith('detail_') || model === 'mountain' || isKenneyModel(model);

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

  // kit tile per hexagon (before the decor: the Kenney models stand only on a plain tile)
  const variants: (TileVariant | null)[] = tiles.map((t, i) => {
    if (t.kind !== 'HEX') return null;
    const v = chooseVariant(i, frames[i]!, kinds, road, seed, dress);
    // a raised half would bury a structure standing on a deposit, a pond would put it in water
    if (hasDeposit(i) && (v.id.startsWith('hex_forest_transition') || v.id === 'hex_forest_waterD')) return { id: 'hex_forest', k0: 0 };
    return v;
  });

  // trees, rocks, mountains; craters and crystals on dry and winter bodies
  const taken = new Set(decor.map((d) => d.tile));
  const scatter: DecorItem[] = [];
  tiles.forEach((_, i) => {
    if (road.has(i) || hasDeposit(i) || taken.has(i)) return;
    scatterDecor(dress.decor, i, kinds[i]!, rules.ground, variants[i]?.id === 'hex_forest', seed, scatter);
  });
  // three budgets: trees, rocks (piles, mountains, crystals), and the Kenney craters and boulders on the ground
  const poolOf = (d: DecorItem): DecorPool =>
    d.model.startsWith('detail_tree') ? 'tree' : isKenneyModel(d.model) && kinds[d.tile] !== 'rock' ? 'ground' : 'rock';
  const cap: Record<DecorPool, number> = { tree: MAX_TREES, rock: MAX_ROCKS, ground: MAX_GROUND_DECOR };
  const planned: Record<DecorPool, number> = { tree: 0, rock: 0, ground: 0 };
  for (const d of scatter) planned[poolOf(d)]++;
  const keep: Record<DecorPool, number> = {
    tree: Math.min(1, cap.tree / Math.max(1, planned.tree)),
    rock: Math.min(1, cap.rock / Math.max(1, planned.rock)),
    ground: Math.min(1, cap.ground / Math.max(1, planned.ground)),
  };
  const placed: Record<DecorPool, number> = { tree: 0, rock: 0, ground: 0 };
  scatter.forEach((d, n) => {
    const pool = poolOf(d);
    if (hash3(seed, d.tile, 17, n) >= keep[pool]) return;
    // the thinning meets the budget only on average: stop at the cap so it is a hard limit
    if (placed[pool] >= cap[pool]) return;
    placed[pool]++;
    decor.push(d);
  });

  return { bodyId: grid.bodyId, biome, seed, basin: rules.basin, ground: rules.ground, kinds, variants, road, decor, settlementCenter: center };
}

function classified(grid: PlanetGrid): TerrainConfig & TerrainClassification {
  const c = gridClassification(grid);
  if (!c) throw new Error(`dressTerrain: grid ${grid.bodyId} has no terrain`);
  return c;
}

type DecorPool = 'tree' | 'rock' | 'ground';

/** Kenney Space Kit models the decor uses (`KENNEY` + file name; README of render/system, T5 phase 3). */
export const KENNEY_DECOR = {
  crater: `${KENNEY}crater`,
  craterLarge: `${KENNEY}craterLarge`,
  boulderA: `${KENNEY}rock_largeA`,
  boulderB: `${KENNEY}rock_largeB`,
  crystals: `${KENNEY}rock_crystals`,
  crystalsLarge: `${KENNEY}rock_crystalsLargeA`,
} as const;

/** Share of the plain dry ground with a crater: airless regolith is pocked, sand is not. */
const CRATER_SHARE: Partial<Record<TerrainKind, number>> = { regolith: 0.25, sand: 0.1 };
/** Share of the plain dry ground with a lone boulder. */
const BOULDER_SHARE: Partial<Record<TerrainKind, number>> = { regolith: 0.04, sand: 0.06 };

/**
 * Scattered nature on one free tile, by the biome's decor set:
 * - temperate: 2–3 trees on forest; a mountain or a rock pile on rock (hex kit only; the golden plans);
 * - winter: the same (crowns in the ice tone: `objectTone`), a few small rocks on the snow, and on a plain
 *   rock tile now and then a crystal outcrop or a boulder (Kenney);
 * - dry: mountains and rock piles on rock, rarely a crystal outcrop instead of a small pile (Kenney); on the
 *   ground small rocks and a few bushes (small trees), and on a plain ground tile craters and lone boulders (Kenney).
 * `plain`: the tile is a flat `hex_forest` (no shore bay, no raised half), the only kit tile a Kenney model
 * may stand on (a crater is as wide as most of the tile).
 */
function scatterDecor(set: DecorSet, i: number, kind: TerrainKind, ground: TerrainKind, plain: boolean, seed: number, out: DecorItem[]): void {
  const h = hash3(seed, i, 5, 0);
  if (kind === 'forest' && set !== 'dry') {
    out.push({ model: 'detail_treeA', tile: i, fill: 0.3, ox: -0.2, oz: 0.1 });
    out.push({ model: 'detail_treeC', tile: i, fill: 0.3, ox: 0.15, oz: -0.18 });
    if (h > 0.6) out.push({ model: 'detail_treeB', tile: i, fill: 0.28, ox: 0.18, oz: 0.2 });
  } else if (kind === 'rock') {
    const kenney = set !== 'temperate' && plain ? rockKenney(set, i, h, seed) : null;
    if (kenney) out.push(kenney);
    else if (h > 0.62) out.push({ model: 'mountain', tile: i, fill: 0.8, yaw: h * Math.PI * 2 });
    else out.push({ model: h > 0.3 ? 'detail_rocks' : 'detail_rocks_small', tile: i, fill: h > 0.3 ? 0.75 : 0.35, yaw: h * Math.PI * 2 });
  } else if (kind === ground && set !== 'temperate') {
    const g = hash3(seed, i, 15, 0);
    if (set === 'dry' && g > 0.985) {
      out.push({ model: g > 0.9925 ? 'detail_treeA' : 'detail_treeC', tile: i, fill: 0.25, ox: 0.12, oz: -0.1, sm: 0.7 });
    } else if (g > (set === 'dry' ? 0.925 : 0.95)) {
      out.push({ model: 'detail_rocks_small', tile: i, fill: 0.3, yaw: g * Math.PI * 2 });
    } else if (set === 'dry' && plain) {
      groundKenney(i, ground, seed, out);
    }
  }
}

/** A crystal outcrop (dry, winter) or a boulder (winter) on a plain rock tile that has no mountain; null = the kit's rocks. */
function rockKenney(set: DecorSet, i: number, h: number, seed: number): DecorItem | null {
  if (h > 0.62) return null; // the mountains stay
  const yaw = hash3(seed, i, 19, 1) * Math.PI * 2;
  if (h < (set === 'winter' ? 0.15 : 0.1)) {
    const large = hash3(seed, i, 19, 0) > 0.5;
    return { model: large ? KENNEY_DECOR.crystalsLarge : KENNEY_DECOR.crystals, tile: i, fill: large ? 0.5 : 0.45, yaw };
  }
  const b = hash3(seed, i, 19, 0);
  if (set === 'winter' && h > 0.3 && b < 0.35) return { model: b < 0.175 ? KENNEY_DECOR.boulderA : KENNEY_DECOR.boulderB, tile: i, fill: 0.5, yaw };
  return null;
}

/** A crater or a lone boulder on a plain tile of the dry ground (shares by the ground class). */
function groundKenney(i: number, ground: TerrainKind, seed: number, out: DecorItem[]): void {
  const c = hash3(seed, i, 19, 0);
  const craters = CRATER_SHARE[ground] ?? 0;
  const boulders = BOULDER_SHARE[ground] ?? 0;
  const yaw = c * Math.PI * 2;
  // a small crater drifts off the centre, a large one fills most of the tile and stays inside it
  const ox = (hash3(seed, i, 21, 0) - 0.5) * 0.24;
  const oz = (hash3(seed, i, 21, 1) - 0.5) * 0.24;
  if (c > 1 - craters * 0.35) out.push({ model: KENNEY_DECOR.craterLarge, tile: i, fill: 0.78, yaw });
  else if (c > 1 - craters) out.push({ model: KENNEY_DECOR.crater, tile: i, fill: 0.55, ox, oz, yaw });
  else if (c < boulders) out.push({ model: c < boulders / 2 ? KENNEY_DECOR.boulderA : KENNEY_DECOR.boulderB, tile: i, fill: 0.42, ox, oz, yaw });
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
