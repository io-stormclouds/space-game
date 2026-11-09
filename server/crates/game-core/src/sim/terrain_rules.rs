//! What the terrain under a footprint does to building (`sim/terrain/terrain-rules.ts`, T8,
//! docs/planet-terrain-poc-wnioski-i-plan.md §9.2): per tile a road takes the road numbers, otherwise
//! its class; a tile without terrain counts 100 %; the footprint takes the maximum over its tiles,
//! cost and time separately.

use serde::{Deserialize, Serialize};

use crate::economy::TerrainRules;
use crate::models::grid::{PlanetGrid, Tile};
use crate::models::resource::Cost;
use crate::models::terrain::TerrainKind;

/// Terrain verdict of a footprint.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SiteTerrain {
    /// Every tile can be built on.
    pub buildable: bool,
    /// Class of the first tile (footprint order, anchor first) that cannot be built on.
    pub bad_kind: Option<TerrainKind>,
    /// Materials in % of the catalog cost (maximum over the tiles).
    pub cost_pct: u32,
    /// Construction time in % of the catalog time (maximum over the tiles).
    pub time_pct: u32,
}

/// Terrain of one tile for the tile panel (`TileTerrainInfo` of the API).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TileTerrain {
    pub kind: TerrainKind,
    /// Polish name: the road's on a road tile, the class's otherwise.
    pub name: String,
    pub road: bool,
    pub buildable: bool,
    /// Effective numbers of this tile (road numbers on a road).
    pub cost_pct: u32,
    pub time_pct: u32,
}

/// Cost and time % of one tile: road → road numbers, class → its numbers, no terrain → 100.
fn tile_pct(t: &Tile, rules: &TerrainRules) -> (u32, u32) {
    if t.road {
        return (rules.road.cost_pct, rules.road.time_pct);
    }
    match t.terrain {
        None => (100, 100),
        Some(kind) => {
            let k = rules.kinds.get(kind);
            (k.cost_pct, k.time_pct)
        }
    }
}

/// Whether a structure may stand on the tile (no terrain = yes).
pub fn tile_buildable(t: &Tile, rules: &TerrainRules) -> bool {
    t.terrain.is_none_or(|kind| rules.kinds.get(kind).buildable)
}

/// Terrain of one tile, as the tile panel shows it; none without terrain.
pub fn tile_terrain(t: &Tile, rules: &TerrainRules) -> Option<TileTerrain> {
    let kind = t.terrain?;
    let rule = rules.kinds.get(kind);
    let (cost_pct, time_pct) = tile_pct(t, rules);
    Some(TileTerrain {
        kind,
        name: if t.road { rules.road.name.clone() } else { rule.name.clone() },
        road: t.road,
        buildable: rule.buildable,
        cost_pct,
        time_pct,
    })
}

/// Terrain verdict of the footprint `tiles` (indices into `grid.tiles`).
pub fn site_terrain(grid: &PlanetGrid, tiles: &[usize], rules: &TerrainRules) -> SiteTerrain {
    if tiles.is_empty() {
        return SiteTerrain { buildable: true, bad_kind: None, cost_pct: 100, time_pct: 100 };
    }
    let mut cost_pct = 0;
    let mut time_pct = 0;
    for &i in tiles {
        let t = &grid.tiles[i];
        if !tile_buildable(t, rules) {
            return SiteTerrain { buildable: false, bad_kind: t.terrain, cost_pct: 100, time_pct: 100 };
        }
        let (c, tm) = tile_pct(t, rules);
        cost_pct = cost_pct.max(c);
        time_pct = time_pct.max(tm);
    }
    SiteTerrain { buildable: true, bad_kind: None, cost_pct, time_pct }
}

/// Cost scaled by `pct` %: `Math.ceil(q * pct / 100)` per material, key order kept (catalog costs are
/// integers, so 100 % leaves them as they are and the result is exact in both languages).
pub fn scale_cost(cost: &Cost, pct: u32) -> Cost {
    cost.iter().map(|(code, q)| (code.clone(), (q * pct as f64 / 100.0).ceil())).collect()
}

/// Construction time scaled by `pct` %, computed as `time * pct / 100`; 100 % returns `time` unchanged.
pub fn scale_time(time: f64, pct: u32) -> f64 {
    if pct == 100 { time } else { time * pct as f64 / 100.0 }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::economy::catalog;
    use crate::models::resource::qty;

    #[test]
    fn scales_cost_up_and_down() {
        let sil = qty([("SIL", 10.0), ("FER", 15.0)]);
        assert_eq!(scale_cost(&sil, 110), qty([("SIL", 11.0), ("FER", 17.0)]));
        assert_eq!(scale_cost(&sil, 85), qty([("SIL", 9.0), ("FER", 13.0)]));
        assert_eq!(scale_cost(&sil, 100), sil);
        assert_eq!(scale_time(3.0, 125), 3.75);
        assert_eq!(scale_time(1.0, 100), 1.0);
    }

    #[test]
    fn water_is_not_buildable_and_roads_override_the_class() {
        let rules = &catalog().terrain;
        let mut t = crate::math::goldberg::build_goldberg_grid("x", 50.0, 2, None, None).tiles.remove(0);
        assert!(tile_buildable(&t, rules));
        assert_eq!(tile_terrain(&t, rules), None);
        t.terrain = Some(TerrainKind::Water);
        assert!(!tile_buildable(&t, rules));
        t.terrain = Some(TerrainKind::Grass);
        t.road = true;
        let info = tile_terrain(&t, rules).expect("terrain");
        assert_eq!((info.name.as_str(), info.cost_pct, info.time_pct), ("droga", 85, 75));
    }
}
