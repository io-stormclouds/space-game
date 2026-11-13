//! The world bodies of a system (task E1-07): the star, the rocky planets and the belt of a
//! [`SystemSpec`] as `CelestialBody`.
//!
//! Nothing is drawn and nothing is computed here: every number of a body is copied from the spec.
//! What the spec does not hold is set in this file:
//! - identifiers. The star's is its key, spelled out: `sg_<x>_<y>_<z>_<index>`. A planet adds
//!   `_p<n>` and the belt `_belt`. So they are unique in the galaxy and not only in the system, and
//!   they hold neither `:` nor `@`, which the identifiers of tiles and structures put after the id
//!   of a body. PROPOSAL, provisional like the star's name until E3-01;
//! - names. FACT: the planets of Tau Ceti are named after the star with a letter, "b" for the
//!   innermost, and its belt is "Pas pyłowy". Generated bodies are named the same way;
//! - `insolation` repeats the spec's value on the planets and the belt (the contract allows that or
//!   `None`). FACT: Tau Ceti's bodies carry theirs. The solar multiplier of a generated world is
//!   then the generator's number on every platform, not what the default rule computes there.
//!
//! The number `n` of a planet and its letter count every planet of the spec, the gas giants too:
//! a rocky planet keeps its identifier and its name when the giants join the bodies (E6-01).
//!
//! Every field the contract does not name keeps the value of `CelestialBody::base`.

use super::{BeltSpec, PlanetKind, PlanetSpec, StarKey, SystemSpec};
use crate::models::body::{BodyKind, CelestialBody, SurfaceGrid};

/// FACT: the name of Tau Ceti's belt.
const BELT_NAME: &str = "Pas pyłowy";

pub(super) fn system_bodies(spec: &SystemSpec) -> Vec<CelestialBody> {
    let star_id = star_id(spec.star.key);
    let mut star = CelestialBody::base(&star_id, &spec.star.name, BodyKind::Star, spec.star_body_radius, None, spec.star.color);
    star.luminosity = Some(spec.star.luminosity);

    let mut bodies = vec![star];
    // The planets are numbered from the star, a fixed-width count. The gas giants take a number and
    // are left out (E6-01); the moons, of a giant or of a rocky planet, are not read (P-19 a).
    for (number, planet) in (1u64..).zip(&spec.planets) {
        if planet.kind == PlanetKind::Rocky {
            bodies.push(rocky_planet(&spec.star.name, &star_id, number, planet));
        }
    }
    if let Some(belt) = &spec.belt {
        bodies.push(belt_body(&star_id, belt));
    }
    bodies
}

/// The identifier of a system's star: its key, spelled out.
fn star_id(key: StarKey) -> String {
    format!("sg_{}_{}_{}_{}", key.cell.x, key.cell.y, key.cell.z, key.index)
}

fn rocky_planet(star_name: &str, star_id: &str, number: u64, planet: &PlanetSpec) -> CelestialBody {
    let id = format!("{star_id}_p{number}");
    let name = format!("{star_name} {}", planet_letter(number));
    let mut body = CelestialBody::base(&id, &name, BodyKind::Planet, planet.radius, Some(star_id), planet.color);
    body.orbit_radius = planet.orbit_radius;
    body.orbit_speed = planet.orbit_speed;
    body.initial_angle = planet.initial_angle;
    body.atmosphere = Some(planet.atmosphere);
    body.insolation = Some(planet.insolation);
    body.profile = Some(planet.profile.clone());
    // The spec gives every rocky planet a surface. One without it, which the generator never
    // returns, is a planet without a grid: nothing is built on it.
    body.surface_grid = planet.surface.as_ref().map(|surface| SurfaceGrid {
        // an index type of the world model; `u32` fits `usize` natively and on `wasm32`
        frequency: surface.grid_frequency as usize,
        deposit_seed: Some(surface.deposit_seed),
        deposit_weights: Some(surface.deposit_weights.clone()),
        // terrain and biomes are not the pilot's
        terrain: None,
    });
    body
}

fn belt_body(star_id: &str, belt: &BeltSpec) -> CelestialBody {
    let id = format!("{star_id}_belt");
    let mut body = CelestialBody::base(&id, BELT_NAME, BodyKind::Belt, belt.radius, Some(star_id), belt.color);
    body.orbit_radius = belt.orbit_radius;
    body.orbit_speed = belt.orbit_speed;
    body.initial_angle = belt.initial_angle;
    body.insolation = Some(belt.insolation);
    body.profile = Some(belt.profile.clone());
    body
}

/// The letter of the planet `number` (the innermost is 1): "b", since "a" is the star, then "c" …
/// "z", "aa", "ab" … It is `number + 1` written with the 26 letters as the digits 1 ..= 26, so every
/// number has letters of its own.
fn planet_letter(number: u64) -> String {
    let mut rest = number.saturating_add(1);
    let mut letters: Vec<char> = Vec::new();
    while rest > 0 {
        rest -= 1;
        // the cast is exact: a remainder below 26
        letters.push(char::from(b'a' + (rest % 26) as u8));
        rest /= 26;
    }
    letters.iter().rev().collect()
}

#[cfg(test)]
mod tests {
    use std::collections::HashSet;

    use super::*;
    use crate::galaxy::generator::{CellCoord, GalaxyParams, generate_system, stars_in_cell};

    fn is_rocky(planet: &PlanetSpec) -> bool {
        planet.kind == PlanetKind::Rocky
    }

    /// The first generated system of the far cells with a belt and two rocky planets or more. The
    /// cells have a negative coordinate.
    fn sample() -> SystemSpec {
        let p = GalaxyParams { seed: 9, ..GalaxyParams::default() };
        (0..1_000)
            .flat_map(|i| stars_in_cell(&p, CellCoord { x: 3_000 + i, y: -7, z: 2 }))
            .filter_map(|star| generate_system(&p, star.key))
            .find(|spec| spec.belt.is_some() && spec.planets.iter().filter(|planet| is_rocky(planet)).count() >= 2)
            .expect("a thousand cells hold a system with a belt and two rocky planets")
    }

    #[test]
    fn identifiers_spell_out_the_key_and_the_place_of_the_body() {
        assert_eq!(star_id(StarKey { cell: CellCoord { x: -3, y: 2_000, z: 0 }, index: 7 }), "sg_-3_2000_0_7");

        let spec = sample();
        let key = spec.star.key;
        let star_id = format!("sg_{}_-7_2_{}", key.cell.x, key.index);
        let mut expected = vec![star_id.clone()];
        expected.extend((1..=spec.planets.len()).filter(|n| is_rocky(&spec.planets[n - 1])).map(|n| format!("{star_id}_p{n}")));
        expected.push(format!("{star_id}_belt"));
        let bodies = system_bodies(&spec);
        let ids: Vec<&str> = bodies.iter().map(|body| body.id.as_str()).collect();
        assert_eq!(ids, expected);
        // a tile is `<body>:<index>` and a structure `<kind>@<tile>`
        assert!(ids.iter().all(|id| !id.contains(':') && !id.contains('@')));

        assert_eq!(bodies[1].name, format!("{} b", spec.star.name));
        assert_eq!(bodies.last().map(|belt| belt.name.as_str()), Some(BELT_NAME));
    }

    #[test]
    fn planets_are_lettered_from_b_and_never_run_out_of_letters() {
        for (number, letter) in [(1, "b"), (2, "c"), (25, "z"), (26, "aa"), (27, "ab"), (51, "az"), (52, "ba"), (701, "zz"), (702, "aaa")] {
            assert_eq!(planet_letter(number), letter, "planet {number}");
        }
        assert!(!planet_letter(u64::MAX).is_empty());

        // more planets than the alphabet has letters: every body still has an id and a name of its own
        let mut spec = sample();
        let planet = spec.planets.iter().find(|planet| is_rocky(planet)).expect("the sample has rocky planets").clone();
        spec.planets = vec![planet; 60];
        let bodies = system_bodies(&spec);
        assert_eq!(bodies.len(), 62);
        let ids: HashSet<&str> = bodies.iter().map(|body| body.id.as_str()).collect();
        let names: HashSet<&str> = bodies.iter().map(|body| body.name.as_str()).collect();
        assert_eq!((ids.len(), names.len()), (62, 62));
        assert_eq!(bodies[60].name, format!("{} bi", spec.star.name));
    }

    #[test]
    fn a_rocky_planet_keeps_its_id_and_its_name_whatever_is_left_out() {
        let spec = sample();
        let bodies = system_bodies(&spec);
        let first = spec.planets.iter().position(is_rocky).expect("the sample has rocky planets");

        // the planet becomes a gas giant, as if one orbited inside the others: it is left out and
        // the bodies of the other planets are what they were
        let mut with_giant = spec.clone();
        with_giant.planets[first].kind = PlanetKind::GasGiant;
        with_giant.planets[first].surface = None;
        let mut expected = bodies.clone();
        expected.remove(1);
        assert_eq!(system_bodies(&with_giant), expected);

        // a rocky planet without a surface is not a spec of the generator: a body without a grid
        let mut bare = spec.clone();
        bare.planets[first].surface = None;
        let mut expected = bodies.clone();
        expected[1].surface_grid = None;
        assert_eq!(system_bodies(&bare), expected);

        // without the belt the other bodies are what they were
        let mut without_belt = spec.clone();
        without_belt.belt = None;
        let mut expected = bodies;
        expected.pop();
        assert_eq!(system_bodies(&without_belt), expected);
    }
}
