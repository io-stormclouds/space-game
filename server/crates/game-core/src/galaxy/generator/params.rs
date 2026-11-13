//! Parameters of the galaxy generator and their provisional defaults.
//!
//! Every default in this file is a PROPOSAL that waits for the human's confirmation (plan 08,
//! questions P-17, P-18, P-19, P-47; values for production are set before stage E3); the two values
//! of the moons of rocky planets come from the human's rule and are marked TO BE CONFIRMED. The acceptance
//! tests pass their own values wherever a number matters, so changing a default here does not change
//! a test. Values marked FACT repeat what the existing worlds already use.

use serde::{Deserialize, Serialize};

/// Closed range of a real value: `min <= max`, both finite.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct Bounds {
    pub min: f64,
    pub max: f64,
}

/// Closed range of a count: `min <= max`.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct CountBounds {
    pub min: u32,
    pub max: u32,
}

/// Main-sequence classes of generated stars, hottest first.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub enum SpectralClass {
    O,
    B,
    A,
    F,
    G,
    K,
    M,
}

/// How often a class is generated and where its stars' parameters lie.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ClassParams {
    pub class: SpectralClass,
    /// Relative weight among generated stars (the weights need not sum to 1; 0 = never generated).
    pub share: f64,
    /// Solar luminosities.
    pub luminosity: Bounds,
    /// Solar masses.
    pub mass: Bounds,
    /// Solar radii.
    pub radius: Bounds,
    /// Kelvin.
    pub temperature: Bounds,
    /// 0xRRGGBB, the colour of every generated star of the class.
    pub color: u32,
}

/// A deposit material of generated bodies.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DepositParams {
    /// Raw material of the economy catalog (tier T0, T0R or T0X); never REG, which is every tile without a deposit.
    pub material: String,
    /// Share of bodies that hold the material (0 = never, 1 = always).
    pub share: f64,
    /// Weight of the material on a body that holds it (`SurfaceGrid::deposit_weights`, scan profile [%]).
    pub weight: Bounds,
}

/// Insolations at the edges of the habitable zone (G-22: a calculation only; no rule reads it).
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ZoneLimits {
    /// Insolation at the inner (hot) edge; more than this is too hot.
    pub inner_insolation: f64,
    /// Insolation at the outer (cold) edge; less than this is too cold. `outer_insolation < inner_insolation`.
    pub outer_insolation: f64,
}

/// Contents of a generated planetary system. Distances and radii are in game units: an orbit of 900
/// around a star of 1 L☉ has insolation 1 (`sim::colony::insolation_of`).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SystemParams {
    /// Share of systems without any planet (a belt alone does not count as a planet).
    pub empty_share: f64,
    /// Most planets (rocky and giants together) in one system.
    pub max_planets: u32,
    /// Orbit radii of planets and of the belt.
    pub orbit_radius: Bounds,
    /// Radius of the star's body on the scene (not `StarSpec::radius`, which is in solar radii).
    pub star_body_radius: Bounds,
    /// Goldberg frequency n of a rocky planet's grid (tiles = 10·n² + 2).
    pub grid_frequency: CountBounds,
    /// Radius of a rocky planet = this × its grid frequency, so tiles keep the width the buildings are drawn for.
    pub radius_per_frequency: f64,
    /// Deposit materials of rocky planets and of moons with a surface.
    pub deposits: Vec<DepositParams>,
    /// Share of rocky planets that have moons; every planet draws on its own (E1-01 question 3 = b).
    pub rocky_moon_share: f64,
    /// Moons of a rocky planet that has any.
    pub rocky_moon_count: u32,
    /// Classes of stars whose systems can hold gas giants (P-47 a).
    pub giant_classes: Vec<SpectralClass>,
    /// Share of the systems of those classes that hold at least one gas giant.
    pub giant_share: f64,
    /// Gas giants orbit beyond the snow line: their insolation is below this (P-47 a).
    pub snow_line_insolation: f64,
    /// Radius of a gas giant.
    pub giant_radius: Bounds,
    /// Moons of one gas giant (P-47 a: 1–4).
    pub giant_moons: CountBounds,
    /// Share of systems with a belt.
    pub belt_share: f64,
    /// Materials a belt's profile lists (mining expeditions).
    pub belt_deposits: Vec<DepositParams>,
    /// Share of systems with a native civilisation (Q36 a: about 1 %; data only, a backdrop).
    pub civilization_share: f64,
}

/// Everything the generator depends on. Two calls with equal parameters give equal results.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GalaxyParams {
    /// Seed of the galaxy. A JSON reader in JavaScript keeps integers only up to 2^53.
    pub seed: u64,
    /// Edge of a cubic cell [ly]. Cell (i, j, k) spans [i·cell_ly, (i+1)·cell_ly) on each axis; Sol is at the origin.
    pub cell_ly: f64,
    /// Mean number of generated stars in a cell that no star of the register is near.
    pub stars_per_cell: f64,
    /// No generated star lies closer than this to a star of the register [ly] (P-17 a).
    pub min_real_separation_ly: f64,
    pub classes: Vec<ClassParams>,
    pub system: SystemParams,
    pub zone: ZoneLimits,
}

/// Where a new account starts (P-18 a).
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlacementParams {
    /// The first account starts within `max_ly` of this point [ly].
    pub origin_ly: [f64; 3],
    /// The nearest occupied system is at least this far [ly]...
    pub min_ly: f64,
    /// ...and at most this far [ly].
    pub max_ly: f64,
}

fn bounds(min: f64, max: f64) -> Bounds {
    Bounds { min, max }
}

fn class(
    class: SpectralClass,
    share: f64,
    luminosity: Bounds,
    mass: Bounds,
    radius: Bounds,
    temperature: Bounds,
    color: u32,
) -> ClassParams {
    ClassParams { class, share, luminosity, mass, radius, temperature, color }
}

fn deposit(material: &str, share: f64, weight: Bounds) -> DepositParams {
    DepositParams { material: material.to_string(), share, weight }
}

impl Default for ZoneLimits {
    /// PROPOSAL: the conservative habitable zone of a Sun-like star (runaway greenhouse at about
    /// 1.1 of Earth's insolation, maximum greenhouse at about 0.36).
    fn default() -> ZoneLimits {
        ZoneLimits { inner_insolation: 1.1, outer_insolation: 0.36 }
    }
}

impl Default for SystemParams {
    fn default() -> SystemParams {
        SystemParams {
            // PROPOSAL (P-19): no determination on how many systems are empty
            empty_share: 0.2,
            // PROPOSAL (P-19); FACT: Tau Ceti has 5 planets
            max_planets: 8,
            // PROPOSAL (P-19): from just outside the star's body to where the snow line of the brightest
            // class with giants still fits (900·√(5 / 0.14) ≈ 5400). FACT: Tau Ceti's bodies orbit at 448–1185
            orbit_radius: bounds(300.0, 8000.0),
            // FACT: 50 (Tau Ceti), 60 (the PoC sun)
            star_body_radius: bounds(40.0, 80.0),
            // FACT: the planets of Tau Ceti have n = 5, 6 and 8
            grid_frequency: CountBounds { min: 5, max: 8 },
            // FACT: radius 50 at n = 8 (`scenarios/tau_ceti.rs`)
            radius_per_frequency: 6.25,
            // PROPOSAL (P-19, W51): shares; weights span what the scan profiles of Tau Ceti report
            deposits: vec![
                deposit("FER", 0.85, bounds(40.0, 70.0)),
                deposit("SIL", 0.8, bounds(40.0, 65.0)),
                deposit("KRI", 0.6, bounds(40.0, 95.0)),
                deposit("KAR", 0.5, bounds(35.0, 55.0)),
                deposit("KUP", 0.35, bounds(15.0, 80.0)),
                deposit("TYT", 0.3, bounds(50.0, 70.0)),
                deposit("URA", 0.1, bounds(20.0, 30.0)),
            ],
            // TO BE CONFIRMED (the human's rule of 2026-11-13, E1-01 question 3 = b): a moon is a bonus of
            // about 15 % of the rocky planets
            rocky_moon_share: 0.15,
            // TO BE CONFIRMED (the same rule): exactly one moon
            rocky_moon_count: 1,
            // P-47 a
            giant_classes: vec![SpectralClass::F, SpectralClass::G, SpectralClass::K],
            // PROPOSAL (P-47): the answer names the classes, not how many of their systems hold a giant
            giant_share: 0.4,
            // PROPOSAL (P-47): the snow line of the Solar System (about 2.7 AU) as insolation
            snow_line_insolation: 0.14,
            // PROPOSAL (P-47): about twice the largest rocky planet; the look is decided in E6-02
            giant_radius: bounds(80.0, 120.0),
            // P-47 a
            giant_moons: CountBounds { min: 1, max: 4 },
            // PROPOSAL (P-19)
            belt_share: 0.3,
            // FACT: the materials of Tau Ceti's dust belt; PROPOSAL: shares and ranges
            belt_deposits: vec![
                deposit("FER", 0.9, bounds(50.0, 80.0)),
                deposit("KAR", 0.6, bounds(40.0, 60.0)),
                deposit("PLA", 0.5, bounds(30.0, 50.0)),
            ],
            // Q36 a
            civilization_share: 0.01,
        }
    }
}

impl Default for GalaxyParams {
    fn default() -> GalaxyParams {
        GalaxyParams {
            seed: 0,
            // PROPOSAL (P-17): 10 ly cells with 3 stars each = 0.003 stars per cubic light year
            cell_ly: 10.0,
            stars_per_cell: 3.0,
            // PROPOSAL (P-17)
            min_real_separation_ly: 2.0,
            // PROPOSAL (P-17): shares close to the main sequence near the Sun (O stars left out);
            // parameter ranges of the Harvard classes; colours from the register's stars of the class
            classes: vec![
                class(
                    SpectralClass::O,
                    0.0,
                    bounds(30_000.0, 500_000.0),
                    bounds(16.0, 60.0),
                    bounds(6.6, 12.0),
                    bounds(30_000.0, 50_000.0),
                    0x9bb0ff,
                ),
                class(
                    SpectralClass::B,
                    0.002,
                    bounds(25.0, 30_000.0),
                    bounds(2.1, 16.0),
                    bounds(1.8, 6.6),
                    bounds(10_000.0, 30_000.0),
                    0x90b4ff,
                ),
                class(SpectralClass::A, 0.008, bounds(5.0, 25.0), bounds(1.4, 2.1), bounds(1.4, 1.8), bounds(7_500.0, 10_000.0), 0xb0d0ff),
                class(SpectralClass::F, 0.03, bounds(1.5, 5.0), bounds(1.04, 1.4), bounds(1.15, 1.4), bounds(6_000.0, 7_500.0), 0xffffe0),
                class(SpectralClass::G, 0.08, bounds(0.6, 1.5), bounds(0.8, 1.04), bounds(0.96, 1.15), bounds(5_200.0, 6_000.0), 0xfff5c0),
                class(SpectralClass::K, 0.12, bounds(0.08, 0.6), bounds(0.45, 0.8), bounds(0.7, 0.96), bounds(3_700.0, 5_200.0), 0xffb870),
                class(
                    SpectralClass::M,
                    0.76,
                    bounds(0.0005, 0.08),
                    bounds(0.08, 0.45),
                    bounds(0.1, 0.7),
                    bounds(2_400.0, 3_700.0),
                    0xff6030,
                ),
            ],
            system: SystemParams::default(),
            zone: ZoneLimits::default(),
        }
    }
}

impl Default for PlacementParams {
    /// PROPOSAL (P-18): "a few stars apart" as 8–16 ly at 0.003 stars per cubic light year.
    fn default() -> PlacementParams {
        PlacementParams { origin_ly: [0.0, 0.0, 0.0], min_ly: 8.0, max_ly: 16.0 }
    }
}
