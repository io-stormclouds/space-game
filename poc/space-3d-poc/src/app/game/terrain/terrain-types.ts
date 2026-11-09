import { BodyId } from '../../shared/ids';

/** Terrain style of a body. `medieval` = `mixed` terrain plus a ruined settlement. */
export type TerrainBiome = 'mixed' | 'medieval';

export type TerrainKind = 'grass' | 'forest' | 'rock' | 'snow' | 'water';

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
 * (deterministic, no I/O). Tiles are indexed like `PlanetGrid.tiles`.
 */
export interface TerrainPlan {
  bodyId: BodyId;
  biome: TerrainBiome;
  seed: number;
  kinds: ReadonlyArray<TerrainKind>;
  /** Kit tile per tile; `null` for pentagons (they keep a plain bevelled plate, no kit tile). */
  variants: ReadonlyArray<TileVariant | null>;
  road: ReadonlySet<number>;
  decor: ReadonlyArray<DecorItem>;
  /** Centre tile of the settlement (castle); null without one. */
  settlementCenter: number | null;
}
