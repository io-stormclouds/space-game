//! Tiles covered by a building of 1, 3 or 7 tiles (`footprint.ts`).

use crate::models::grid::PlanetGrid;

/// - 1: the anchor;
/// - 3: the anchor and two neighbours that touch each other (consecutive in angular order), `rotation` picks the pair;
/// - 7: the anchor and its six neighbours (impossible on a pentagon).
///
/// Returns `None` when the shape does not fit.
pub fn footprint_tiles(grid: &PlanetGrid, anchor: usize, size: usize, rotation: i64) -> Option<Vec<usize>> {
    let tile = grid.tiles.get(anchor)?;
    if size <= 1 {
        return Some(vec![anchor]);
    }
    let n = tile.neighbors.len() as i64;
    if size == 3 {
        let r = ((rotation % n) + n) % n;
        return Some(vec![anchor, tile.neighbors[r as usize], tile.neighbors[((r + 1) % n) as usize]]);
    }
    if size == 7 {
        return if n == 6 {
            let mut v = vec![anchor];
            v.extend_from_slice(&tile.neighbors);
            Some(v)
        } else {
            None
        };
    }
    None
}
