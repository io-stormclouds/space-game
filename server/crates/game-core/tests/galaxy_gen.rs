//! Acceptance tests of the galaxy generator (plan 08, stage E1; plan 07 §5). Black box: the public
//! API of `game_core::galaxy::generator` only.
//!
//! Written before the implementation (task E1-01). Every test is ignored with the id of the task
//! that makes it pass: that task removes the `#[ignore]` line of its tests and changes nothing else
//! in this file. The numbers in the assertions are part of the tests (plan 08 §3.2): a statistical
//! test runs on a fixed seed, so it either passes or fails every time; a generator that misses a
//! threshold is reported, the threshold is not moved.

use std::collections::HashSet;
use std::f64::consts::TAU;
use std::sync::LazyLock;

use game_core::economy::catalog;
use game_core::galaxy::generator::*;
use game_core::galaxy::stars::{LY_PER_PARSEC, STARS, Star};
use game_core::math::goldberg::build_goldberg_grid;
use game_core::math::orbit::OrbitSolver;
use game_core::models::body::{BodyKind, BodyProfile, CelestialBody};
use game_core::sim::colony::insolation_of;
use game_core::sim::scenario::build_world_grids;
use serde::Serialize;

// ------------------------------------------------------------------------------------------------
// shared data

const SEED: u64 = 20_261_111;

/// Cells from this x on are thousands of light years from every register star (Deneb, the
/// farthest, is 2615 ly from Sol), so the separation rule removes nothing there.
const FAR_X: i32 = 2_000;

const RATINGS: [&str; 4] = ["zalecana", "średni", "trudny", "wyprawy"];

/// The defaults with the seed of the tests.
fn params() -> GalaxyParams {
    GalaxyParams { seed: SEED, ..GalaxyParams::default() }
}

/// Round shares, far from the defaults: the statistical tests get many stars and systems of every
/// kind, and a generator that ignores its parameters fails.
fn round_params() -> GalaxyParams {
    let mut p = params();
    for c in &mut p.classes {
        // relative weights on purpose: they sum to 10
        c.share = match c.class {
            SpectralClass::O => 0.0,
            SpectralClass::B => 0.5,
            SpectralClass::A => 1.0,
            SpectralClass::F => 2.0,
            SpectralClass::G => 2.5,
            SpectralClass::K => 2.5,
            SpectralClass::M => 1.5,
        };
    }
    p.system.empty_share = 0.25;
    p.system.giant_share = 0.5;
    p.system.belt_share = 0.4;
    p.system.civilization_share = 0.01;
    p.system.rocky_moon_share = 0.25;
    p.system.rocky_moon_count = 1;
    p
}

fn far_cell(i: usize) -> CellCoord {
    CellCoord { x: FAR_X + (i % 100) as i32, y: ((i / 100) % 100) as i32, z: (i / 10_000) as i32 }
}

/// The stars of the first `cells` far cells.
fn far_stars(p: &GalaxyParams, cells: usize) -> Vec<StarSpec> {
    (0..cells).flat_map(|i| stars_in_cell(p, far_cell(i))).collect()
}

/// The first `n` generated systems of the far cells, in a fixed order.
fn far_systems(p: &GalaxyParams, n: usize) -> Vec<SystemSpec> {
    let mut out = Vec::with_capacity(n);
    for i in 0..1_000_000 {
        for star in stars_in_cell(p, far_cell(i)) {
            out.push(generate_system(p, star.key).expect("a generated star has a system"));
            if out.len() == n {
                return out;
            }
        }
    }
    panic!("fewer than {n} stars in a million cells");
}

/// 10 000 systems of `round_params`, generated once for all the tests that read them.
static SYSTEMS: LazyLock<Vec<SystemSpec>> = LazyLock::new(|| far_systems(&round_params(), 10_000));

/// The explicit placement rules of the tests (P-18: the production values are not decided).
const RULES: PlacementParams = PlacementParams { origin_ly: [0.0, 0.0, 0.0], min_ly: 8.0, max_ly: 16.0 };

fn place_many(p: &GalaxyParams, rules: &PlacementParams, n: usize) -> Vec<StarKey> {
    let mut occupied: Vec<StarKey> = Vec::with_capacity(n);
    for i in 0..n {
        let key = place_account(p, &occupied, rules).unwrap_or_else(|| panic!("no start system for account {i}"));
        occupied.push(key);
    }
    occupied
}

/// 500 accounts placed one after another around Sol, each seeing all the earlier ones as occupied.
static PLACED: LazyLock<Vec<StarKey>> = LazyLock::new(|| place_many(&params(), &RULES, 500));

fn json<T: Serialize>(value: &T) -> String {
    serde_json::to_string(value).expect("the generator's data serialises")
}

/// |a − b| within `rel` of the larger of the two.
fn close(a: f64, b: f64, rel: f64) -> bool {
    (a - b).abs() <= rel * a.abs().max(b.abs())
}

fn positive(x: f64) -> bool {
    x.is_finite() && x > 0.0
}

fn inside(b: Bounds, x: f64) -> bool {
    x.is_finite() && b.min <= x && x <= b.max
}

fn distance(a: [f64; 3], b: [f64; 3]) -> f64 {
    ((a[0] - b[0]).powi(2) + (a[1] - b[1]).powi(2) + (a[2] - b[2]).powi(2)).sqrt()
}

fn real_pos(s: &Star) -> [f64; 3] {
    [s.pos.x * LY_PER_PARSEC, s.pos.y * LY_PER_PARSEC, s.pos.z * LY_PER_PARSEC]
}

fn star_at(p: &GalaxyParams, key: StarKey) -> StarSpec {
    stars_in_cell(p, key.cell).into_iter().nth(key.index as usize).unwrap_or_else(|| panic!("no star {key:?}"))
}

fn pearson(a: &[f64], b: &[f64]) -> f64 {
    let n = a.len() as f64;
    let (ma, mb) = (a.iter().sum::<f64>() / n, b.iter().sum::<f64>() / n);
    let (mut sab, mut saa, mut sbb) = (0.0, 0.0, 0.0);
    for (x, y) in a.iter().zip(b) {
        sab += (x - ma) * (y - mb);
        saa += (x - ma) * (x - ma);
        sbb += (y - mb) * (y - mb);
    }
    sab / (saa * sbb).sqrt()
}

/// The six orders of three items.
const ORDERS: [[usize; 3]; 6] = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];

/// Raw materials of the catalog (tiers T0, T0R, T0X).
fn raw_materials() -> HashSet<&'static str> {
    catalog().materials.iter().filter(|m| m.tier.starts_with("T0")).map(|m| m.id.as_str()).collect()
}

/// How far a planet reaches from its orbit: its radius, or its outermost moon.
fn reach(planet: &PlanetSpec) -> f64 {
    planet.moons.iter().map(|m| m.orbit_radius + m.radius).fold(planet.radius, f64::max)
}

fn rocky(spec: &SystemSpec) -> impl Iterator<Item = &PlanetSpec> {
    spec.planets.iter().filter(|p| p.kind == PlanetKind::Rocky)
}

fn giants(spec: &SystemSpec) -> impl Iterator<Item = &PlanetSpec> {
    spec.planets.iter().filter(|p| p.kind == PlanetKind::GasGiant)
}

/// The system has a rocky planet with a moon.
fn has_rocky_moon(spec: &SystemSpec) -> bool {
    rocky(spec).any(|p| !p.moons.is_empty())
}

fn share(count: usize, of: usize) -> f64 {
    count as f64 / of as f64
}

fn check_profile(profile: &BodyProfile, what: &str) {
    assert!(!profile.kind.trim().is_empty(), "{what}: the profile names the kind of the body");
    assert!(RATINGS.contains(&profile.rating.as_str()), "{what}: rating {:?}", profile.rating);
    assert_eq!(profile.shuttle_launch_fuel, None, "{what}: the generator does not invent economy numbers");
    for (material, percent) in &profile.deposits {
        assert!(positive(*percent), "{what}: {material} {percent}");
    }
}

fn check_surface(surface: &SurfaceSpec, deposits: &[DepositParams], what: &str) {
    let seed = surface.deposit_seed;
    assert!(seed.fract() == 0.0 && (0.0..=2_147_483_647.0).contains(&seed), "{what}: deposit seed {seed}");
    assert!(!surface.deposit_weights.is_empty(), "{what}: a surface has at least one deposit material");
    for (material, weight) in &surface.deposit_weights {
        let rule =
            deposits.iter().find(|d| &d.material == material).unwrap_or_else(|| panic!("{what}: {material} is not in the parameters"));
        assert!(*weight > 0.0 && inside(rule.weight, *weight), "{what}: {material} weight {weight}");
    }
}

// ------------------------------------------------------------------------------------------------
// E1-03: keyed random numbers

#[test]
#[ignore = "E1-03"]
fn rng_is_a_pure_function_of_its_key() {
    let draw = |seed: u64, cell: CellCoord, stream: u64| -> Vec<u64> {
        let mut rng = Rng::for_cell(seed, cell, stream);
        (0..1000).map(|_| rng.next_u64()).collect()
    };
    let cell = CellCoord { x: 4, y: -9, z: 1 };
    let base = draw(SEED, cell, 0);
    assert_eq!(base, draw(SEED, cell, 0), "the same key gives the same 1000 numbers");
    let base_set: HashSet<u64> = base.iter().copied().collect();
    assert_eq!(base_set.len(), 1000, "a 64-bit stream does not repeat within 1000 numbers");

    // every part of the key matters, and another key is another stream, not this one shifted
    let others = [
        ("stream", draw(SEED, cell, 1)),
        ("seed", draw(SEED + 1, cell, 0)),
        ("x", draw(SEED, CellCoord { x: 5, ..cell }, 0)),
        ("y", draw(SEED, CellCoord { y: -8, ..cell }, 0)),
        ("z", draw(SEED, CellCoord { z: 2, ..cell }, 0)),
        ("swapped axes", draw(SEED, CellCoord { x: 1, y: -9, z: 4 }, 0)),
        ("negated", draw(SEED, CellCoord { x: -4, y: 9, z: -1 }, 0)),
    ];
    for (what, other) in &others {
        assert_eq!(other.iter().filter(|v| base_set.contains(v)).count(), 0, "{what}: the streams share numbers");
    }

    // no hidden state: a copy continues exactly where the original is
    let mut original = Rng::for_cell(SEED, cell, 7);
    original.next_u64();
    let mut copy = original.clone();
    let from_original: Vec<u64> = (0..10).map(|_| original.next_u64()).collect();
    let from_copy: Vec<u64> = (0..10).map(|_| copy.next_u64()).collect();
    assert_eq!(from_original, from_copy);

    // next_f64 is the top 53 bits of next_u64, in [0, 1)
    let mut bits = Rng::for_cell(SEED, cell, 3);
    let mut unit = bits.clone();
    for _ in 0..1000 {
        let x = unit.next_f64();
        assert!((0.0..1.0).contains(&x));
        assert_eq!(x, (bits.next_u64() >> 11) as f64 / 9_007_199_254_740_992.0);
    }
}

#[test]
#[ignore = "E1-03"]
fn rng_matches_recorded_values() {
    // Computed from the description in `generator/rng.rs` by an independent program (BigInt
    // arithmetic), whose SplitMix64 step was checked against the published sequence for 1234567.
    const RECORDED: [u64; 10] = [
        0x7490_7a61_25f3_62fe,
        0xdfcc_0756_2190_b3ae,
        0xbfe9_7185_f81e_052e,
        0x78d1_65d7_be42_65f1,
        0xb718_dc3b_4f7d_0435,
        0x04f8_6666_2449_d91d,
        0xb68d_3b9f_bd81_e1b5,
        0x68e8_6d04_faef_821a,
        0x9b40_4e33_c3d5_ffb8,
        0x0eaa_225b_414f_5f0b,
    ];
    let key = (0x5eed_cafe_f00d_0001_u64, CellCoord { x: -3, y: 7, z: 12 }, 5_u64);
    let mut rng = Rng::for_cell(key.0, key.1, key.2);
    let drawn: Vec<u64> = (0..10).map(|_| rng.next_u64()).collect();
    assert_eq!(drawn, RECORDED);

    let mut rng = Rng::for_cell(key.0, key.1, key.2);
    let floats: Vec<u64> = (0..4).map(|_| rng.next_f64().to_bits()).collect();
    assert_eq!(floats, [0x3fdd_241e_9849_7cd8, 0x3feb_f980_eac4_3216, 0x3fe7_fd2e_30bf_03c0, 0x3fde_3459_75ef_9098]);
    assert_eq!(Rng::for_cell(key.0, key.1, key.2).next_f64(), 0.455329560010751);

    // the edges of the key space: the zero key, and the largest seed, coordinates and a wide stream
    let mut zero = Rng::for_cell(0, CellCoord { x: 0, y: 0, z: 0 }, 0);
    assert_eq!([zero.next_u64(), zero.next_u64()], [0x78ae_5a9a_6b5f_d45e, 0xb989_5a2b_6859_2df1]);
    let mut edge = Rng::for_cell(u64::MAX, CellCoord { x: i32::MIN, y: i32::MAX, z: -1 }, 0xffff_ffff);
    assert_eq!([edge.next_u64(), edge.next_u64()], [0x255c_773c_7bf3_9178, 0x0b35_c49b_8d82_87a5]);
}

#[test]
#[ignore = "E1-03"]
fn neighbouring_cells_are_uncorrelated() {
    let first = |seed: u64, cell: CellCoord, stream: u64| Rng::for_cell(seed, cell, stream).next_f64();
    type Line = fn(i32) -> CellCoord;
    let axes: [(&str, Line); 4] = [
        ("x", |i| CellCoord { x: i, y: 0, z: 0 }),
        ("y", |i| CellCoord { x: 0, y: i, z: 0 }),
        ("z", |i| CellCoord { x: 0, y: 0, z: i }),
        ("diagonal", |i| CellCoord { x: i, y: -i, z: i }),
    ];
    for seed in [SEED, 0, 1] {
        // the first number of 10 000 cells in a row against the first number of the next cell
        for (name, cell) in axes {
            let here: Vec<f64> = (-5000..5000).map(|i| first(seed, cell(i), 0)).collect();
            let next: Vec<f64> = (-5000..5000).map(|i| first(seed, cell(i + 1), 0)).collect();
            let r = pearson(&here, &next);
            assert!(r.abs() <= 0.05, "seed {seed}, axis {name}: correlation {r}");
            let mean = here.iter().sum::<f64>() / here.len() as f64;
            assert!((mean - 0.5).abs() <= 0.02, "seed {seed}, axis {name}: mean {mean}");
        }
        // two streams of the same cell
        let cell = |i: i32| CellCoord { x: i, y: 3, z: -7 };
        let a: Vec<f64> = (-5000..5000).map(|i| first(seed, cell(i), 0)).collect();
        let b: Vec<f64> = (-5000..5000).map(|i| first(seed, cell(i), 1)).collect();
        let r = pearson(&a, &b);
        assert!(r.abs() <= 0.05, "seed {seed}, streams 0 and 1: correlation {r}");
    }
}

// ------------------------------------------------------------------------------------------------
// E1-04: stars of a cell and the register of 41 stars

#[test]
#[ignore = "E1-04"]
fn same_cell_same_stars_bytes() {
    let p = params();
    let cells =
        [CellCoord { x: 0, y: 0, z: 0 }, CellCoord { x: -1, y: -1, z: -1 }, CellCoord { x: -37, y: 12, z: 5 }, far_cell(0), far_cell(4321)];
    for cell in cells {
        let first = stars_in_cell(&p, cell);
        let second = stars_in_cell(&p, cell);
        assert_eq!(first, second, "{cell:?}");
        let text = json(&first);
        assert_eq!(text, json(&second), "{cell:?}");
        let back: Vec<StarSpec> = serde_json::from_str(&text).expect("the stars read back from JSON");
        assert_eq!(back, first, "{cell:?}: JSON keeps every value");
    }
    // parameters built again are the same parameters; another seed is another galaxy
    assert_eq!(json(&far_stars(&params(), 100)), json(&far_stars(&p, 100)));
    let other = GalaxyParams { seed: SEED + 1, ..params() };
    assert_ne!(json(&far_stars(&other, 100)), json(&far_stars(&p, 100)));
}

#[test]
#[ignore = "E1-04"]
fn order_of_cells_does_not_matter() {
    let p = params();
    // a far cell, its neighbour, and the cell of Sol with register stars in it
    let cells = [far_cell(0), far_cell(1), CellCoord { x: 0, y: 0, z: 0 }];
    let mut results: Vec<[String; 3]> = Vec::new();
    for order in ORDERS {
        let mut texts = [String::new(), String::new(), String::new()];
        for i in order {
            texts[i] = json(&stars_in_cell(&p, cells[i]));
        }
        results.push(texts);
    }
    for (order, texts) in ORDERS.iter().zip(&results) {
        assert_eq!(texts, &results[0], "order {order:?}");
    }
    assert!(results[0].iter().any(|t| t != "[]"), "the three cells are not all empty");
}

/// The class of a register star as `StarSpec::class` documents it.
fn register_class(spectral_class: &str) -> Option<SpectralClass> {
    match spectral_class.chars().next() {
        Some('O') => Some(SpectralClass::O),
        Some('B') => Some(SpectralClass::B),
        Some('A') => Some(SpectralClass::A),
        Some('F') => Some(SpectralClass::F),
        Some('G') => Some(SpectralClass::G),
        Some('K') => Some(SpectralClass::K),
        Some('M') => Some(SpectralClass::M),
        _ => None,
    }
}

/// No generated star within the separation of a register star; returns how many generated stars were looked at.
fn check_separation(p: &GalaxyParams) -> usize {
    let span = (p.min_real_separation_ly / p.cell_ly).ceil() as i32;
    let mut seen = 0;
    for s in STARS.iter() {
        let pos = real_pos(s);
        let home = cell_of(p, pos);
        for dx in -span..=span {
            for dy in -span..=span {
                for dz in -span..=span {
                    let cell = CellCoord { x: home.x + dx, y: home.y + dy, z: home.z + dz };
                    for star in stars_in_cell(p, cell).iter().filter(|x| x.origin == StarOrigin::Generated) {
                        seen += 1;
                        let d = distance(star.pos_ly, pos);
                        assert!(d >= p.min_real_separation_ly * (1.0 - 1e-12), "{:?} is {d} ly from {}", star.key, s.name);
                    }
                }
            }
        }
    }
    seen
}

#[test]
#[ignore = "E1-04"]
fn real_stars_are_kept() {
    let p = params();

    // cells: floor(pos / cell_ly) on each axis
    assert_eq!(cell_of(&p, [0.0, 0.0, 0.0]), CellCoord { x: 0, y: 0, z: 0 });
    assert_eq!(cell_of(&p, [-0.5, 9.99, 10.0]), CellCoord { x: -1, y: 0, z: 1 });
    assert_eq!(cell_of(&p, [25.0, -10.0, -10.01]), CellCoord { x: 2, y: -1, z: -2 });
    let fine = GalaxyParams { cell_ly: 5.0, ..params() };
    assert_eq!(cell_of(&fine, [25.0, -10.0, -10.01]), CellCoord { x: 5, y: -2, z: -3 });

    // each of the 41 stars is in the cell of its position, unchanged
    assert_eq!(STARS.len(), 41);
    let mut cells: Vec<CellCoord> = Vec::new();
    for s in STARS.iter() {
        let pos = real_pos(s);
        let cell = cell_of(&p, pos);
        if !cells.contains(&cell) {
            cells.push(cell);
        }
        let stars = stars_in_cell(&p, cell);
        let found: Vec<&StarSpec> = stars.iter().filter(|x| x.origin == StarOrigin::Real { id: s.id }).collect();
        assert_eq!(found.len(), 1, "{} is once in its cell", s.name);
        let star = found[0];
        assert_eq!(star.name, s.name);
        assert_eq!(star.pos_ly, pos, "{}", s.name);
        assert_eq!(
            (star.luminosity, star.mass, star.radius, star.temperature),
            (s.luminosity, s.mass, s.radius, s.temperature),
            "{}",
            s.name
        );
        assert_eq!(star.class, register_class(&s.spectral_class), "{}", s.name);
        assert_eq!(star.color, u32::from_str_radix(s.color.trim_start_matches('#'), 16).expect("#RRGGBB"), "{}", s.name);
    }

    // the register stars come first in their cell, in register order; the index of a star is its key
    let mut real_total = 0;
    for cell in &cells {
        let stars = stars_in_cell(&p, *cell);
        let real: Vec<usize> = stars
            .iter()
            .filter_map(|x| match x.origin {
                StarOrigin::Real { id } => Some(STARS.iter().position(|s| s.id == id).expect("an id of the register")),
                StarOrigin::Generated => None,
            })
            .collect();
        assert!(stars[..real.len()].iter().all(|x| x.origin != StarOrigin::Generated), "{cell:?}: register stars first");
        assert!(real.windows(2).all(|w| w[0] < w[1]), "{cell:?}: register order");
        for (i, star) in stars.iter().enumerate() {
            assert_eq!(star.key, StarKey { cell: *cell, index: i as u16 });
        }
        real_total += real.len();
    }
    assert_eq!(real_total, 41, "each register star is in exactly one cell");
    assert!(far_stars(&p, 200).iter().all(|x| x.origin == StarOrigin::Generated), "no register star far away");

    // P-17 a: no generated star closer to a register star than the separation; a wider separation holds too
    assert!(check_separation(&p) > 0, "there are generated stars around the register stars");
    let wide = GalaxyParams { min_real_separation_ly: 6.0, ..params() };
    assert!(check_separation(&wide) > 0);
    let wide_cells = GalaxyParams { cell_ly: 4.0, stars_per_cell: 1.0, min_real_separation_ly: 6.0, ..params() };
    assert!(check_separation(&wide_cells) > 0);
}

#[test]
#[ignore = "E1-04"]
fn star_parameters_are_positive() {
    let p = round_params();
    let stars: Vec<StarSpec> = far_stars(&p, 4_000).into_iter().take(10_000).collect();
    assert_eq!(stars.len(), 10_000, "4000 cells of 3 stars hold 10 000 stars");
    let mut index_in_cell = 0;
    for (i, star) in stars.iter().enumerate() {
        index_in_cell = if i > 0 && stars[i - 1].key.cell == star.key.cell { index_in_cell + 1 } else { 0 };
        assert_eq!(star.key.index, index_in_cell, "{:?}", star.key);
        assert_eq!(star.origin, StarOrigin::Generated);
        assert!(!star.name.trim().is_empty(), "{:?} has a designation", star.key);
        let cell = [star.key.cell.x, star.key.cell.y, star.key.cell.z];
        for (coord, at) in cell.into_iter().zip(star.pos_ly) {
            let low = f64::from(coord) * p.cell_ly;
            assert!(low <= at && at < low + p.cell_ly, "{:?} lies outside its cell", star.key);
        }
        let class = star.class.expect("a generated star has a class");
        let rule = p.classes.iter().find(|c| c.class == class).expect("a class of the parameters");
        assert!(rule.share > 0.0, "{class:?} has no share");
        for (what, value, bounds) in [
            ("luminosity", star.luminosity, rule.luminosity),
            ("mass", star.mass, rule.mass),
            ("radius", star.radius, rule.radius),
            ("temperature", star.temperature, rule.temperature),
        ] {
            assert!(positive(value) && inside(bounds, value), "{:?} {class:?}: {what} {value}", star.key);
        }
        assert_eq!(star.color, rule.color);
    }
}

#[test]
#[ignore = "E1-04"]
fn spectral_distribution_within_bounds() {
    for (name, p) in [("defaults", params()), ("round shares", round_params())] {
        let stars = far_stars(&p, 10_000);
        let total: f64 = p.classes.iter().map(|c| c.share).sum();
        for rule in &p.classes {
            let count = stars.iter().filter(|s| s.class == Some(rule.class)).count();
            let expected = rule.share / total;
            let got = share(count, stars.len());
            assert!((got - expected).abs() <= 0.02, "{name}, {:?}: {got:.4} of the stars, the parameters say {expected:.4}", rule.class);
            if rule.share == 0.0 {
                assert_eq!(count, 0, "{name}: {:?} has no share", rule.class);
            }
        }
    }
}

#[test]
#[ignore = "E1-04"]
fn density_matches_the_parameter() {
    for mean in [3.0, 6.0] {
        let p = GalaxyParams { stars_per_cell: mean, ..params() };
        let got = far_stars(&p, 10_000).len() as f64 / 10_000.0;
        assert!((got - mean).abs() <= 0.03 * mean, "{got} stars per cell, the parameter says {mean}");
    }
    let empty = GalaxyParams { stars_per_cell: 0.0, ..params() };
    assert_eq!(far_stars(&empty, 200).len(), 0);

    // neighbouring cells are independent: the number of stars in a cell says nothing about the next one.
    // The first 10 000 far cells are a 100 × 100 sheet: cell i + 1 is the next along x, cell i + 100 along y.
    let p = GalaxyParams { stars_per_cell: 2.5, ..params() };
    let counts: Vec<f64> = (0..10_000).map(|i| stars_in_cell(&p, far_cell(i)).len() as f64).collect();
    let along_x: (Vec<f64>, Vec<f64>) = (0..10_000).filter(|i| i % 100 != 99).map(|i| (counts[i], counts[i + 1])).unzip();
    let along_y: (Vec<f64>, Vec<f64>) = (0..9_900).map(|i| (counts[i], counts[i + 100])).unzip();
    for (axis, (here, next)) in [("x", along_x), ("y", along_y)] {
        let r = pearson(&here, &next);
        assert!(r.abs() <= 0.05, "star counts of neighbouring cells along {axis}: correlation {r}");
    }
}

// ------------------------------------------------------------------------------------------------
// E1-05: the planetary system of a star

#[test]
#[ignore = "E1-05"]
fn same_star_same_system_bytes() {
    let p = params();
    let mut keys: Vec<StarKey> = far_stars(&p, 30).iter().map(|s| s.key).collect();
    // generated stars among the register stars too
    for cell in [CellCoord { x: 3, y: 3, z: 3 }, CellCoord { x: -2, y: 1, z: -4 }] {
        keys.extend(stars_in_cell(&p, cell).iter().filter(|s| s.origin == StarOrigin::Generated).map(|s| s.key));
    }
    assert!(keys.len() >= 50);
    for key in &keys {
        let first = generate_system(&p, *key).expect("a generated star has a system");
        let second = generate_system(&p, *key).expect("a generated star has a system");
        assert_eq!(first, second, "{key:?}");
        let text = json(&first);
        assert_eq!(text, json(&second), "{key:?}");
        let back: SystemSpec = serde_json::from_str(&text).expect("the system reads back from JSON");
        assert_eq!(back, first, "{key:?}: JSON keeps every value");
        assert_eq!(first.star, star_at(&p, *key), "{key:?}: the system is the system of this star");
    }

    // the moons of rocky planets are part of the system: the same bytes too (their share is set here, so a
    // changed default does not empty the sample)
    let mut mooned = params();
    mooned.system.rocky_moon_share = 0.5;
    let with_moons: Vec<SystemSpec> = far_systems(&mooned, 200).into_iter().filter(has_rocky_moon).collect();
    assert!(with_moons.len() >= 20, "half of the rocky planets of 200 systems have a moon, found {} such systems", with_moons.len());
    for first in &with_moons {
        let key = first.star.key;
        let second = generate_system(&mooned, key).expect("a generated star has a system");
        assert_eq!(first, &second, "{key:?}");
        let text = json(first);
        assert_eq!(text, json(&second), "{key:?}");
        let back: SystemSpec = serde_json::from_str(&text).expect("the system reads back from JSON");
        assert_eq!(&back, first, "{key:?}: JSON keeps the moons");
    }

    // another seed: other systems
    let other = GalaxyParams { seed: SEED + 1, ..params() };
    assert_ne!(json(&far_systems(&other, 50)), json(&far_systems(&p, 50)));

    // no system for a register star, and none for a key that names no star
    let sol_cell = CellCoord { x: 0, y: 0, z: 0 };
    let in_sol_cell = stars_in_cell(&p, sol_cell);
    let sol = in_sol_cell.iter().find(|s| s.origin == StarOrigin::Real { id: STARS[0].id }).expect("Sol is in the cell of the origin");
    assert_eq!(generate_system(&p, sol.key), None);
    assert_eq!(generate_system(&p, StarKey { cell: sol_cell, index: in_sol_cell.len() as u16 }), None);
    assert_eq!(generate_system(&p, StarKey { cell: far_cell(0), index: u16::MAX }), None);
}

#[test]
#[ignore = "E1-05"]
fn systems_do_not_depend_on_generation_order() {
    let mut p = params();
    // moons of rocky planets take part: half of the planets have one here, whatever the default is
    p.system.rocky_moon_share = 0.5;
    // two stars of one cell and a star of another cell, whose system has a rocky planet with a moon
    let pair = (0..10_000).map(far_cell).find(|c| stars_in_cell(&p, *c).len() >= 2).expect("a far cell with two stars");
    let first_has_moon = |c: &CellCoord| generate_system(&p, StarKey { cell: *c, index: 0 }).is_some_and(|s| has_rocky_moon(&s));
    let lone = (0..10_000)
        .map(far_cell)
        .find(|c| *c != pair && first_has_moon(c))
        .expect("another far cell whose first star has a rocky planet with a moon");
    let keys = [StarKey { cell: pair, index: 0 }, StarKey { cell: pair, index: 1 }, StarKey { cell: lone, index: 0 }];
    let mut results: Vec<[String; 3]> = Vec::new();
    for (round, order) in ORDERS.iter().enumerate() {
        let mut texts = [String::new(), String::new(), String::new()];
        for &i in order {
            // other work in between must not matter either
            if round % 2 == 1 {
                let _ = stars_in_cell(&p, far_cell(500 + round));
                let _ = generate_system(&p, StarKey { cell: far_cell(700 + round), index: 0 });
            }
            texts[i] = json(&generate_system(&p, keys[i]).expect("a generated star has a system"));
        }
        results.push(texts);
    }
    for (order, texts) in ORDERS.iter().zip(&results) {
        assert_eq!(texts, &results[0], "order {order:?}");
    }
    assert_ne!(results[0][0], results[0][1], "two stars of one cell have their own systems");
}

#[test]
#[ignore = "E1-05"]
fn orbits_strictly_increase() {
    let p = round_params();
    let rules = &p.system;
    for spec in SYSTEMS.iter() {
        let key = spec.star.key;
        assert!(spec.planets.len() <= rules.max_planets as usize, "{key:?}: {} planets", spec.planets.len());
        assert!(inside(rules.star_body_radius, spec.star_body_radius), "{key:?}: star body {}", spec.star_body_radius);
        let mut edge = spec.star_body_radius;
        for (i, planet) in spec.planets.iter().enumerate() {
            assert!(inside(rules.orbit_radius, planet.orbit_radius), "{key:?} planet {i}: orbit {}", planet.orbit_radius);
            if i > 0 {
                let inner = &spec.planets[i - 1];
                assert!(planet.orbit_radius > inner.orbit_radius, "{key:?} planet {i}: orbits grow");
                assert!(planet.orbit_speed < inner.orbit_speed, "{key:?} planet {i}: a farther planet is slower");
            }
            // no two bodies touch: the star, then each planet with its moons
            assert!(planet.orbit_radius - reach(planet) > edge, "{key:?} planet {i} touches the body inside its orbit");
            edge = planet.orbit_radius + reach(planet);

            let mut moon_edge = planet.radius;
            for (j, moon) in planet.moons.iter().enumerate() {
                assert!(moon.orbit_radius - moon.radius > moon_edge, "{key:?} planet {i} moon {j} touches the body inside its orbit");
                moon_edge = moon.orbit_radius + moon.radius;
                if j > 0 {
                    assert!(moon.orbit_speed < planet.moons[j - 1].orbit_speed, "{key:?} planet {i} moon {j}: a farther moon is slower");
                }
            }
        }
        if let Some(belt) = &spec.belt {
            assert!(inside(rules.orbit_radius, belt.orbit_radius), "{key:?}: belt orbit {}", belt.orbit_radius);
        }
    }
    assert!(SYSTEMS.iter().any(|s| s.planets.len() >= 3), "some systems have three planets or more");
}

#[test]
#[ignore = "E1-05"]
fn insolation_follows_luminosity() {
    let expected = |luminosity: f64, orbit: f64| luminosity * (900.0 / orbit) * (900.0 / orbit);
    let mut checked = 0;
    for spec in SYSTEMS.iter() {
        let luminosity = spec.star.luminosity;
        for (i, planet) in spec.planets.iter().enumerate() {
            let want = expected(luminosity, planet.orbit_radius);
            assert!(positive(planet.insolation), "{:?} planet {i}: insolation {}", spec.star.key, planet.insolation);
            assert!(
                (planet.insolation - want).abs() <= 1e-9 * planet.insolation,
                "{:?} planet {i}: {} vs {want}",
                spec.star.key,
                planet.insolation
            );
            checked += 1;
        }
        if let Some(belt) = &spec.belt {
            let want = expected(luminosity, belt.orbit_radius);
            assert!((belt.insolation - want).abs() <= 1e-9 * belt.insolation, "{:?} belt: {} vs {want}", spec.star.key, belt.insolation);
        }
    }
    assert!(checked >= 7_000, "three quarters of 10 000 systems have planets, found {checked} planets");
}

#[test]
#[ignore = "E1-05"]
fn no_zero_or_negative_parameters() {
    let p = round_params();
    let rules = &p.system;
    let mut frequencies: HashSet<u32> = HashSet::new();
    for spec in SYSTEMS.iter() {
        let key = spec.star.key;
        assert_eq!(spec.star.origin, StarOrigin::Generated);
        assert!(positive(spec.star_body_radius));
        for (i, planet) in spec.planets.iter().enumerate() {
            let what = format!("{key:?} planet {i}");
            assert!(positive(planet.radius) && positive(planet.orbit_radius) && positive(planet.orbit_speed), "{what}");
            assert!((0.0..TAU).contains(&planet.initial_angle), "{what}: angle {}", planet.initial_angle);
            assert!(planet.color <= 0xff_ffff, "{what}");
            check_profile(&planet.profile, &what);
            match planet.kind {
                PlanetKind::Rocky => {
                    let surface = planet.surface.as_ref().unwrap_or_else(|| panic!("{what}: a rocky planet has a surface"));
                    let n = surface.grid_frequency;
                    assert!(rules.grid_frequency.min <= n && n <= rules.grid_frequency.max, "{what}: grid frequency {n}");
                    assert!(
                        close(planet.radius, rules.radius_per_frequency * f64::from(n), 1e-12),
                        "{what}: radius {} at n = {n}",
                        planet.radius
                    );
                    // no moon, or exactly as many as the parameters say; such a moon has no surface in the pilot
                    let moons = planet.moons.len() as u32;
                    assert!(moons == 0 || moons == rules.rocky_moon_count, "{what}: {moons} moons");
                    assert!(planet.moons.iter().all(|m| m.surface.is_none()), "{what}: the moon of a rocky planet has a surface");
                    frequencies.insert(n);
                }
                PlanetKind::GasGiant => {
                    assert!(planet.surface.is_none(), "{what}: a gas giant has no surface");
                    assert!(inside(rules.giant_radius, planet.radius), "{what}: radius {}", planet.radius);
                    let moons = planet.moons.len() as u32;
                    assert!(rules.giant_moons.min <= moons && moons <= rules.giant_moons.max, "{what}: {moons} moons");
                }
            }
            for (j, moon) in planet.moons.iter().enumerate() {
                let what = format!("{what} moon {j}");
                assert!(positive(moon.radius) && positive(moon.orbit_radius) && positive(moon.orbit_speed), "{what}");
                assert!((0.0..TAU).contains(&moon.initial_angle), "{what}: angle {}", moon.initial_angle);
                assert!(moon.color <= 0xff_ffff, "{what}");
                check_profile(&moon.profile, &what);
                if let Some(surface) = &moon.surface {
                    assert!(1 <= surface.grid_frequency && surface.grid_frequency <= rules.grid_frequency.max, "{what}: grid frequency");
                    frequencies.insert(surface.grid_frequency);
                }
            }
        }
        if let Some(belt) = &spec.belt {
            let what = format!("{key:?} belt");
            assert!(positive(belt.radius) && positive(belt.orbit_radius) && positive(belt.orbit_speed), "{what}");
            assert!((0.0..TAU).contains(&belt.initial_angle), "{what}: angle {}", belt.initial_angle);
            assert!(belt.color <= 0xff_ffff, "{what}");
            check_profile(&belt.profile, &what);
        }
    }
    // every frequency in use is one `build_goldberg_grid` builds: 10·n² + 2 tiles
    assert!(!frequencies.is_empty());
    for n in frequencies {
        let grid = build_goldberg_grid("probe", rules.radius_per_frequency * f64::from(n), n as usize, None, None);
        assert_eq!(grid.tiles.len(), (10 * n * n + 2) as usize, "n = {n}");
    }
}

#[test]
#[ignore = "E1-05"]
fn system_type_distribution_within_bounds() {
    let p = round_params();
    let rules = &p.system;
    let systems = &*SYSTEMS;
    assert_eq!(systems.len(), 10_000);

    // systems without planets: 25 % ± 2 points
    let empty = share(systems.iter().filter(|s| s.planets.is_empty()).count(), systems.len());
    assert!(
        (empty - rules.empty_share).abs() <= 0.02,
        "{empty:.4} of the systems have no planet, the parameters say {}",
        rules.empty_share
    );

    // gas giants (P-47 a): only around the classes of the parameters, beyond the snow line; half of those systems ± 2.5 points
    let allowed = |s: &SystemSpec| s.star.class.is_some_and(|c| rules.giant_classes.contains(&c));
    let candidates: Vec<&SystemSpec> = systems.iter().filter(|s| allowed(s)).collect();
    assert!(candidates.len() >= 6_500, "about 70 % of the stars are F, G or K: {}", candidates.len());
    let with_giant = share(candidates.iter().filter(|s| giants(s).next().is_some()).count(), candidates.len());
    assert!(
        (with_giant - rules.giant_share).abs() <= 0.025,
        "{with_giant:.4} of the F, G, K systems hold a giant, the parameters say {}",
        rules.giant_share
    );
    for spec in systems {
        for giant in giants(spec) {
            assert!(allowed(spec), "{:?}: a gas giant around a star of class {:?}", spec.star.key, spec.star.class);
            assert!(giant.insolation < rules.snow_line_insolation, "{:?}: a gas giant inside the snow line", spec.star.key);
            assert!(!giant.native_civilization, "{:?}: a civilisation on a gas giant", spec.star.key);
        }
    }

    // native civilisation (Q36 a): 1 % ± 0.3 points of the systems; one rocky home planet
    let civilised = share(systems.iter().filter(|s| s.planets.iter().any(|p| p.native_civilization)).count(), systems.len());
    assert!(
        (civilised - rules.civilization_share).abs() <= 0.003,
        "{civilised:.4} of the systems have a civilisation, the parameters say {}",
        rules.civilization_share
    );
    for spec in systems {
        assert!(spec.planets.iter().filter(|p| p.native_civilization).count() <= 1, "{:?}: two civilisations", spec.star.key);
    }

    // belts: 40 % ± 2 points
    let belts = share(systems.iter().filter(|s| s.belt.is_some()).count(), systems.len());
    assert!((belts - rules.belt_share).abs() <= 0.02, "{belts:.4} of the systems have a belt, the parameters say {}", rules.belt_share);

    // two stars of one cell draw their systems independently: both are empty in 25 % of 25 % of such pairs, ± 2.5 points
    let pairs: Vec<&[SystemSpec]> =
        systems.windows(2).filter(|w| w[0].star.key.index == 0 && w[1].star.key.cell == w[0].star.key.cell).collect();
    assert!(pairs.len() >= 2_000, "most cells hold two stars or more: {} pairs", pairs.len());
    let both_empty = share(pairs.iter().filter(|w| w[0].planets.is_empty() && w[1].planets.is_empty()).count(), pairs.len());
    let independent = rules.empty_share * rules.empty_share;
    assert!(
        (both_empty - independent).abs() <= 0.025,
        "both systems of a cell are empty in {both_empty:.4} of the pairs, independent draws give {independent:.4}"
    );

    // the shares follow the parameters: the defaults give other numbers
    let defaults = params();
    let systems = far_systems(&defaults, 10_000);
    let empty = share(systems.iter().filter(|s| s.planets.is_empty()).count(), systems.len());
    assert!((empty - defaults.system.empty_share).abs() <= 0.02, "defaults: {empty:.4} of the systems have no planet");
    let belts = share(systems.iter().filter(|s| s.belt.is_some()).count(), systems.len());
    assert!((belts - defaults.system.belt_share).abs() <= 0.02, "defaults: {belts:.4} of the systems have a belt");
}

#[test]
#[ignore = "E1-05"]
fn rocky_moon_share_within_bounds() {
    let p = round_params();
    let rules = &p.system;
    let count = rules.rocky_moon_count as usize;
    assert!(count >= 1 && rules.rocky_moon_share > 0.0 && rules.rocky_moon_share < 1.0, "the round parameters give some planets moons");

    // a rocky planet has no moon or exactly `rocky_moon_count`; a quarter of them have, ± 2.5 points
    let planets: Vec<&PlanetSpec> = SYSTEMS.iter().flat_map(rocky).collect();
    // a system with planets and no gas giant has a rocky planet: at least 75 % − 35 % of the systems
    assert!(planets.len() >= 3_500, "10 000 systems hold thousands of rocky planets, found {}", planets.len());
    for planet in &planets {
        assert!(planet.moons.is_empty() || planet.moons.len() == count, "a rocky planet with {} moons", planet.moons.len());
        assert!(planet.moons.iter().all(|m| m.surface.is_none()), "the moon of a rocky planet has no surface in the pilot");
    }
    let with_moon = share(planets.iter().filter(|p| !p.moons.is_empty()).count(), planets.len());
    assert!(
        (with_moon - rules.rocky_moon_share).abs() <= 0.025,
        "{with_moon:.4} of the rocky planets have a moon, the parameters say {}",
        rules.rocky_moon_share
    );

    // each planet draws on its own: the first two rocky planets of a system both have a moon in share² of
    // the systems, ± 3 points. The contract does not say how many systems hold two rocky planets, so the
    // check needs a sample that makes ± 3 points four standard deviations.
    let pairs: Vec<(&PlanetSpec, &PlanetSpec)> = SYSTEMS
        .iter()
        .filter_map(|s| {
            let mut planets = rocky(s);
            Some((planets.next()?, planets.next()?))
        })
        .collect();
    if pairs.len() >= 1_000 {
        let both = share(pairs.iter().filter(|(a, b)| !a.moons.is_empty() && !b.moons.is_empty()).count(), pairs.len());
        let independent = rules.rocky_moon_share * rules.rocky_moon_share;
        assert!(
            (both - independent).abs() <= 0.03,
            "both planets have a moon in {both:.4} of {} systems, independent draws give {independent:.4}",
            pairs.len()
        );
    }

    // the parameters decide: share 0 gives no moon to a rocky planet and leaves the giants' moons alone
    let mut never = params();
    never.system.rocky_moon_share = 0.0;
    let systems = far_systems(&never, 1_000);
    // the defaults leave four systems in five with planets, and giants only around the rarer classes
    assert!(systems.iter().flat_map(rocky).count() >= 500, "1000 systems hold hundreds of rocky planets");
    for spec in &systems {
        assert!(rocky(spec).all(|planet| planet.moons.is_empty()), "{:?}: share 0, yet a rocky planet has a moon", spec.star.key);
        for giant in giants(spec) {
            let moons = giant.moons.len() as u32;
            assert!(
                never.system.giant_moons.min <= moons && moons <= never.system.giant_moons.max,
                "{:?}: a giant with {moons} moons",
                spec.star.key
            );
        }
    }

    // share 1 and two moons: every rocky planet has exactly two, and nothing touches
    let mut always = params();
    always.system.rocky_moon_share = 1.0;
    always.system.rocky_moon_count = 2;
    let systems = far_systems(&always, 1_000);
    let mut seen = 0;
    for spec in &systems {
        let key = spec.star.key;
        let mut edge = spec.star_body_radius;
        for (i, planet) in spec.planets.iter().enumerate() {
            assert!(planet.orbit_radius - reach(planet) > edge, "{key:?} planet {i} touches the body inside its orbit");
            edge = planet.orbit_radius + reach(planet);
            if planet.kind != PlanetKind::Rocky {
                continue;
            }
            assert_eq!(planet.moons.len(), 2, "{key:?} planet {i}: share 1 and two moons");
            let mut moon_edge = planet.radius;
            for (j, moon) in planet.moons.iter().enumerate() {
                let what = format!("{key:?} planet {i} moon {j}");
                assert!(positive(moon.radius) && positive(moon.orbit_radius) && positive(moon.orbit_speed), "{what}");
                assert!(moon.orbit_radius - moon.radius > moon_edge, "{what} touches the body inside its orbit");
                moon_edge = moon.orbit_radius + moon.radius;
                assert!(moon.surface.is_none(), "{what}: no surface in the pilot");
            }
            seen += 1;
        }
    }
    assert!(seen >= 500, "1000 systems hold hundreds of rocky planets, found {seen}");
}

#[test]
#[ignore = "E1-05"]
fn deposit_weights_use_catalog_materials() {
    let raw = raw_materials();
    assert!(raw.contains("FER") && raw.contains("PLA") && !raw.contains("STA"), "raw materials are the T0 tiers of the catalog");

    // the parameters name raw materials only, and never regolith (every tile without a deposit)
    let p = round_params();
    for rule in p.system.deposits.iter().chain(&p.system.belt_deposits) {
        assert!(raw.contains(rule.material.as_str()) && rule.material != "REG", "{} in the parameters", rule.material);
    }

    let mut surfaces = 0;
    for spec in SYSTEMS.iter() {
        let key = spec.star.key;
        for (i, planet) in spec.planets.iter().enumerate() {
            let what = format!("{key:?} planet {i}");
            for material in planet.profile.deposits.keys() {
                assert!(raw.contains(material.as_str()), "{what}: the profile lists {material}");
            }
            if let Some(surface) = &planet.surface {
                check_surface(surface, &p.system.deposits, &what);
                for material in surface.deposit_weights.keys() {
                    assert!(planet.profile.deposits.contains_key(material), "{what}: the scan profile does not list {material}");
                }
                surfaces += 1;
            }
            for (j, moon) in planet.moons.iter().enumerate() {
                let what = format!("{what} moon {j}");
                for material in moon.profile.deposits.keys() {
                    assert!(raw.contains(material.as_str()), "{what}: the profile lists {material}");
                }
                if let Some(surface) = &moon.surface {
                    check_surface(surface, &p.system.deposits, &what);
                }
            }
        }
        if let Some(belt) = &spec.belt {
            for material in belt.profile.deposits.keys() {
                assert!(p.system.belt_deposits.iter().any(|d| &d.material == material), "{key:?} belt: the profile lists {material}");
            }
        }
    }
    // a system with planets and no gas giant has a rocky planet: at least 75 % − 35 % of the systems
    assert!(surfaces >= 3_500, "10 000 systems hold thousands of rocky planets, found {surfaces}");

    // the shares of the parameters decide what a planet holds: always, never, sometimes
    let mut chosen = params();
    for rule in &mut chosen.system.deposits {
        rule.share = match rule.material.as_str() {
            "FER" => 1.0,
            "URA" => 0.0,
            _ => 0.5,
        };
    }
    let systems = far_systems(&chosen, 2_000);
    let planets: Vec<&PlanetSpec> = systems.iter().flat_map(rocky).collect();
    assert!(planets.len() >= 1_000);
    let holding =
        |material: &str| planets.iter().filter(|p| p.surface.as_ref().is_some_and(|s| s.deposit_weights.contains_key(material))).count();
    assert_eq!(holding("FER"), planets.len(), "share 1: on every rocky planet");
    assert_eq!(holding("URA"), 0, "share 0: on none");
    let sil = share(holding("SIL"), planets.len());
    assert!((sil - 0.5).abs() <= 0.06, "share 0.5: SIL on {sil:.3} of the rocky planets");
}

// ------------------------------------------------------------------------------------------------
// E1-06: the habitable zone as a calculation

#[test]
#[ignore = "E1-06"]
fn habitable_zone_scales_with_sqrt_luminosity() {
    // insolation 1 at 900 around 1 L☉; a quarter of it twice as far
    let limits = ZoneLimits { inner_insolation: 1.0, outer_insolation: 0.25 };
    let sun = habitable_zone(&limits, 1.0);
    assert!(close(sun.inner, 900.0, 1e-12) && close(sun.outer, 1800.0, 1e-12), "{sun:?}");

    // four times the luminosity: both edges twice as far
    for limits in [limits, ZoneLimits::default(), ZoneLimits { inner_insolation: 2.5, outer_insolation: 0.1 }] {
        for luminosity in [0.0005, 0.01, 0.52, 1.0, 3.7, 25.0, 30_000.0] {
            let zone = habitable_zone(&limits, luminosity);
            let brighter = habitable_zone(&limits, 4.0 * luminosity);
            assert!(close(brighter.inner, 2.0 * zone.inner, 1e-12), "inner edge at {luminosity} L☉");
            assert!(close(brighter.outer, 2.0 * zone.outer, 1e-12), "outer edge at {luminosity} L☉");
            assert!(positive(zone.inner) && zone.inner < zone.outer, "{zone:?}");
            // the edges are where the insolation equals the limits
            assert!(close(luminosity * (900.0 / zone.inner).powi(2), limits.inner_insolation, 1e-12));
            assert!(close(luminosity * (900.0 / zone.outer).powi(2), limits.outer_insolation, 1e-12));
        }
    }

    // labels: the edges belong to the zone
    let zone = HabitableZone { inner: 900.0, outer: 1800.0 };
    assert_eq!(zone.label(899.999), ZoneLabel::Hot);
    assert_eq!(zone.label(900.0), ZoneLabel::Habitable);
    assert_eq!(zone.label(1300.0), ZoneLabel::Habitable);
    assert_eq!(zone.label(1800.0), ZoneLabel::Habitable);
    assert_eq!(zone.label(1800.001), ZoneLabel::Cold);
}

#[test]
#[ignore = "E1-06"]
fn zone_labels_match_orbits() {
    let mut seen: HashSet<ZoneLabel> = HashSet::new();
    for limits in [ZoneLimits::default(), ZoneLimits { inner_insolation: 2.0, outer_insolation: 0.5 }] {
        for spec in SYSTEMS.iter().take(2_000) {
            let zone = habitable_zone(&limits, spec.star.luminosity);
            let labels = spec.planet_zones(&limits);
            assert_eq!(labels.len(), spec.planets.len(), "{:?}: one label per planet", spec.star.key);
            for (i, (planet, label)) in spec.planets.iter().zip(&labels).enumerate() {
                let what = format!("{:?} planet {i}", spec.star.key);
                let by_orbit = if planet.orbit_radius < zone.inner {
                    ZoneLabel::Hot
                } else if planet.orbit_radius > zone.outer {
                    ZoneLabel::Cold
                } else {
                    ZoneLabel::Habitable
                };
                assert_eq!(*label, by_orbit, "{what}: orbit {} in {zone:?}", planet.orbit_radius);
                assert_eq!(zone.label(planet.orbit_radius), by_orbit, "{what}");
                // the same through the insolation, away from the edges
                if planet.insolation > limits.inner_insolation * (1.0 + 1e-9) {
                    assert_eq!(*label, ZoneLabel::Hot, "{what}: insolation {}", planet.insolation);
                } else if planet.insolation < limits.outer_insolation * (1.0 - 1e-9) {
                    assert_eq!(*label, ZoneLabel::Cold, "{what}: insolation {}", planet.insolation);
                } else if planet.insolation < limits.inner_insolation * (1.0 - 1e-9)
                    && planet.insolation > limits.outer_insolation * (1.0 + 1e-9)
                {
                    assert_eq!(*label, ZoneLabel::Habitable, "{what}: insolation {}", planet.insolation);
                }
                seen.insert(*label);
            }
        }
    }
    assert_eq!(seen.len(), 3, "2000 systems have hot, habitable and cold planets: {seen:?}");
}

// ------------------------------------------------------------------------------------------------
// E1-07: conversion to world bodies

/// The bodies of a system with the structure `system_bodies` documents checked: the star, the rocky planets, the belt
/// (no gas giant and no moon, of a giant or of a rocky planet).
fn checked_bodies(spec: &SystemSpec) -> Vec<CelestialBody> {
    let key = spec.star.key;
    let bodies = system_bodies(spec);
    let planets: Vec<&PlanetSpec> = rocky(spec).collect();
    assert_eq!(bodies.len(), 1 + planets.len() + usize::from(spec.belt.is_some()), "{key:?}: the star, the rocky planets, the belt");

    let ids: HashSet<&str> = bodies.iter().map(|b| b.id.as_str()).collect();
    assert_eq!(ids.len(), bodies.len(), "{key:?}: ids are unique");
    for body in &bodies {
        assert!(!body.id.is_empty() && !body.name.trim().is_empty(), "{key:?}: every body has an id and a name");
        assert!(!body.is_home_base && body.resources.is_none() && body.shape.is_none(), "{key:?} {}", body.id);
        assert!(body.revealed.is_none() && body.unknown_name.is_none(), "{key:?} {}: the scan state is not the generator's", body.id);
    }

    let star = &bodies[0];
    assert_eq!((star.kind, star.parent_id.as_deref()), (BodyKind::Star, None), "{key:?}: the star comes first");
    assert_eq!((star.name.as_str(), star.color), (spec.star.name.as_str(), spec.star.color));
    assert_eq!((star.radius, star.orbit_radius, star.luminosity), (spec.star_body_radius, 0.0, Some(spec.star.luminosity)));
    assert!(star.surface_grid.is_none());

    for (i, planet) in planets.iter().enumerate() {
        let body = &bodies[1 + i];
        let what = format!("{key:?} body {}", body.id);
        assert_eq!((body.kind, body.parent_id.as_deref()), (BodyKind::Planet, Some(star.id.as_str())), "{what}");
        assert_eq!(
            (body.orbit_radius, body.orbit_speed, body.initial_angle),
            (planet.orbit_radius, planet.orbit_speed, planet.initial_angle),
            "{what}"
        );
        assert_eq!((body.radius, body.color, body.atmosphere), (planet.radius, planet.color, Some(planet.atmosphere)), "{what}");
        assert_eq!(body.profile.as_ref(), Some(&planet.profile), "{what}");
        let surface = planet.surface.as_ref().expect("a rocky planet has a surface");
        let grid = body.surface_grid.as_ref().unwrap_or_else(|| panic!("{what}: a rocky planet has a grid"));
        assert_eq!((grid.frequency, grid.deposit_seed), (surface.grid_frequency as usize, Some(surface.deposit_seed)), "{what}");
        assert_eq!(grid.deposit_weights.as_ref(), Some(&surface.deposit_weights), "{what}");
        assert!(grid.terrain.is_none(), "{what}: terrain is not the pilot's");
        assert!(body.insolation.is_none_or(|i| i == planet.insolation), "{what}: insolation {:?}", body.insolation);
    }

    if let Some(belt) = &spec.belt {
        let body = bodies.last().expect("the belt is the last body");
        let what = format!("{key:?} belt {}", body.id);
        assert_eq!((body.kind, body.parent_id.as_deref()), (BodyKind::Belt, Some(star.id.as_str())), "{what}");
        assert_eq!(
            (body.orbit_radius, body.orbit_speed, body.initial_angle),
            (belt.orbit_radius, belt.orbit_speed, belt.initial_angle),
            "{what}"
        );
        assert_eq!((body.radius, body.color), (belt.radius, belt.color), "{what}");
        assert_eq!(body.profile.as_ref(), Some(&belt.profile), "{what}");
        assert!(body.surface_grid.is_none(), "{what}: nothing is built on a belt");
        assert!(body.insolation.is_none_or(|i| i == belt.insolation), "{what}: insolation {:?}", body.insolation);
    }
    bodies
}

#[test]
#[ignore = "E1-07"]
fn generated_bodies_feed_the_orbit_solver() {
    let mut with_giant = 0;
    let mut with_rocky_moon = 0;
    for spec in SYSTEMS.iter().take(1_000) {
        let bodies = checked_bodies(spec);
        assert_eq!(json(&bodies), json(&system_bodies(spec)), "{:?}: the same spec gives the same bodies", spec.star.key);
        let solver = OrbitSolver::new(&bodies);
        for body in &bodies {
            for t in [0.0, 10_000.0] {
                let pos = solver.world_position(&body.id, t);
                assert!(pos.x.is_finite() && pos.y.is_finite() && pos.z.is_finite(), "{:?} {} at t = {t}: {pos:?}", spec.star.key, body.id);
                let from_star = (pos.x * pos.x + pos.y * pos.y + pos.z * pos.z).sqrt();
                assert!(
                    close(from_star, body.orbit_radius, 1e-9) || body.orbit_radius == 0.0,
                    "{:?} {} at t = {t}",
                    spec.star.key,
                    body.id
                );
            }
        }
        with_giant += usize::from(giants(spec).next().is_some());
        with_rocky_moon += usize::from(has_rocky_moon(spec));
    }
    assert!(with_giant > 0, "the 1000 systems include systems with gas giants, which are left out of the bodies");
    assert!(with_rocky_moon > 0, "the 1000 systems include rocky planets with moons, which are left out of the bodies too");
}

#[test]
#[ignore = "E1-07"]
fn default_insolation_equals_the_spec() {
    let mut checked = 0;
    for spec in SYSTEMS.iter().take(1_000) {
        let bodies = system_bodies(spec);
        // the default rule alone: no body carries an explicit insolation
        let mut bare = bodies.clone();
        for body in &mut bare {
            body.insolation = None;
        }
        let expected: Vec<f64> = rocky(spec).map(|p| p.insolation).chain(spec.belt.iter().map(|b| b.insolation)).collect();
        assert_eq!(expected.len(), bodies.len() - 1);
        for (i, want) in expected.iter().enumerate() {
            let id = &bodies[1 + i].id;
            let as_converted = insolation_of(&bodies, id);
            let by_default = insolation_of(&bare, id);
            assert!(close(as_converted, *want, 1e-9), "{:?} {id}: {as_converted} vs the spec's {want}", spec.star.key);
            assert!(close(by_default, *want, 1e-9), "{:?} {id}: the default rule gives {by_default}, the spec says {want}", spec.star.key);
            checked += 1;
        }
    }
    assert!(checked >= 500, "1000 systems hold hundreds of rocky planets and belts, found {checked}");
}

#[test]
#[ignore = "E1-07"]
fn grids_build_for_every_landable_body() {
    let mut built = 0;
    for spec in SYSTEMS.iter().filter(|s| rocky(s).next().is_some()).take(60) {
        let bodies = system_bodies(spec);
        let grids = build_world_grids(&bodies);
        let planets: Vec<&PlanetSpec> = rocky(spec).collect();
        assert_eq!(grids.len(), planets.len(), "{:?}: one grid per rocky planet", spec.star.key);
        for (i, planet) in planets.iter().enumerate() {
            let body = &bodies[1 + i];
            let surface = planet.surface.as_ref().expect("a rocky planet has a surface");
            let n = surface.grid_frequency as usize;
            let grid = grids.get(&body.id).unwrap_or_else(|| panic!("{:?}: no grid for {}", spec.star.key, body.id));
            assert_eq!(grid.tiles.len(), 10 * n * n + 2, "{:?} {}: tiles at n = {n}", spec.star.key, body.id);
            for tile in &grid.tiles {
                if let Some(deposit) = &tile.deposit {
                    assert!(
                        surface.deposit_weights.contains_key(&deposit.resource),
                        "{:?} {}: a deposit of {}",
                        spec.star.key,
                        body.id,
                        deposit.resource
                    );
                }
            }
            built += 1;
        }
    }
    assert!(built >= 60, "60 systems with rocky planets hold at least 60 grids, built {built}");
}

// ------------------------------------------------------------------------------------------------
// E1-08: placement of new accounts

#[test]
#[ignore = "E1-08"]
fn placement_is_deterministic() {
    let p = params();
    let first = place_many(&p, &RULES, 40);
    let second = place_many(&params(), &RULES, 40);
    assert_eq!(first, second, "the same accounts get the same stars");
    assert_eq!(first[..], PLACED[..40], "the start of a longer run is the same run");

    // the set of occupied stars decides, not the order they are listed in
    let next = place_account(&p, &first, &RULES);
    assert!(next.is_some());
    let mut orders: Vec<Vec<StarKey>> = (1..first.len())
        .map(|by| {
            let mut rotated = first.clone();
            rotated.rotate_left(by);
            rotated
        })
        .collect();
    let mut reversed = first.clone();
    reversed.reverse();
    orders.push(reversed);
    let mut sorted = first.clone();
    sorted.sort();
    orders.push(sorted);
    for (i, order) in orders.iter().enumerate() {
        assert_eq!(place_account(&p, order, &RULES), next, "order {i} of the same occupied stars");
    }
    // a star listed twice is still one occupied star
    let mut doubled = first.clone();
    doubled.extend_from_slice(&first[..10]);
    assert_eq!(place_account(&p, &doubled, &RULES), next);
}

#[test]
#[ignore = "E1-08"]
fn placement_never_returns_an_occupied_system() {
    let p = params();
    let placed = &*PLACED;
    assert_eq!(placed.len(), 500);
    let distinct: HashSet<StarKey> = placed.iter().copied().collect();
    assert_eq!(distinct.len(), 500, "500 accounts, 500 different stars");
    for key in placed {
        assert_eq!(star_at(&p, *key).origin, StarOrigin::Generated, "{key:?}: accounts start at generated stars");
    }

    // the distance bounds are not what keeps occupied stars out: with no minimum every account still gets its own star
    let open = PlacementParams { min_ly: 0.0, ..RULES };
    let close: HashSet<StarKey> = place_many(&p, &open, 60).into_iter().collect();
    assert_eq!(close.len(), 60, "60 accounts with min_ly = 0, 60 different stars");
}

#[test]
#[ignore = "E1-08"]
fn nearest_neighbour_distance_within_bounds() {
    let check = |p: &GalaxyParams, rules: &PlacementParams, placed: &[StarKey]| {
        let positions: Vec<[f64; 3]> = placed.iter().map(|k| star_at(p, *k).pos_ly).collect();
        let from_origin = distance(positions[0], rules.origin_ly);
        assert!(from_origin <= rules.max_ly, "the first account is {from_origin} ly from the origin");
        for i in 1..positions.len() {
            let nearest = positions[..i].iter().map(|other| distance(positions[i], *other)).fold(f64::INFINITY, f64::min);
            assert!(rules.min_ly <= nearest && nearest <= rules.max_ly, "account {i}: the nearest player is {nearest} ly away");
        }
    };
    // 500 accounts around Sol, among the register stars
    check(&params(), &RULES, &PLACED);

    // other rules, another place, a denser galaxy: the bounds are the parameters'
    let dense = GalaxyParams { stars_per_cell: 6.0, ..params() };
    let rules = PlacementParams { origin_ly: [20_005.0, 55.0, -35.0], min_ly: 12.0, max_ly: 20.0 };
    check(&dense, &rules, &place_many(&dense, &rules, 60));

    // a shell too thin to hold a star: nothing nearer than min_ly or farther than max_ly is offered in its place
    let p = params();
    let first = place_account(&p, &[], &RULES).expect("a start system near Sol");
    for min_ly in [3.0, 9.0, 14.0] {
        let shell = PlacementParams { min_ly, max_ly: min_ly + 1e-9, ..RULES };
        assert_eq!(place_account(&p, &[first], &shell), None, "a shell at {min_ly} ly");
    }
}

#[test]
#[ignore = "E1-08"]
fn placement_only_offers_systems_with_a_landable_planet() {
    let p = params();
    for key in PLACED.iter() {
        let spec = generate_system(&p, *key).unwrap_or_else(|| panic!("{key:?}: a start star has a system"));
        assert!(spec.planets.iter().any(|planet| planet.surface.is_some()), "{key:?}: nowhere to land");
    }

    // nothing to offer: no star that close to the origin, then nothing in reach of the only occupied star
    let nowhere = PlacementParams { origin_ly: [20_005.0, 55.0, -35.0], min_ly: 0.0, max_ly: 1e-6 };
    assert_eq!(place_account(&p, &[], &nowhere), None);
    let first = place_account(&p, &[], &RULES).expect("a start system near Sol");
    let unreachable = PlacementParams { min_ly: 1e-7, max_ly: 1e-6, ..RULES };
    assert_eq!(place_account(&p, &[first], &unreachable), None);
}
