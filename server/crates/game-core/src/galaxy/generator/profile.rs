//! Scan profiles and colours of generated bodies (task E1-05): content data in Polish like the
//! profiles of Tau Ceti (`sim/scenarios/tau_ceti.rs`), derived only from what the system spec holds.
//!
//! PROPOSAL (P-19): the texts and the insolation bands below are a description, read by no rule.
//! FACT: the colours of rocky planets, moons and the belt are those of the bodies of the existing
//! worlds (Tau Ceti b–f and its belt, the PoC moon); the water text follows the ice deposit (KRI) as
//! in the Tau Ceti profiles; a body nobody can land on rates "wyprawy" like Tau Ceti's belt. The
//! rating "zalecana" is not given: which planets suit a start is decided by the start criteria (E4-02).

use indexmap::IndexMap;

use crate::models::body::{Atmosphere, BodyProfile};

/// The deposit material the water text follows (FACT: "Kriol", the ice of the catalog).
const ICE: &str = "KRI";

/// Colours of gas giants, one drawn per giant (PROPOSAL; their look is decided in E6-02).
pub(super) const GIANT_COLOURS: [u32; 4] = [0xc9a27e, 0xd9c49a, 0x9db8c9, 0x6f8fc4];

/// FACT: the PoC moon.
pub(super) const MOON_COLOUR: u32 = 0x9ca3af;

/// FACT: Tau Ceti's dust belt.
pub(super) const BELT_COLOUR: u32 = 0x6b5a48;

/// Temperature bands by insolation (description only).
#[derive(Clone, Copy, PartialEq, Eq)]
enum Band {
    Hot,
    Temperate,
    Cool,
    Frozen,
}

fn band(insolation: f64) -> Band {
    if insolation > 1.5 {
        Band::Hot
    } else if insolation > 0.5 {
        Band::Temperate
    } else if insolation > 0.2 {
        Band::Cool
    } else {
        Band::Frozen
    }
}

fn temperature(band: Band) -> &'static str {
    match band {
        Band::Hot => "wysoka",
        Band::Temperate => "umiarkowana",
        Band::Cool => "chłodna",
        Band::Frozen => "bardzo niska",
    }
}

/// "Ma 3 księżyce." with the Polish plural; nothing without moons.
fn moons_sentence(count: usize) -> Option<String> {
    let word = match (count, count % 10, count % 100) {
        (0, _, _) => return None,
        (1, _, _) => "księżyc",
        (_, 2..=4, last_two) if !(12..=14).contains(&last_two) => "księżyce",
        _ => "księżyców",
    };
    Some(format!("Ma {count} {word}."))
}

fn profile(kind: &str, temperature: &str, water: &str, rating: &str, note: String, deposits: IndexMap<String, f64>) -> BodyProfile {
    BodyProfile {
        kind: kind.to_string(),
        temperature: temperature.to_string(),
        water: water.to_string(),
        note,
        rating: rating.to_string(),
        deposits,
        shuttle_launch_fuel: None,
    }
}

/// The profile and colour of a rocky planet; its scan lists exactly its deposits.
pub(super) fn rocky(
    insolation: f64,
    atmosphere: Atmosphere,
    deposits: &IndexMap<String, f64>,
    moons: usize,
    civilization: bool,
) -> (BodyProfile, u32) {
    let band = band(insolation);
    let kind = match (band, atmosphere) {
        (Band::Hot, _) => "gorąca planeta skalista",
        (Band::Frozen, _) => "mroźna planeta skalista",
        (_, Atmosphere::None) => "skalista bez atmosfery",
        (_, Atmosphere::Trace) => "skalista, śladowa atmosfera",
        (_, Atmosphere::Thin) => "skalista, rzadka atmosfera",
        (_, Atmosphere::Dense) => "skalista z gęstą atmosferą",
    };
    let colour = match (band, atmosphere) {
        (Band::Hot, _) => 0xb0724a,
        (Band::Frozen, _) => 0xa9c4d6,
        (Band::Cool, _) => 0x8b8f96,
        (Band::Temperate, Atmosphere::Dense) => 0x4f7a5a,
        (Band::Temperate, _) => 0x9a8a78,
    };
    let water = if deposits.contains_key(ICE) { "lód" } else { "brak" };
    let rating = match band {
        Band::Hot | Band::Frozen => "trudny",
        Band::Temperate | Band::Cool => "średni",
    };
    let mut note: Vec<String> = Vec::new();
    if civilization {
        note.push("Dom nierozwiniętej cywilizacji tubylczej.".to_string());
    }
    if atmosphere == Atmosphere::Dense {
        // FACT: wind turbines need a dense atmosphere (`CelestialBody::atmosphere`)
        note.push("Gęsta atmosfera pozwala stawiać turbiny wiatrowe.".to_string());
    }
    note.extend(moons_sentence(moons));
    (profile(kind, temperature(band), water, rating, note.join(" "), deposits.clone()), colour)
}

/// The profile of a gas giant: no surface, nothing listed for the scan.
pub(super) fn giant(insolation: f64, moons: usize) -> BodyProfile {
    let mut note = vec!["Bez powierzchni: nie da się wylądować.".to_string()];
    note.extend(moons_sentence(moons));
    profile("gazowy olbrzym", temperature(band(insolation)), "—", "wyprawy", note.join(" "), IndexMap::new())
}

/// The profile of a moon without a surface; it shares its planet's insolation.
pub(super) fn moon(insolation: f64) -> BodyProfile {
    profile("księżyc", temperature(band(insolation)), "—", "wyprawy", "Bez lądowania.".to_string(), IndexMap::new())
}

/// The profile of a belt: mining expeditions, no building.
pub(super) fn belt(deposits: &IndexMap<String, f64>) -> BodyProfile {
    profile("pas planetoid", "—", "—", "wyprawy", "Wyprawy górnicze; nie da się na nim budować.".to_string(), deposits.clone())
}
