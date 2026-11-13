//! The planetary system of a generated star (task E1-05).
//!
//! Everything a system draws comes from one stream of its star ([`streams::system`]) in a fixed
//! order: the numbers that decide the kind of system, the nominal orbits, then body by body.
//!
//! - **Kind.** One number `u` decides: `u < empty_share` gives a system without planets; for a star of
//!   a class in `giant_classes`, `u < empty_share + giant_share` gives a system with gas giants. Both
//!   shares hold over all systems (of those classes), and an empty system never holds a giant. A
//!   second number gives a native civilisation with probability `civilization_share / (1 − empty_share)`
//!   among the systems with planets, so `civilization_share` over all systems; a third gives a belt
//!   with probability `belt_share`, in a system without planets too.
//! - **Planets.** Their number is uniform in 1 ..= `max_planets`. Planet `k` of `n` has its nominal
//!   orbit at `(k + 0.2 + 0.6·u) / n` of the orbit window on a log scale, so the planets spread over
//!   the window in order; the belt's nominal orbit is anywhere in the window. In a system with giants
//!   every planet whose nominal orbit lies beyond the snow line is a giant, and the outermost planet
//!   is one in any case; every other planet is rocky. In a system with a civilisation the innermost
//!   planet is rocky.
//! - **Bodies.** Each body draws its size, surface and moons; the moons are laid out around it, so its
//!   reach (its radius, or its outermost moon) is known before its orbit.
//! - **Orbits.** From the star outwards a body keeps its nominal orbit unless that brings it too close
//!   to the body inside it: its orbit is at least [`CLEARANCE`] × (the outer edge of the body inside +
//!   its own reach), so neither discs nor moons touch. A giant also stays [`SNOW_MARGIN`] beyond the
//!   snow line. When a body ends beyond the window, the nominal orbits are drawn towards the inner
//!   edge of the window in [`SQUEEZE_STEPS`] steps; when even the tightest layout overflows, the
//!   outermost planet up to the overflowing body is removed, unless it is the innermost planet or the
//!   innermost giant, and the layout starts again. The belt is never removed that way, so the shares
//!   above survive the layout; only a window too small for these kept bodies cuts them off.
//! - **Civilisation.** It lives on one of the rocky planets, picked uniformly once the layout is done.
//!
//! Periods follow the existing worlds: a planet at 900 circles in 240 min and a moon at 160 from its
//! planet in 40 min (FACT: the PoC), both scaled with r^1.5 as in Tau Ceti; the star's mass is not used.

use std::f64::consts::TAU;

use indexmap::IndexMap;

use super::cell_stars::between;
use super::{
    BeltSpec, Bounds, CountBounds, DepositParams, GalaxyParams, MoonSpec, PlanetKind, PlanetSpec, Rng, StarKey, StarOrigin, SurfaceSpec,
    SystemParams, SystemSpec, profile, stars_in_cell, streams,
};
use crate::models::body::Atmosphere;

/// Insolation 1 at this orbit around a star of 1 L☉ (FACT: `sim::colony::insolation_of`).
pub(super) const REFERENCE_ORBIT: f64 = 900.0;

/// Minutes per circle at [`REFERENCE_ORBIT`] (FACT: the PoC planet).
const REFERENCE_PERIOD: f64 = 240.0;

/// A moon this far from its planet circles in [`MOON_REFERENCE_PERIOD`] minutes (FACT: the PoC moon).
const MOON_REFERENCE_ORBIT: f64 = 160.0;
const MOON_REFERENCE_PERIOD: f64 = 40.0;

/// An orbit is at least this factor beyond the outer edge of the body inside plus the body's own reach.
const CLEARANCE: f64 = 1.05;

/// A giant orbits at least this factor beyond the snow line, so its insolation stays below the limit.
const SNOW_MARGIN: f64 = 1.01;

/// How many times the nominal orbits are drawn in before a planet is removed.
const SQUEEZE_STEPS: u32 = 4;

/// FACT: the radius of the body of Tau Ceti's belt.
const BELT_RADIUS: f64 = 14.0;

/// Every atmosphere is equally likely on a rocky planet.
const ATMOSPHERES: [Atmosphere; 4] = [Atmosphere::None, Atmosphere::Trace, Atmosphere::Thin, Atmosphere::Dense];

/// Sizes of moons in radii of their planet: the moon's radius, the first orbit and the step from one
/// orbit to the next (before the clearance rule).
struct MoonShape {
    radius: Bounds,
    first: Bounds,
    step: Bounds,
}

/// PROPOSAL; FACT: the PoC moon has 0.3 planet radii and orbits at 3.2.
const ROCKY_MOONS: MoonShape =
    MoonShape { radius: Bounds { min: 0.2, max: 0.3 }, first: Bounds { min: 2.5, max: 3.5 }, step: Bounds { min: 1.0, max: 1.5 } };

/// PROPOSAL: moons of a size like those of rocky planets, close enough that four of them keep the
/// giant's reach near five of its radii.
const GIANT_MOONS: MoonShape =
    MoonShape { radius: Bounds { min: 0.08, max: 0.15 }, first: Bounds { min: 1.8, max: 2.5 }, step: Bounds { min: 0.6, max: 0.9 } };

/// A moon as drawn, relative to its planet.
struct Moon {
    orbit_radius: f64,
    radius: f64,
    initial_angle: f64,
}

/// A planet as drawn, before its orbit is known.
struct Planet {
    kind: PlanetKind,
    radius: f64,
    atmosphere: Atmosphere,
    surface: Option<SurfaceSpec>,
    /// Gas giants only; a rocky planet takes the colour of its profile.
    colour: u32,
    moons: Vec<Moon>,
    initial_angle: f64,
}

enum Body {
    Planet(Planet),
    Belt { deposits: IndexMap<String, f64>, initial_angle: f64 },
}

/// A body waiting for its orbit.
struct Slot {
    /// The nominal orbit as a fraction of the window on a log scale, in [0, 1).
    nominal: f64,
    /// Its radius, or the farthest edge of its moons.
    reach: f64,
    /// Never removed to make room: the innermost planet, the innermost giant and the belt.
    kept: bool,
    body: Body,
}

impl Slot {
    fn is_giant(&self) -> bool {
        matches!(&self.body, Body::Planet(planet) if planet.kind == PlanetKind::GasGiant)
    }
}

pub(super) fn generate_system(p: &GalaxyParams, key: StarKey) -> Option<SystemSpec> {
    let star = stars_in_cell(p, key.cell).into_iter().nth(usize::from(key.index))?;
    if star.origin != StarOrigin::Generated {
        return None;
    }
    let rules = &p.system;
    let mut rng = Rng::for_cell(p.seed, key.cell, streams::system(key.index));

    // the kind of system
    let kind_draw = rng.next_f64();
    let civilization_draw = rng.next_f64();
    let belt_draw = rng.next_f64();
    let star_body_draw = rng.next_f64();
    let home_draw = rng.next_u64();
    let count_draw = rng.next_u64();
    let belt_orbit_draw = rng.next_f64();

    let empty = kind_draw < rules.empty_share;
    let giant_class = star.class.is_some_and(|c| rules.giant_classes.contains(&c));
    let giants = !empty && giant_class && kind_draw < rules.empty_share + rules.giant_share;
    let civilization = !empty && civilization_draw * (1.0 - rules.empty_share) < rules.civilization_share;
    let star_body_radius = between(rules.star_body_radius, star_body_draw);

    let mut count = if empty || rules.max_planets == 0 { 0 } else { 1 + below(count_draw, u64::from(rules.max_planets)) as u32 };
    if giants && civilization && count == 1 && rules.max_planets >= 2 {
        // a giant and a rocky home of the civilisation
        count = 2;
    }

    // nominal orbits and kinds
    let snow = REFERENCE_ORBIT * (star.luminosity / rules.snow_line_insolation).sqrt();
    let nominal: Vec<f64> = (0..count).map(|k| (f64::from(k) + 0.2 + 0.6 * rng.next_f64()) / f64::from(count)).collect();
    let mut kinds: Vec<PlanetKind> = nominal
        .iter()
        .map(|&at| if giants && between(rules.orbit_radius, at) > snow { PlanetKind::GasGiant } else { PlanetKind::Rocky })
        .collect();
    if giants
        && !kinds.contains(&PlanetKind::GasGiant)
        && let Some(outermost) = kinds.last_mut()
    {
        *outermost = PlanetKind::GasGiant;
    }
    if civilization && kinds.len() >= 2 && kinds[0] == PlanetKind::GasGiant {
        // every planet lies beyond the snow line, so the others stay giants
        kinds[0] = PlanetKind::Rocky;
    }

    // the bodies
    let first_giant = kinds.iter().position(|k| *k == PlanetKind::GasGiant);
    let mut slots: Vec<Slot> = Vec::with_capacity(kinds.len() + 1);
    for (k, (at, kind)) in nominal.into_iter().zip(kinds).enumerate() {
        let planet = match kind {
            PlanetKind::Rocky => draw_rocky(&mut rng, rules),
            PlanetKind::GasGiant => draw_giant(&mut rng, rules),
        };
        let reach = planet.moons.iter().fold(planet.radius, |reach, m| larger(reach, m.orbit_radius + m.radius));
        slots.push(Slot { nominal: at, reach, kept: k == 0 || first_giant == Some(k), body: Body::Planet(planet) });
    }
    if belt_draw < rules.belt_share {
        let deposits = draw_deposits(&mut rng, &rules.belt_deposits);
        let initial_angle = draw_angle(&mut rng);
        let at = slots.iter().position(|s| s.nominal > belt_orbit_draw).unwrap_or(slots.len());
        let belt = Slot { nominal: belt_orbit_draw, reach: BELT_RADIUS, kept: true, body: Body::Belt { deposits, initial_angle } };
        slots.insert(at, belt);
    }

    let orbits = fit(&mut slots, star_body_radius, rules.orbit_radius, snow * SNOW_MARGIN);

    // the home of the civilisation, among the rocky planets that remain
    let rocky: Vec<usize> = slots
        .iter()
        .enumerate()
        .filter(|(_, s)| matches!(&s.body, Body::Planet(planet) if planet.kind == PlanetKind::Rocky))
        .map(|(i, _)| i)
        .collect();
    let home = if civilization && !rocky.is_empty() { Some(rocky[below(home_draw, rocky.len() as u64) as usize]) } else { None };

    let mut planets: Vec<PlanetSpec> = Vec::with_capacity(slots.len());
    let mut belt: Option<BeltSpec> = None;
    for (i, (slot, orbit_radius)) in slots.into_iter().zip(orbits).enumerate() {
        let insolation = star.luminosity * (REFERENCE_ORBIT / orbit_radius) * (REFERENCE_ORBIT / orbit_radius);
        let orbit_speed = angular_speed(orbit_radius, REFERENCE_ORBIT, REFERENCE_PERIOD);
        match slot.body {
            Body::Planet(planet) => planets.push(finish_planet(planet, orbit_radius, orbit_speed, insolation, home == Some(i))),
            Body::Belt { deposits, initial_angle } => {
                belt = Some(BeltSpec {
                    orbit_radius,
                    orbit_speed,
                    initial_angle,
                    radius: BELT_RADIUS,
                    insolation,
                    color: profile::BELT_COLOUR,
                    profile: profile::belt(&deposits),
                });
            }
        }
    }
    Some(SystemSpec { star, star_body_radius, planets, belt })
}

/// Orbits for the slots inside the window, removing planets when they do not fit (see the module
/// header); `giant_min` is the innermost orbit of a giant.
fn fit(slots: &mut Vec<Slot>, star_body_radius: f64, window: Bounds, giant_min: f64) -> Vec<f64> {
    let mut squeeze = SQUEEZE_STEPS;
    loop {
        let scale = f64::from(squeeze) / f64::from(SQUEEZE_STEPS);
        let outside = match lay_out(slots, star_body_radius, window, giant_min, scale) {
            Ok(orbits) => return orbits,
            Err(outside) => outside,
        };
        if squeeze > 0 {
            squeeze -= 1;
            continue;
        }
        match slots[..=outside].iter().rposition(|s| !s.kept) {
            Some(i) => {
                slots.remove(i);
                squeeze = SQUEEZE_STEPS;
            }
            // only parameters whose window cannot hold the kept bodies get here
            None => slots.truncate(outside),
        }
    }
}

/// The orbits from the star outwards with the nominal orbits at `scale` of their place in the
/// window, or the index of the first slot that ends beyond the window.
fn lay_out(slots: &[Slot], star_body_radius: f64, window: Bounds, giant_min: f64, scale: f64) -> Result<Vec<f64>, usize> {
    let mut orbits = Vec::with_capacity(slots.len());
    let mut edge = star_body_radius;
    for (i, slot) in slots.iter().enumerate() {
        let mut orbit = larger(between(window, slot.nominal * scale), (edge + slot.reach) * CLEARANCE);
        if slot.is_giant() {
            orbit = larger(orbit, giant_min);
        }
        if orbit > window.max || orbit.is_nan() {
            return Err(i);
        }
        orbits.push(orbit);
        edge = orbit + slot.reach;
    }
    Ok(orbits)
}

fn draw_rocky(rng: &mut Rng, rules: &SystemParams) -> Planet {
    let frequency = draw_count(rng, rules.grid_frequency);
    let radius = rules.radius_per_frequency * f64::from(frequency);
    let atmosphere = ATMOSPHERES[below(rng.next_u64(), ATMOSPHERES.len() as u64) as usize];
    // a whole number in 0 ..= 2^31 − 1
    let deposit_seed = (rng.next_u64() >> 33) as f64;
    let deposit_weights = draw_deposits(rng, &rules.deposits);
    let has_moons = rng.next_f64() < rules.rocky_moon_share;
    let moons = if has_moons { draw_moons(rng, radius, rules.rocky_moon_count, &ROCKY_MOONS) } else { Vec::new() };
    let initial_angle = draw_angle(rng);
    Planet {
        kind: PlanetKind::Rocky,
        radius,
        atmosphere,
        surface: Some(SurfaceSpec { grid_frequency: frequency, deposit_seed, deposit_weights }),
        colour: 0,
        moons,
        initial_angle,
    }
}

fn draw_giant(rng: &mut Rng, rules: &SystemParams) -> Planet {
    let radius = between(rules.giant_radius, rng.next_f64());
    let colour = profile::GIANT_COLOURS[below(rng.next_u64(), profile::GIANT_COLOURS.len() as u64) as usize];
    let count = draw_count(rng, rules.giant_moons);
    let moons = draw_moons(rng, radius, count, &GIANT_MOONS);
    let initial_angle = draw_angle(rng);
    Planet { kind: PlanetKind::GasGiant, radius, atmosphere: Atmosphere::Dense, surface: None, colour, moons, initial_angle }
}

/// `count` moons by growing orbit; a moon's orbit is at least [`CLEARANCE`] × (the outer edge of
/// the body inside + its radius), so the discs neither touch the planet nor each other.
fn draw_moons(rng: &mut Rng, planet_radius: f64, count: u32, shape: &MoonShape) -> Vec<Moon> {
    let mut moons: Vec<Moon> = Vec::new();
    let mut edge = planet_radius;
    let mut orbit = 0.0;
    for j in 0..count {
        let radius = planet_radius * between(shape.radius, rng.next_f64());
        let step = planet_radius * between(if j == 0 { shape.first } else { shape.step }, rng.next_f64());
        orbit = larger(orbit + step, (edge + radius) * CLEARANCE);
        moons.push(Moon { orbit_radius: orbit, radius, initial_angle: draw_angle(rng) });
        edge = orbit + radius;
    }
    moons
}

/// Each material with probability `share` and a weight inside its bounds. When none is drawn, one
/// material with a positive share is picked with probability share / Σ shares, so a surface is never
/// without deposits (`math::deposits` needs a weight); a share of 0 is never picked.
fn draw_deposits(rng: &mut Rng, rules: &[DepositParams]) -> IndexMap<String, f64> {
    let mut drawn: IndexMap<String, f64> = IndexMap::new();
    let mut weights: Vec<f64> = Vec::with_capacity(rules.len());
    for rule in rules {
        let held = rng.next_f64() < rule.share;
        let weight = between(rule.weight, rng.next_f64());
        weights.push(weight);
        if held {
            drawn.insert(rule.material.clone(), weight);
        }
    }
    let fallback = rng.next_f64();
    if drawn.is_empty() {
        let total: f64 = rules.iter().filter(|r| r.share > 0.0).map(|r| r.share).sum();
        let target = fallback * total;
        let mut covered = 0.0;
        let mut last = None;
        for (i, rule) in rules.iter().enumerate().filter(|(_, r)| r.share > 0.0) {
            covered += rule.share;
            last = Some(i);
            if target < covered {
                break;
            }
        }
        // only rounding of the running sum ends the loop without a break: the last material then
        if let Some(i) = last {
            drawn.insert(rules[i].material.clone(), weights[i]);
        }
    }
    drawn
}

fn finish_planet(planet: Planet, orbit_radius: f64, orbit_speed: f64, insolation: f64, civilization: bool) -> PlanetSpec {
    let moons: Vec<MoonSpec> = planet
        .moons
        .iter()
        .map(|m| MoonSpec {
            orbit_radius: m.orbit_radius,
            orbit_speed: angular_speed(m.orbit_radius, MOON_REFERENCE_ORBIT, MOON_REFERENCE_PERIOD),
            initial_angle: m.initial_angle,
            radius: m.radius,
            atmosphere: Atmosphere::None,
            color: profile::MOON_COLOUR,
            surface: None,
            profile: profile::moon(insolation),
        })
        .collect();
    let (profile, color) = match (&planet.kind, &planet.surface) {
        (PlanetKind::Rocky, Some(surface)) => {
            profile::rocky(insolation, planet.atmosphere, &surface.deposit_weights, moons.len(), civilization)
        }
        _ => (profile::giant(insolation, moons.len()), planet.colour),
    };
    PlanetSpec {
        kind: planet.kind,
        orbit_radius,
        orbit_speed,
        initial_angle: planet.initial_angle,
        radius: planet.radius,
        insolation,
        atmosphere: planet.atmosphere,
        color,
        surface: planet.surface,
        profile,
        moons,
        native_civilization: civilization,
    }
}

/// Radians per model minute on a circle of radius `r`, whose period is `period` at `reference` and
/// grows with r^1.5 (`x·√x`: only operations that are exact in IEEE 754).
fn angular_speed(r: f64, reference: f64, period: f64) -> f64 {
    let x = r / reference;
    TAU / (period * x * x.sqrt())
}

/// In [0, 2π).
fn draw_angle(rng: &mut Rng) -> f64 {
    let angle = rng.next_f64() * TAU;
    if angle < TAU { angle } else { 0.0 }
}

/// Uniform in `min ..= max` (`min` when `max <= min`).
fn draw_count(rng: &mut Rng, b: CountBounds) -> u32 {
    let x = rng.next_u64();
    if b.max <= b.min {
        return b.min;
    }
    b.min + below(x, u64::from(b.max - b.min) + 1) as u32
}

/// `x`, uniform over the u64 values, mapped uniformly onto `0 .. len`: the high 64 bits of `x · len`.
fn below(x: u64, len: u64) -> u64 {
    ((u128::from(x) * u128::from(len)) >> 64) as u64
}

fn larger(a: f64, b: f64) -> f64 {
    if a > b { a } else { b }
}
