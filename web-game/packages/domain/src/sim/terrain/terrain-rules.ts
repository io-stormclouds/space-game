import { TERRAIN_RULES, type TerrainRules } from '../../economy/terrain-data';
import { PlanetGrid, Tile } from '../models/planet-grid.model';
import { Cost } from '../models/resource.model';
import { TerrainKind } from './terrain-types';

/*
 * What the terrain under a footprint does to building (T8, docs/planet-terrain-poc-wnioski-i-plan.md §9.2).
 * Same rules in Rust (`game-core`): per tile a road takes the road numbers, otherwise its class; a tile
 * without terrain counts 100 %; the footprint takes the maximum over its tiles, cost and time separately.
 */

/** Terrain verdict of a footprint. */
export interface SiteTerrain {
  /** Every tile can be built on. */
  buildable: boolean;
  /** Class of the first tile (footprint order, anchor first) that cannot be built on. */
  badKind?: TerrainKind;
  /** Materials in % of the catalog cost (maximum over the tiles). */
  costPct: number;
  /** Construction time in % of the catalog time (maximum over the tiles). */
  timePct: number;
}

/** Terrain of one tile for the tile panel; null on a tile without terrain. */
export interface TileTerrain {
  kind: TerrainKind;
  /** Polish name: the road's on a road tile, the class's otherwise. */
  name: string;
  road: boolean;
  buildable: boolean;
  /** Effective numbers of this tile (road numbers on a road). */
  costPct: number;
  timePct: number;
}

/** Cost and time % of one tile: road → road numbers, class → its numbers, no terrain → 100. */
function tilePct(t: Tile, rules: TerrainRules): { costPct: number; timePct: number } {
  if (t.road) return rules.road;
  if (t.terrain === undefined) return { costPct: 100, timePct: 100 };
  return rules.kinds[t.terrain];
}

/** Whether a structure may stand on the tile (no terrain = yes). */
export function tileBuildable(t: Tile, rules: TerrainRules = TERRAIN_RULES): boolean {
  return t.terrain === undefined || rules.kinds[t.terrain].buildable;
}

/** Terrain of one tile, as the tile panel shows it; null without terrain. */
export function tileTerrain(t: Tile, rules: TerrainRules = TERRAIN_RULES): TileTerrain | null {
  if (t.terrain === undefined) return null;
  const kind = rules.kinds[t.terrain];
  const pct = tilePct(t, rules);
  return {
    kind: t.terrain,
    name: t.road ? rules.road.name : kind.name,
    road: t.road === true,
    buildable: kind.buildable,
    costPct: pct.costPct,
    timePct: pct.timePct,
  };
}

/** Terrain verdict of the footprint `tiles` (indices into `grid.tiles`). */
export function siteTerrain(grid: PlanetGrid, tiles: ReadonlyArray<number>, rules: TerrainRules = TERRAIN_RULES): SiteTerrain {
  if (tiles.length === 0) return { buildable: true, costPct: 100, timePct: 100 };
  let costPct = 0;
  let timePct = 0;
  for (const i of tiles) {
    const t = grid.tiles[i]!;
    if (!tileBuildable(t, rules)) return { buildable: false, badKind: t.terrain!, costPct: 100, timePct: 100 };
    const pct = tilePct(t, rules);
    costPct = Math.max(costPct, pct.costPct);
    timePct = Math.max(timePct, pct.timePct);
  }
  return { buildable: true, costPct, timePct };
}

/** Cost scaled by `pct` %: `Math.ceil(q * pct / 100)` per material, key order kept (100 % leaves integers as they are). */
export function scaleCost(cost: Cost, pct: number): Cost {
  const out: Record<string, number> = {};
  for (const [code, q] of Object.entries(cost)) out[code] = Math.ceil((q * pct) / 100);
  return out;
}

/** Construction time scaled by `pct` %, computed as `time * pct / 100`; 100 % returns `time` unchanged. */
export function scaleTime(time: number, pct: number): number {
  return pct === 100 ? time : (time * pct) / 100;
}
