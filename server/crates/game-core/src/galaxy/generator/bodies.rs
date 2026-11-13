//! The world bodies of a generated system (task E1-07): the star, the rocky planets and the belt of a
//! [`SystemSpec`] as [`CelestialBody`] values for `OrbitSolver`, `insolation_of` and `build_world_grids`.
//!
//! Identifiers and names come from the spec only:
//! - the star: id `sg_<x>_<y>_<z>_<index>` from its key, so ids do not collide between systems
//!   either; ids use letters, digits, `_` and `-` only (no `:`, which separates the body from the
//!   tile in a tile id, `ids::tile_id`);
//! - planet `k` of `planets` (1 for the first, gas giants counted): id `<star>_p<k>`, name the star's
//!   name with the planet's letter, `b` for the first, `c` for the second and so on, as in
//!   "Tau Ceti b"; so ids and names stay when gas giants become bodies (E6-01);
//! - the belt: id `<star>_belt`, name "Pas planetoid <star>".
//!
//! `insolation` repeats the spec's value: the world then holds the same bits as the spec on every
//! platform, without the `powf` of the default rule in `sim::colony::insolation_of`.

use super::{BeltSpec, PlanetKind, PlanetSpec, StarKey, SurfaceSpec, SystemSpec};
use crate::models::body::{BodyKind, CelestialBody, SurfaceGrid};

pub(super) fn system_bodies(spec: &SystemSpec) -> Vec<CelestialBody> {
    let star_id = star_id(spec.star.key);
    let mut star = CelestialBody::base(&star_id, &spec.star.name, BodyKind::Star, spec.star_body_radius, None, spec.star.color);
    star.luminosity = Some(spec.star.luminosity);

    let mut bodies = vec![star];
    // `planets` are sorted by growing orbit, so the rocky ones keep that order
    for (number, planet) in (1u64..).zip(&spec.planets) {
        if planet.kind == PlanetKind::Rocky {
            bodies.push(rocky_planet(spec, &star_id, number, planet));
        }
    }
    if let Some(belt) = &spec.belt {
        bodies.push(belt_body(spec, &star_id, belt));
    }
    bodies
}

fn star_id(key: StarKey) -> String {
    format!("sg_{}_{}_{}_{}", key.cell.x, key.cell.y, key.cell.z, key.index)
}

/// Planet `number` (1-based, in the order of `planets`) as a body circling the star.
fn rocky_planet(spec: &SystemSpec, star_id: &str, number: u64, planet: &PlanetSpec) -> CelestialBody {
    let id = format!("{star_id}_p{number}");
    let name = format!("{} {}", spec.star.name, letter(number));
    let mut body = CelestialBody::base(&id, &name, BodyKind::Planet, planet.radius, Some(star_id), planet.color);
    body.orbit_radius = planet.orbit_radius;
    body.orbit_speed = planet.orbit_speed;
    body.initial_angle = planet.initial_angle;
    body.atmosphere = Some(planet.atmosphere);
    body.insolation = Some(planet.insolation);
    body.surface_grid = planet.surface.as_ref().map(surface_grid);
    body.profile = Some(planet.profile.clone());
    body
}

/// The grid of the spec's surface: plain tiles, no terrain (terrain is not the pilot's).
fn surface_grid(surface: &SurfaceSpec) -> SurfaceGrid {
    SurfaceGrid {
        frequency: surface.grid_frequency as usize,
        deposit_seed: Some(surface.deposit_seed),
        deposit_weights: Some(surface.deposit_weights.clone()),
        terrain: None,
    }
}

fn belt_body(spec: &SystemSpec, star_id: &str, belt: &BeltSpec) -> CelestialBody {
    let id = format!("{star_id}_belt");
    let name = format!("Pas planetoid {}", spec.star.name);
    let mut body = CelestialBody::base(&id, &name, BodyKind::Belt, belt.radius, Some(star_id), belt.color);
    body.orbit_radius = belt.orbit_radius;
    body.orbit_speed = belt.orbit_speed;
    body.initial_angle = belt.initial_angle;
    body.insolation = Some(belt.insolation);
    body.profile = Some(belt.profile.clone());
    body
}

/// The letter of planet `number` (1-based): `b`, `c`, … `z`, then `aa`, `ab`, … (the bijective base 26
/// of `number + 1` with a = 1), so every number has its own letters.
fn letter(number: u64) -> String {
    let mut n = number + 1;
    let mut letters: Vec<char> = Vec::new();
    while n > 0 {
        n -= 1;
        letters.push(char::from(b'a' + (n % 26) as u8));
        n /= 26;
    }
    letters.iter().rev().collect()
}
