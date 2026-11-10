import { TerrainBasin, TerrainBiome, TerrainConfig, TerrainGround, TerrainKind } from './terrain-types';

/*
 * Terrain biomes as data (T5, docs/planet-terrain-poc-wnioski-i-plan.md §11, presets of
 * docs/planet-terrain-design.md §4.4). The gameplay half (`BiomeRules`) decides the class of every tile in
 * `classifyTerrain` and is mirrored in Rust (`game-core/src/math/terrain.rs`); the render half
 * (`BiomeDress`) only picks kit tiles and decor in `dressTerrain` (TypeScript only).
 *
 * Class chain per tile, on the noise fields f1, f2, f3 and the latitude lat = |n.y| (first rule wins):
 *   f1 < basinLevel                                       → basin
 *   polar ≠ null and lat > polar                          → snow
 *   rock ≠ null and f2 > rock                             → rock
 *   forest ≠ null and f3 > forest and (forestLat = null or lat < forestLat) → forest
 *   otherwise                                             → ground
 * then every tile where n.y > landingCap (config) becomes the ground, and elsewhere a basin becomes the ground on a pentagon or a deposit.
 */

/** Gameplay half of a biome: thresholds and classes (mirrored in Rust). `null` = that rule is off. */
export interface BiomeRules {
  /** Class of the tiles no rule claims; also what a removed basin, a cleared settlement tile and a road become. */
  ground: TerrainGround;
  /** Class of the basins. */
  basin: TerrainBasin;
  /** `f1 < basinLevel` → basin. */
  basinLevel: number;
  /** `lat > polar` → snow (polar caps). */
  polar: number | null;
  /** `f2 > rock` → rock. */
  rock: number | null;
  /** `f3 > forest` → forest (within `forestLat`). */
  forest: number | null;
  /** Forest only where `lat < forestLat`. */
  forestLat: number | null;
  /** A ruined settlement facing the aim (centre, cleared rings, roads). */
  settlement: boolean;
}

/** Decor set of a biome (`dressTerrain`). */
export type DecorSet = 'temperate' | 'winter' | 'dry';

/** Render half of a biome (TypeScript only). */
export interface BiomeDress {
  /** Raised transition halves (A towards rock, B towards snow) on `transitionOn` tiles. */
  transitionOn: ReadonlyArray<TerrainKind>;
  /** Class that may hold a small pond (`hex_forest_waterD`), or null. */
  pond: TerrainKind | null;
  decor: DecorSet;
}

export interface BiomeSpec extends BiomeRules {
  dress: BiomeDress;
}

/**
 * Mean shares over the property-test matrix (n ≥ 5; presets of docs/planet-terrain-design.md §4.4):
 * mixed grass 42 %, water 22 %, forest 15 %, snow 14 %, rock 7 %; medieval grass 50 %, forest 24 %,
 * water 11 %, snow 10 %, rock 5 %; winter snow 59 %, ice 26 %, forest 9 %, rock 6 %; dry ground 78 %,
 * rock 15 %, dune 7 %.
 */
export const BIOMES: Readonly<Record<TerrainBiome, Readonly<BiomeSpec>>> = {
  mixed: {
    ground: 'grass',
    basin: 'water',
    basinLevel: 0.42,
    polar: 0.84,
    rock: 0.64,
    forest: 0.57,
    forestLat: null,
    settlement: false,
    dress: { transitionOn: ['grass', 'forest'], pond: 'grass', decor: 'temperate' },
  },
  medieval: {
    ground: 'grass',
    basin: 'water',
    basinLevel: 0.36,
    polar: 0.88,
    rock: 0.67,
    forest: 0.55,
    forestLat: null,
    settlement: true,
    dress: { transitionOn: ['grass', 'forest'], pond: 'grass', decor: 'temperate' },
  },
  winter: {
    ground: 'snow',
    basin: 'ice',
    basinLevel: 0.44,
    polar: null,
    rock: 0.66,
    forest: 0.6,
    forestLat: 0.7,
    settlement: false,
    // forest takes B towards snow; snow (the ground) takes A towards rock
    dress: { transitionOn: ['forest', 'snow'], pond: null, decor: 'winter' },
  },
  dry: {
    ground: 'sand',
    basin: 'dune',
    basinLevel: 0.33,
    polar: null,
    rock: 0.62,
    forest: null,
    forestLat: null,
    settlement: false,
    // flat rock with mountains on it, no raised halves
    dress: { transitionOn: [], pond: null, decor: 'dry' },
  },
};

/** Gameplay rules of a body: the biome's, with the config's overrides. */
export function biomeRules(config: TerrainConfig): BiomeRules {
  const b = BIOMES[config.biome];
  return {
    ground: config.ground ?? b.ground,
    basin: config.basin ?? b.basin,
    basinLevel: config.basinLevel ?? b.basinLevel,
    polar: b.polar,
    rock: b.rock,
    forest: b.forest,
    forestLat: b.forestLat,
    settlement: b.settlement,
  };
}

/** Classes drawn as a basin (`hex_water`, lowered surface); their land neighbours get shore tiles. */
export const BASIN_KINDS: ReadonlySet<TerrainKind> = new Set<TerrainKind>(['water', 'ice', 'dune']);

export const isBasin = (kind: TerrainKind | undefined): boolean => kind !== undefined && BASIN_KINDS.has(kind);
