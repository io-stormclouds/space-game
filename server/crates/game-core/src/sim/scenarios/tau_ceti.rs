//! Default scenario (W06 A): Arka-1 arrives at Tau Ceti, the canvas flow "Przybycie → Skanowanie →
//! Port kosmiczny → Kolonia" (`scenarios/tau-ceti.ts`).
//!
//! FACT (canvas boards Arrival, Scan, Spaceport): hold contents, units on board, scan 15 min, planet
//! profiles (grid sizes, atmosphere, insolation, deposits, shuttle launch fuel), port cost and time.
//! FACT (stars.data.ts): Tau Ceti G8.5V, luminosity 0.52, 5 planets.
//! PROPOSAL: orbit radii and periods (from the canvas insolation: r = 900·√(0.52 / insolation),
//! period ∝ r^1.5 like the PoC planet), deposit seeds, body colours, Ark fuel.

use std::f64::consts::PI;

use indexmap::IndexMap;

use crate::math::js;
use crate::models::body::{Atmosphere, BodyKind, BodyProfile, CelestialBody, SurfaceGrid};
use crate::models::ship::{Onboard, ShipRole, ShipState, Spacecraft};
use crate::models::terrain::{TerrainBiome, TerrainConfig};
use crate::sim::constants::GAME_CONSTANTS;
use crate::sim::rules::LevelOverride;
use crate::sim::scenario::{Scenario, default_colonization, no_rovers, no_structures};

const LUMINOSITY: f64 = 0.52;

pub const TAU_CETI_ID: &str = "tau-ceti";
pub const TC_B: &str = "tc-b";
pub const TC_C: &str = "tc-c";
pub const TC_D: &str = "tc-d";
pub const TC_E: &str = "tc-e";
pub const TC_F: &str = "tc-f";
pub const TC_BELT: &str = "tc-belt";
pub const ARK_ID: &str = "arka-1";

/// Orbit radius giving the canvas insolation around a 0.52 L☉ star.
fn orbit_for(insolation: f64) -> f64 {
    js::round(900.0 * (LUMINOSITY / insolation).sqrt())
}

/// Period scaled from the PoC planet (240 min at 900) with Kepler's r^1.5.
fn period_for(r: f64) -> f64 {
    240.0 * (r / 900.0).powf(1.5)
}

/// Tile width stays ~6–8 units like the PoC: radius ∝ grid frequency (50 at n = 8).
fn radius_for(n: usize) -> f64 {
    (50.0 * n as f64) / 8.0
}

struct PlanetData {
    id: &'static str,
    name: &'static str,
    unknown: &'static str,
    n: usize,
    seed: f64,
    insolation: f64,
    atmosphere: Atmosphere,
    phase: f64,
    color: u32,
    profile: BodyProfile,
    /// Hex-kit terrain (T8: changes building cost and time); none = plain tiles.
    terrain: Option<TerrainConfig>,
}

fn profile(kind: &str, temperature: &str, water: &str, rating: &str, fuel: f64, note: &str, deposits: &[(&str, f64)]) -> BodyProfile {
    BodyProfile {
        kind: kind.to_string(),
        temperature: temperature.to_string(),
        water: water.to_string(),
        note: note.to_string(),
        rating: rating.to_string(),
        deposits: deposits.iter().map(|(k, v)| (k.to_string(), *v)).collect(),
        shuttle_launch_fuel: Some(fuel),
    }
}

fn planets() -> Vec<PlanetData> {
    vec![
        PlanetData {
            id: TC_B,
            name: "Tau Ceti b",
            unknown: "Obiekt 1",
            n: 5,
            seed: 101.0,
            insolation: 2.1,
            atmosphere: Atmosphere::None,
            phase: 0.4,
            color: 0xb0724a,
            profile: profile(
                "gorąca planeta skalista",
                "wysoka",
                "brak",
                "trudny",
                4.0,
                "Bogata w metale, ale bez lodu i węgla: woda i paliwo musiałyby przylatywać z innych ciał.",
                &[("KUP", 80.0), ("TYT", 55.0), ("URA", 25.0)],
            ),
            terrain: None,
        },
        PlanetData {
            id: TC_C,
            name: "Tau Ceti c",
            unknown: "Obiekt 2",
            n: 5,
            seed: 102.0,
            insolation: 1.4,
            atmosphere: Atmosphere::Trace,
            phase: 2.2,
            color: 0x9a8a78,
            profile: profile(
                "skalista, śladowa atmosfera",
                "umiarkowana",
                "brak",
                "średni",
                5.0,
                "Dobre metale i słońce, brak lodu. Lepsza jako druga kolonia przemysłowa.",
                &[("TYT", 70.0), ("FER", 50.0), ("KUP", 35.0)],
            ),
            // ruined medieval settlement facing the sun (docs/planet-terrain-poc-wnioski-i-plan.md §9.1)
            terrain: Some(TerrainConfig { biome: TerrainBiome::Medieval, seed: 2.0 }),
        },
        PlanetData {
            id: TC_D,
            name: "Tau Ceti d",
            unknown: "Obiekt 3",
            n: 6,
            seed: 103.0,
            insolation: 0.9,
            atmosphere: Atmosphere::None,
            phase: 4.1,
            color: 0x8b8f96,
            profile: profile(
                "skalista bez atmosfery",
                "chłodna",
                "śladowo",
                "średni",
                6.0,
                "Ferryt i Silicyt, mało wody. Niska grawitacja nadaje się na wyrzutnię masy.",
                &[("FER", 65.0), ("SIL", 60.0), ("REG", 90.0)],
            ),
            terrain: None,
        },
        PlanetData {
            id: TC_E,
            name: "Tau Ceti e",
            unknown: "Obiekt 4",
            n: 8,
            seed: 104.0,
            insolation: 0.7,
            atmosphere: Atmosphere::Dense,
            phase: 1.3,
            color: 0x4f7a5a,
            profile: profile(
                "superziemia z atmosferą",
                "umiarkowana",
                "lód, dużo",
                "zalecana",
                12.0,
                "Pełny zestaw surowców T0 i atmosfera do turbin wiatrowych. Najprostszy start, ale droższy start promu z powierzchni.",
                &[("FER", 60.0), ("SIL", 55.0), ("KRI", 75.0), ("KAR", 45.0), ("KUP", 15.0)],
            ),
            terrain: None,
        },
        PlanetData {
            id: TC_F,
            name: "Tau Ceti f",
            unknown: "Obiekt 5",
            n: 6,
            seed: 105.0,
            insolation: 0.4,
            atmosphere: Atmosphere::Thin,
            phase: 5.3,
            color: 0xa9c4d6,
            profile: profile(
                "chłodna planeta lodowa",
                "bardzo niska",
                "lód, bardzo dużo",
                "trudny",
                7.0,
                "Źródło wody i paliwa na później. Słabe słońce: energia z reaktorów.",
                &[("KRI", 95.0), ("KAR", 50.0)],
            ),
            terrain: None,
        },
    ]
}

/// Deposit weights from the scan profile; regolith is everywhere, not a deposit.
fn weights_of(deposits: &IndexMap<String, f64>) -> IndexMap<String, f64> {
    deposits.iter().filter(|(code, _)| code.as_str() != "REG").map(|(k, v)| (k.clone(), *v)).collect()
}

pub fn tau_ceti_bodies() -> Vec<CelestialBody> {
    let two_pi = PI * 2.0;
    let mut star = CelestialBody::base(TAU_CETI_ID, "Tau Ceti", BodyKind::Star, 50.0, None, 0xffdd90);
    star.orbital_altitude_factor = 1.6;
    star.luminosity = Some(LUMINOSITY);

    let belt_orbit = orbit_for(0.3);
    let mut belt = CelestialBody::base(TC_BELT, "Pas pyłowy", BodyKind::Belt, 14.0, Some(TAU_CETI_ID), 0x6b5a48);
    belt.orbit_radius = belt_orbit;
    belt.orbit_speed = two_pi / period_for(belt_orbit);
    belt.initial_angle = 3.4;
    belt.insolation = Some(0.3);
    belt.profile = Some(BodyProfile {
        kind: "dysk asteroid i pyłu".to_string(),
        temperature: "—".to_string(),
        water: "—".to_string(),
        rating: "wyprawy".to_string(),
        note: "Masywny dysk pyłowy Tau Ceti: Platynit i Ferryt z wypraw górniczych. Nie da się na nim budować.".to_string(),
        deposits: [("PLA", 40.0), ("FER", 70.0), ("KAR", 55.0)].iter().map(|(k, v)| (k.to_string(), *v)).collect(),
        shuttle_launch_fuel: None,
    });

    let mut bodies = vec![star];
    for p in planets() {
        let r = orbit_for(p.insolation);
        let mut b = CelestialBody::base(p.id, p.name, BodyKind::Planet, radius_for(p.n), Some(TAU_CETI_ID), p.color);
        b.orbit_radius = r;
        b.orbit_speed = two_pi / period_for(r);
        b.initial_angle = p.phase;
        // only bodies with terrain get the key, so the others keep their world JSON
        b.surface_grid = Some(SurfaceGrid {
            frequency: p.n,
            deposit_seed: Some(p.seed),
            deposit_weights: Some(weights_of(&p.profile.deposits)),
            terrain: p.terrain,
        });
        b.atmosphere = Some(p.atmosphere);
        b.insolation = Some(p.insolation);
        b.revealed = Some(false);
        b.unknown_name = Some(p.unknown.to_string());
        b.profile = Some(p.profile);
        bodies.push(b);
    }
    bodies.push(belt);
    bodies
}

/// Arka-1 (canvas "Przybycie"): hold 2000 / 2000 j., 2 rovers, 1 shuttle, 1 probe on board.
pub fn arka_1() -> Spacecraft {
    Spacecraft {
        id: ARK_ID.to_string(),
        name: "Arka-1".to_string(),
        role: ShipRole::Mothership,
        fuel: 100.0,
        max_fuel: 100.0,
        cargo: crate::models::resource::qty([
            ("STA", 600.0),
            ("FER", 400.0),
            ("SIL", 300.0),
            ("KRI", 200.0),
            ("BET", 200.0),
            ("ZYW", 180.0),
            ("UKL", 60.0),
            ("PRE", 20.0),
            ("SLN", 40.0),
        ]),
        max_cargo: 2000.0,
        state: ShipState::Docked,
        current_body_id: Some(TAU_CETI_ID.to_string()),
        target_body_id: None,
        transfer: None,
        onboard: Some(Onboard { rovers: 2, shuttles: 1, probes: 1 }),
    }
}

pub fn tau_ceti_scenario() -> Scenario {
    let colonization = default_colonization();
    // The port L1 is not standing here: it is landed from the hold (canvas: STA 120 · BET 80 · UKL 10 · 12 min).
    let mut overrides = IndexMap::new();
    overrides.insert(
        "HQ".to_string(),
        IndexMap::from([(1u32, LevelOverride { cost: Some(colonization.port_cost.clone()), time: Some(colonization.port_build_minutes) })]),
    );
    Scenario {
        id: "tau-ceti".to_string(),
        name: "Tau Ceti: przybycie Arki-1".to_string(),
        bodies: tau_ceti_bodies(),
        ships: vec![arka_1()],
        structures: no_structures,
        rovers: no_rovers,
        storage: IndexMap::new(),
        overrides: Some(overrides),
        colonization,
        constants: GAME_CONSTANTS,
        scanned: false,
    }
}
