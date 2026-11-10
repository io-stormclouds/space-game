//! Gameplay half of the hex-kit terrain (`sim/terrain/terrain-classify.ts` and the gameplay table of
//! `terrain-biomes.ts`, T8, T5): the class of every tile and the roads of the ruined settlement. Build
//! rules read them (`Tile.terrain`, `Tile.road`), so this is the TypeScript bit for bit: plain float
//! arithmetic in the same order (`dx * dx`, no powers), `libm` cosine and sine for the aim (R-10), the
//! first maximum or minimum wins. The render-only half (kit tile per hexagon, decor) stays in
//! TypeScript.
//!
//! Class chain per tile, on the noise fields f1, f2, f3 and the latitude lat = |n.y| (first rule wins):
//! `f1 < basinLevel` → basin; `lat > polar` → snow; `f2 > rock` → rock; `f3 > forest` (and
//! `lat < forestLat`) → forest; otherwise the ground. Then every tile where `n.y > landingCap` becomes
//! the ground, and elsewhere a basin becomes the ground on a pentagon or a deposit.

use std::collections::BTreeSet;

use super::noise::fbm;
use super::vec3::{Vec3, vec3};
use crate::models::body::CelestialBody;
use crate::models::grid::{PlanetGrid, Tile, TileKind};
use crate::models::terrain::{GridTerrain, TerrainBasin, TerrainBiome, TerrainConfig, TerrainGround, TerrainKind};

/// Octaves of the class noise (TS `fbm` default).
const OCTAVES: usize = 3;

/// Gameplay half of a biome (`BiomeRules`): thresholds and classes. `None` = that rule is off.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct BiomeRules {
    /// Class of the tiles no rule claims; also what a removed basin, a cleared settlement tile and a
    /// road become.
    pub ground: TerrainKind,
    /// Class of the basins.
    pub basin: TerrainKind,
    /// `f1 < basin_level` → basin.
    pub basin_level: f64,
    /// `lat > polar` → snow (polar caps).
    pub polar: Option<f64>,
    /// `f2 > rock` → rock.
    pub rock: Option<f64>,
    /// `f3 > forest` → forest (within `forest_lat`).
    pub forest: Option<f64>,
    /// Forest only where `lat < forest_lat`.
    pub forest_lat: Option<f64>,
    /// A ruined settlement facing the aim (centre, cleared rings, roads).
    pub settlement: bool,
}

/// The gameplay table of `BIOMES` (`terrain-biomes.ts`).
pub fn biome(b: TerrainBiome) -> BiomeRules {
    match b {
        TerrainBiome::Mixed => BiomeRules {
            ground: TerrainKind::Grass,
            basin: TerrainKind::Water,
            basin_level: 0.42,
            polar: Some(0.84),
            rock: Some(0.64),
            forest: Some(0.57),
            forest_lat: None,
            settlement: false,
        },
        TerrainBiome::Medieval => BiomeRules {
            ground: TerrainKind::Grass,
            basin: TerrainKind::Water,
            basin_level: 0.36,
            polar: Some(0.88),
            rock: Some(0.67),
            forest: Some(0.55),
            forest_lat: None,
            settlement: true,
        },
        TerrainBiome::Winter => BiomeRules {
            ground: TerrainKind::Snow,
            basin: TerrainKind::Ice,
            basin_level: 0.44,
            polar: None,
            rock: Some(0.66),
            forest: Some(0.6),
            forest_lat: Some(0.7),
            settlement: false,
        },
        TerrainBiome::Dry => BiomeRules {
            ground: TerrainKind::Sand,
            basin: TerrainKind::Dune,
            basin_level: 0.33,
            polar: None,
            rock: Some(0.62),
            forest: None,
            forest_lat: None,
            settlement: false,
        },
    }
}

/// Gameplay rules of a body: the biome's, with the config's overrides (`biomeRules`).
pub fn biome_rules(config: &TerrainConfig) -> BiomeRules {
    let b = biome(config.biome);
    BiomeRules {
        ground: config.ground.map_or(b.ground, TerrainGround::kind),
        basin: config.basin.map_or(b.basin, TerrainBasin::kind),
        basin_level: config.basin_level.unwrap_or(b.basin_level),
        ..b
    }
}

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

/// Class of one tile from three smooth noise fields on its normal plus the latitude (the chain of the
/// module comment, first rule wins; `tileKind`).
pub fn tile_kind(normal: Vec3, seed: f64, rules: &BiomeRules) -> TerrainKind {
    let n = normal;
    let p = |k: f64| vec3(n.x * k + 7.0, n.y * k + 7.0, n.z * k + 7.0);
    let f1 = fbm(seed, p(2.6), OCTAVES);
    let f2 = fbm(seed + 11.0, p(3.4), OCTAVES);
    let f3 = fbm(seed + 23.0, p(4.2), OCTAVES);
    let lat = n.y.abs();
    if f1 < rules.basin_level {
        rules.basin
    } else if rules.polar.is_some_and(|polar| lat > polar) {
        TerrainKind::Snow
    } else if rules.rock.is_some_and(|rock| f2 > rock) {
        TerrainKind::Rock
    } else if rules.forest.is_some_and(|forest| f3 > forest) && rules.forest_lat.is_none_or(|forest_lat| lat < forest_lat) {
        TerrainKind::Forest
    } else {
        rules.ground
    }
}

/// Classes from the noise chain (`tile_kind`), then one fix-up per tile: with `landing_cap`, every tile
/// where `normal.y > landing_cap` becomes the plain ground (the landing zone around the +Y pole);
/// elsewhere a basin becomes the ground on a pentagon and on a deposit tile.
pub fn noise_kinds(grid: &PlanetGrid, config: &TerrainConfig) -> Vec<TerrainKind> {
    let rules = biome_rules(config);
    let cap = config.landing_cap;
    let mut kinds: Vec<TerrainKind> = grid.tiles.iter().map(|t| tile_kind(t.normal, config.seed, &rules)).collect();
    for (i, t) in grid.tiles.iter().enumerate() {
        // the TS has two branches (landing zone, else a basin on a pentagon or a deposit) with the same result
        let landing = cap.is_some_and(|cap| t.normal.y > cap);
        if landing || (kinds[i] == rules.basin && (t.kind == TileKind::Pent || t.deposit.is_some())) {
            kinds[i] = rules.ground;
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

/// The settlement clears its ground: no basin, rock or snow within two rings, no forest in ring 1;
/// cleared tiles become the ground.
pub fn clear_settlement(kinds: &mut [TerrainKind], center: usize, rings: &SettlementRings, rules: &BiomeRules) {
    for &i in std::iter::once(&center).chain(&rings.r1).chain(&rings.r2) {
        if kinds[i] == rules.basin || kinds[i] == TerrainKind::Rock || kinds[i] == TerrainKind::Snow {
            kinds[i] = rules.ground;
        }
    }
    for &i in &rings.r1 {
        if kinds[i] == TerrainKind::Forest {
            kinds[i] = rules.ground;
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

/// Terrain classes and settlement roads of a body. Pure and deterministic. Steps: noise classes with
/// the basin fix-ups (`noise_kinds`) → (biomes with a settlement) centre facing `aim` → clearing within
/// two rings → roads → road tiles become the ground. No basin on a deposit tile or a pentagon, no road
/// on a deposit tile or a pentagon.
pub fn classify_terrain(grid: &PlanetGrid, config: &TerrainConfig, aim: Option<Vec3>) -> TerrainClassification {
    let rules = biome_rules(config);
    let mut kinds = noise_kinds(grid, config);
    let center = if rules.settlement { find_settlement_center(grid, aim.unwrap_or_else(default_aim)) } else { None };
    let Some(center) = center else {
        return TerrainClassification { kinds, road: Vec::new(), settlement_center: None, rings: None };
    };
    let rings = settlement_rings(grid, center);
    clear_settlement(&mut kinds, center, &rings, &rules);
    let roads = settlement_roads(grid, &kinds, center, &rings);
    // a road tile is plain ground
    for &i in &roads {
        kinds[i] = rules.ground;
    }
    TerrainClassification { kinds, road: roads.into_iter().collect(), settlement_center: Some(center), rings: Some(rings) }
}

/// The grid with its terrain: `Tile.terrain` on every tile, `Tile.road` on road tiles and
/// `PlanetGrid.terrain` with the style (the config's keys) and the settlement centre.
pub fn with_terrain(mut grid: PlanetGrid, config: TerrainConfig, aim: Vec3) -> PlanetGrid {
    let c = classify_terrain(&grid, &config, Some(aim));
    for (i, t) in grid.tiles.iter_mut().enumerate() {
        t.terrain = Some(c.kinds[i]);
        t.road = c.road.binary_search(&i).is_ok();
    }
    let TerrainConfig { biome, seed, ground, basin, basin_level, landing_cap } = config;
    grid.terrain = Some(GridTerrain { biome, seed, ground, basin, basin_level, landing_cap, settlement_center: c.settlement_center });
    grid
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::math::goldberg::build_goldberg_grid;
    use crate::sim::scenarios::tau_ceti_scenario;

    #[test]
    fn tau_ceti_c_has_a_settlement_with_roads_and_dried_lakes() {
        let s = tau_ceti_scenario();
        let body = s.bodies.iter().find(|b| b.id == "tc-c").expect("tc-c");
        let sg = body.surface_grid.as_ref().expect("grid");
        let config = sg.terrain.expect("terrain");
        assert_eq!(config, TerrainConfig { basin: Some(TerrainBasin::Dune), ..TerrainConfig::new(TerrainBiome::Medieval, 2.0) });
        let grid = build_goldberg_grid(&body.id, body.radius, sg.frequency, sg.deposit_seed, sg.deposit_weights.as_ref());
        let c = classify_terrain(&grid, &config, Some(terrain_aim(body)));
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
                assert_ne!(c.kinds[i], TerrainKind::Dune);
            }
        }
        // the dried lakes change the basin class and nothing else: same roads, same centre
        let wet = classify_terrain(&grid, &TerrainConfig::new(TerrainBiome::Medieval, 2.0), Some(terrain_aim(body)));
        assert!(c.kinds.contains(&TerrainKind::Dune) && !c.kinds.contains(&TerrainKind::Water));
        let dried: Vec<TerrainKind> = wet.kinds.iter().map(|&k| if k == TerrainKind::Water { TerrainKind::Dune } else { k }).collect();
        assert_eq!(c.kinds, dried);
        assert_eq!((c.road, c.settlement_center), (wet.road, wet.settlement_center));
    }

    #[test]
    fn mixed_has_no_settlement() {
        let grid = build_goldberg_grid("x", 50.0, 5, Some(3.0), None);
        let c = classify_terrain(&grid, &TerrainConfig::new(TerrainBiome::Mixed, 7.0), None);
        assert_eq!(c.settlement_center, None);
        assert!(c.road.is_empty() && c.rings.is_none());
        assert_eq!(c.kinds.len(), grid.tiles.len());
    }

    #[test]
    fn biomes_use_their_classes_and_the_overrides() {
        let grid = build_goldberg_grid("x", 50.0, 6, Some(4.0), None);
        let kinds = |config: TerrainConfig| classify_terrain(&grid, &config, None).kinds;
        let winter = kinds(TerrainConfig::new(TerrainBiome::Winter, 6.0));
        assert!(winter.iter().all(|k| matches!(k, TerrainKind::Snow | TerrainKind::Ice | TerrainKind::Forest | TerrainKind::Rock)));
        assert!(winter.contains(&TerrainKind::Ice) && winter.contains(&TerrainKind::Snow));
        let dry = kinds(TerrainConfig::new(TerrainBiome::Dry, 4.0));
        assert!(dry.iter().all(|k| matches!(k, TerrainKind::Sand | TerrainKind::Dune | TerrainKind::Rock)));
        let regolith = kinds(TerrainConfig { ground: Some(TerrainGround::Regolith), ..TerrainConfig::new(TerrainBiome::Dry, 4.0) });
        let swapped: Vec<TerrainKind> = dry.iter().map(|&k| if k == TerrainKind::Sand { TerrainKind::Regolith } else { k }).collect();
        assert_eq!(regolith, swapped);
        // the landing cap: plain ground around the +Y pole, nothing outside it changes
        let mixed = kinds(TerrainConfig::new(TerrainBiome::Mixed, 5.0));
        let capped = kinds(TerrainConfig { landing_cap: Some(0.6), ..TerrainConfig::new(TerrainBiome::Mixed, 5.0) });
        for (i, t) in grid.tiles.iter().enumerate() {
            let want = if t.normal.y > 0.6 { TerrainKind::Grass } else { mixed[i] };
            assert_eq!(capped[i], want, "tile {i}");
        }
        // fewer basins with a lower basin level
        let lakes = |k: &[TerrainKind]| k.iter().filter(|&&k| k == TerrainKind::Water).count();
        let fewer = kinds(TerrainConfig { basin_level: Some(0.39), ..TerrainConfig::new(TerrainBiome::Mixed, 5.0) });
        assert!(lakes(&fewer) < lakes(&mixed));
    }

    #[test]
    fn config_json_writes_only_the_set_keys_in_the_ts_order() {
        let c = TerrainConfig { basin_level: Some(0.39), landing_cap: Some(0.6), ..TerrainConfig::new(TerrainBiome::Mixed, 5.0) };
        assert_eq!(serde_json::to_string(&c).unwrap(), r#"{"biome":"mixed","seed":5.0,"basinLevel":0.39,"landingCap":0.6}"#);
        let back: TerrainConfig = serde_json::from_str(r#"{"biome":"dry","seed":4,"ground":"regolith"}"#).unwrap();
        assert_eq!(back, TerrainConfig { ground: Some(TerrainGround::Regolith), ..TerrainConfig::new(TerrainBiome::Dry, 4.0) });
        assert!(serde_json::from_str::<TerrainConfig>(r#"{"biome":"dry","seed":4,"ground":"water"}"#).is_err());
    }
}
