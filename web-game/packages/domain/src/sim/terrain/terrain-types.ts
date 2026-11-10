import { BodyId } from '../../shared/ids';

/**
 * Terrain style of a body (`BIOMES` in `terrain-biomes.ts`): `mixed` grass, lakes, forest, rock and polar
 * caps; `medieval` = `mixed` with other thresholds plus a ruined settlement; `winter` snow with frozen
 * lakes; `dry` sand or regolith with dune hollows and rock.
 */
export type TerrainBiome = 'mixed' | 'medieval' | 'winter' | 'dry';

export type TerrainKind = 'grass' | 'forest' | 'rock' | 'snow' | 'water' | 'sand' | 'dune' | 'ice' | 'regolith';

/** Class of the basins (the lowest tiles of the first noise field): lakes, frozen lakes, dune hollows or dried lake beds. */
export type TerrainBasin = 'water' | 'ice' | 'dune';

/**
 * Class of the ground (the tiles no rule claims). Always buildable: a basin removed from a pentagon, a
 * deposit or the landing cap, a cleared settlement tile and a road become the ground.
 */
export type TerrainGround = 'grass' | 'snow' | 'sand' | 'regolith';

/**
 * Terrain style of one body (`CelestialBody.surfaceGrid.terrain`). Key order is the world JSON order (the
 * Rust struct mirrors it); optional keys are written only when set, and an absent key takes the biome's value.
 */
export interface TerrainConfig {
  biome: TerrainBiome;
  /** Seed of the noise fields (and of the render-only variants and decor). */
  seed: number;
  /** Class of the ground (the majority), e.g. `regolith` instead of `sand` on a dry body. */
  ground?: TerrainGround;
  /** Class of the basins, e.g. `dune` for dried lake beds on a body without water (T-26). */
  basin?: TerrainBasin;
  /** Noise level below which a tile is a basin (`f1 < basinLevel`); lower = fewer basins. */
  basinLevel?: number;
  /**
   * Landing zone: every tile where `normal.y > landingCap` is the plain ground (no basin, no snow, rock or
   * forest surcharge), around the body's +Y pole, where the landing
   * pad, the automatic port placement and the scripted first sessions put the first buildings (T-25).
   */
  landingCap?: number;
}

/** Which kit tile (`hex_forest_*`, `hex_water`) a hexagonal tile uses and how it is turned (whole sides). */
export interface TileVariant {
  id: string;
  k0: number;
}

/** One decor model standing on a tile (trees, rocks, buildings). Offsets are fractions of the tile width. */
export interface DecorItem {
  model: string;
  tile: number;
  /** Footprint as a fraction of the tile width. */
  fill: number;
  ox?: number;
  oz?: number;
  /** Fixed yaw [rad]; otherwise derived from the seed. */
  yaw?: number;
  /** Extra size factor. */
  sm?: number;
}

/**
 * Everything the renderer needs to dress one body, computed once from the grid and a seed
 * (deterministic, no I/O). Tiles are indexed like `PlanetGrid.tiles`. `kinds`, `road` and
 * `settlementCenter` are the gameplay classification (`classifyTerrain`); the rest is render-only.
 */
export interface TerrainPlan {
  bodyId: BodyId;
  biome: TerrainBiome;
  seed: number;
  /** Class of the basins on this body (drawn as `hex_water`, a lowered surface), after the config. */
  basin: TerrainBasin;
  /** Class of the ground on this body (the majority class), after the config. */
  ground: TerrainGround;
  kinds: ReadonlyArray<TerrainKind>;
  /** Kit tile per tile; `null` for pentagons (they keep a plain bevelled plate, no kit tile). */
  variants: ReadonlyArray<TileVariant | null>;
  road: ReadonlySet<number>;
  decor: ReadonlyArray<DecorItem>;
  /** Centre tile of the settlement (castle); null without one. */
  settlementCenter: number | null;
}
