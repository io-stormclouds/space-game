//! Gameplay half of the hex-kit terrain (`sim/terrain/terrain-classify.ts`, T8): the class of every
//! tile and the roads of the ruined settlement. Build rules read them (`Tile.terrain`, `Tile.road`), so
//! this is the TypeScript bit for bit: plain float arithmetic in the same order (`dx * dx`, no powers),
//! `libm` cosine and sine for the aim (R-10), the first maximum or minimum wins. The render-only half
//! (kit tile per hexagon, decor) stays in TypeScript.

use std::collections::BTreeSet;

use super::noise::fbm;
use super::vec3::{Vec3, vec3};
use crate::models::body::CelestialBody;
use crate::models::grid::{PlanetGrid, Tile, TileKind};
use crate::models::terrain::{GridTerrain, TerrainBiome, TerrainConfig, TerrainKind};

/// Octaves of the class noise (TS `fbm` default).
const OCTAVES: usize = 3;

/// Rings 1–3 around the settlement centre, each in breadth-first order over `Tile.neighbors`.
#[derive(Clone, Debug, PartialEq)]
pub struct SettlementRings {
    pub r1: Vec<usize>,
    pub r2: Vec<usize>,
    pub r3: Vec<usize>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct TerrainClassification {
    /// Final class per tile (after the settlement clearing; road tiles are grass).
    pub kinds: Vec<TerrainKind>,
    /// Road tiles of the settlement, ascending.
    pub road: Vec<usize>,
    /// Centre tile of the settlement (castle); none without one.
    pub settlement_center: Option<usize>,
    /// Rings around the centre; none without a settlement.
    pub rings: Option<SettlementRings>,
}

/// Settlement direction when none is given (the PoC showcase): `normalize(0.35, 0.45, 0.82)`.
pub fn default_aim() -> Vec3 {
    vec3(0.35, 0.45, 0.82).normalize()
}

/// Direction the settlement of a body faces: the sun as seen from the body at t = 0, lifted to
/// y = 0.9 (not normalised). `libm` gives V8's `Math.cos`/`Math.sin` to the bit.
pub fn terrain_aim(body: &CelestialBody) -> Vec3 {
    vec3(-libm::cos(body.initial_angle), 0.9, -libm::sin(body.initial_angle))
}

/// Free for settlement buildings and roads: a hexagon without a deposit.
fn free_tile(t: &Tile) -> bool {
    t.kind == TileKind::Hex && t.deposit.is_none()
}

/// Classes from three smooth noise fields on the tile normal plus latitude; no water on a pentagon
/// or a deposit (they turn to grass).
pub fn noise_kinds(grid: &PlanetGrid, biome: TerrainBiome, seed: f64) -> Vec<TerrainKind> {
    let settle = biome == TerrainBiome::Medieval;
    let mut kinds: Vec<TerrainKind> = grid
        .tiles
        .iter()
        .map(|t| {
            let n = t.normal;
            let p = |k: f64| vec3(n.x * k + 7.0, n.y * k + 7.0, n.z * k + 7.0);
            let f1 = fbm(seed, p(2.6), OCTAVES);
            let f2 = fbm(seed + 11.0, p(3.4), OCTAVES);
            let f3 = fbm(seed + 23.0, p(4.2), OCTAVES);
            let lat = n.y.abs();
            if f1 < (if settle { 0.36 } else { 0.42 }) {
                TerrainKind::Water
            } else if lat > (if settle { 0.88 } else { 0.84 }) {
                TerrainKind::Snow
            } else if f2 > (if settle { 0.67 } else { 0.64 }) {
                TerrainKind::Rock
            } else if f3 > (if settle { 0.55 } else { 0.57 }) {
                TerrainKind::Forest
            } else {
                TerrainKind::Grass
            }
        })
        .collect();
    for (i, t) in grid.tiles.iter().enumerate() {
        if kinds[i] == TerrainKind::Water && (t.kind == TileKind::Pent || t.deposit.is_some()) {
            kinds[i] = TerrainKind::Grass;
        }
    }
    kinds
}

/// Rings 1–3 around tile `c` (breadth-first over `Tile.neighbors`, in neighbour order).
pub fn settlement_rings(grid: &PlanetGrid, c: usize) -> SettlementRings {
    let mut seen: Vec<usize> = vec![c];
    let mut rings: Vec<Vec<usize>> = vec![vec![c]];
    for r in 1..=3 {
        let mut next = Vec::new();
        for &t in &rings[r - 1] {
            for &nb in &grid.tiles[t].neighbors {
                if !seen.contains(&nb) {
                    seen.push(nb);
                    next.push(nb);
                }
            }
        }
        rings.push(next);
    }
    let r3 = rings.pop().unwrap_or_default();
    let r2 = rings.pop().unwrap_or_default();
    let r1 = rings.pop().unwrap_or_default();
    SettlementRings { r1, r2, r3 }
}

/// Settlement centre: the hexagon facing `aim` best, with no pentagon within two rings, penalised by
/// the deposits within two rings (they cannot hold buildings). First maximum in tile order; none when
/// no hexagon qualifies (GP(n,0) with n ≤ 4).
pub fn find_settlement_center(grid: &PlanetGrid, aim: Vec3) -> Option<usize> {
    let tiles = &grid.tiles;
    let mut center = None;
    let mut best = f64::NEG_INFINITY;
    for (i, t) in tiles.iter().enumerate() {
        if t.kind != TileKind::Hex {
            continue;
        }
        let rings = settlement_rings(grid, i);
        if rings.r1.iter().chain(&rings.r2).any(|&j| tiles[j].kind == TileKind::Pent) {
            continue;
        }
        let deposits = std::iter::once(&i).chain(&rings.r1).chain(&rings.r2).filter(|&&j| tiles[j].deposit.is_some()).count();
        // same order as TS: ((x·x + y·y) + z·z) − 0.06·deposits
        let score = t.normal.x * aim.x + t.normal.y * aim.y + t.normal.z * aim.z - 0.06 * deposits as f64;
        if score > best {
            best = score;
            center = Some(i);
        }
    }
    center
}

/// The settlement clears its ground: no water, rock or snow within two rings, no forest in ring 1.
pub fn clear_settlement(kinds: &mut [TerrainKind], center: usize, rings: &SettlementRings) {
    for &i in std::iter::once(&center).chain(&rings.r1).chain(&rings.r2) {
        if matches!(kinds[i], TerrainKind::Water | TerrainKind::Rock | TerrainKind::Snow) {
            kinds[i] = TerrainKind::Grass;
        }
    }
    for &i in &rings.r1 {
        if kinds[i] == TerrainKind::Forest {
            kinds[i] = TerrainKind::Grass;
        }
    }
}

/// Whether ring-2 tile `i` (position `k` in the ring) gets a settlement building, on the cleared
/// classes. Every third one (k % 3 = 0) is a house on a road.
pub fn ring2_built(grid: &PlanetGrid, cleared: &[TerrainKind], i: usize, k: usize) -> bool {
    free_tile(&grid.tiles[i]) && !(cleared[i] == TerrainKind::Forest && !k.is_multiple_of(2))
}

/// Roads of the settlement on the cleared classes: every free ring-1 tile, the ring-2 house tiles, and
/// four spokes from the outer ring towards the castle (greedy along the free neighbour closest to the
/// centre, first minimum in neighbour order, like the stable sort of the TS).
fn settlement_roads(grid: &PlanetGrid, cleared: &[TerrainKind], center: usize, rings: &SettlementRings) -> BTreeSet<usize> {
    let tiles = &grid.tiles;
    let free = |i: usize| free_tile(&tiles[i]);
    let mut road = BTreeSet::new();
    for &i in &rings.r1 {
        if free(i) {
            road.insert(i);
        }
    }
    for (k, &i) in rings.r2.iter().enumerate() {
        if ring2_built(grid, cleared, i, k) && k.is_multiple_of(3) {
            road.insert(i);
        }
    }

    let cc = tiles[center].center;
    let dist2 = |i: usize| {
        let c = tiles[i].center;
        let dx = c.x - cc.x;
        let dy = c.y - cc.y;
        let dz = c.z - cc.z;
        dx * dx + dy * dy + dz * dz
    };
    for &target in rings.r3.iter().step_by(4).take(4) {
        let mut cur = target;
        for _ in 0..4 {
            if !free(cur) {
                break;
            }
            road.insert(cur);
            // the first of equally close neighbours wins
            let mut next: Option<(usize, f64)> = None;
            for &j in &tiles[cur].neighbors {
                if !free(j) {
                    continue;
                }
                let d = dist2(j);
                if next.is_none_or(|(_, best)| d < best) {
                    next = Some((j, d));
                }
            }
            let Some((n, d)) = next else { break };
            if d >= dist2(cur) {
                break;
            }
            cur = n;
            if rings.r1.contains(&cur) {
                road.insert(cur);
                break;
            }
        }
    }
    road
}

/// Terrain classes and settlement roads of a body. Pure and deterministic. Steps: noise classes →
/// (medieval) centre facing `aim` → clearing within two rings → roads → road tiles become grass.
/// No water on a deposit tile or a pentagon, no road on a deposit tile or a pentagon.
pub fn classify_terrain(grid: &PlanetGrid, biome: TerrainBiome, seed: f64, aim: Option<Vec3>) -> TerrainClassification {
    let mut kinds = noise_kinds(grid, biome, seed);
    let center = if biome == TerrainBiome::Medieval { find_settlement_center(grid, aim.unwrap_or_else(default_aim)) } else { None };
    let Some(center) = center else {
        return TerrainClassification { kinds, road: Vec::new(), settlement_center: None, rings: None };
    };
    let rings = settlement_rings(grid, center);
    clear_settlement(&mut kinds, center, &rings);
    let roads = settlement_roads(grid, &kinds, center, &rings);
    // a road tile is plain grass
    for &i in &roads {
        kinds[i] = TerrainKind::Grass;
    }
    TerrainClassification { kinds, road: roads.into_iter().collect(), settlement_center: Some(center), rings: Some(rings) }
}

/// The grid with its terrain: `Tile.terrain` on every tile, `Tile.road` on road tiles and
/// `PlanetGrid.terrain` with the style and the settlement centre.
pub fn with_terrain(mut grid: PlanetGrid, config: TerrainConfig, aim: Vec3) -> PlanetGrid {
    let c = classify_terrain(&grid, config.biome, config.seed, Some(aim));
    for (i, t) in grid.tiles.iter_mut().enumerate() {
        t.terrain = Some(c.kinds[i]);
        t.road = c.road.binary_search(&i).is_ok();
    }
    grid.terrain = Some(GridTerrain { biome: config.biome, seed: config.seed, settlement_center: c.settlement_center });
    grid
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::math::goldberg::build_goldberg_grid;
    use crate::sim::scenarios::tau_ceti_scenario;

    #[test]
    fn tau_ceti_c_has_a_settlement_with_roads() {
        let s = tau_ceti_scenario();
        let body = s.bodies.iter().find(|b| b.id == "tc-c").expect("tc-c");
        let sg = body.surface_grid.as_ref().expect("grid");
        let grid = build_goldberg_grid(&body.id, body.radius, sg.frequency, sg.deposit_seed, sg.deposit_weights.as_ref());
        let c = classify_terrain(&grid, TerrainBiome::Medieval, 2.0, Some(terrain_aim(body)));
        let center = c.settlement_center.expect("a settlement");
        assert_eq!(grid.tiles[center].kind, TileKind::Hex);
        assert!(!c.road.is_empty());
        assert!(c.road.windows(2).all(|w| w[0] < w[1]));
        for &i in &c.road {
            assert!(free_tile(&grid.tiles[i]));
            assert_eq!(c.kinds[i], TerrainKind::Grass);
        }
        for (i, t) in grid.tiles.iter().enumerate() {
            if t.kind == TileKind::Pent || t.deposit.is_some() {
                assert_ne!(c.kinds[i], TerrainKind::Water);
            }
        }
    }

    #[test]
    fn mixed_has_no_settlement() {
        let grid = build_goldberg_grid("x", 50.0, 5, Some(3.0), None);
        let c = classify_terrain(&grid, TerrainBiome::Mixed, 7.0, None);
        assert_eq!(c.settlement_center, None);
        assert!(c.road.is_empty() && c.rings.is_none());
        assert_eq!(c.kinds.len(), grid.tiles.len());
    }
}
