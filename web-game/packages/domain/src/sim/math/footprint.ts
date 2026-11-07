import { PlanetGrid } from '../models/planet-grid.model';

/**
 * Tiles covered by a building of `size` tiles anchored at `anchor` (doc: buildings on 1, 3 and 7 tiles).
 * - 1: the anchor;
 * - 3: the anchor and two neighbours that touch each other (consecutive in angular order), `rotation` picks the pair;
 * - 7: the anchor and its six neighbours (impossible on a pentagon).
 * Returns null when the shape does not fit.
 */
export function footprintTiles(grid: PlanetGrid, anchor: number, size: number, rotation = 0): number[] | null {
  const tile = grid.tiles[anchor];
  if (!tile) return null;
  if (size <= 1) return [anchor];
  const n = tile.neighbors.length;
  if (size === 3) {
    const r = ((rotation % n) + n) % n;
    return [anchor, tile.neighbors[r]!, tile.neighbors[(r + 1) % n]!];
  }
  if (size === 7) return n === 6 ? [anchor, ...tile.neighbors] : null;
  return null;
}
