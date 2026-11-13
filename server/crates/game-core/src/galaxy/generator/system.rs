//! The planetary system of a generated star (task E1-05).
//!
//! A system is drawn in three steps, each a pure function of the parameters and the star's key:
//! 1. what the system holds. One draw places it among the shares: no planet (`empty_share`), a gas
//!    giant (`giant_share`, for a class of `giant_classes`) or rocky planets only. A system with
//!    planets holds a rocky planet, so a civilisation always finds a home, and the number of its
//!    planets is spread evenly up to `max_planets`. The belt and the civilisation are draws of their
//!    own;
//! 2. the bodies without their orbits: every rocky planet from a stream of its own (size, moons,
//!    atmosphere, deposits), the giant and the belt from theirs;
//! 3. the orbits. The bodies are set side by side as close to the star as their reach and the
//!    clearance allow, and the room that is left is shared out among them. A giant is placed first,
//!    beyond the snow line: a system has one giant at most, and it is the outermost body.
//!
//! Sizes, colours and words that the parameters do not hold are the constants below, each marked
//! FACT (it repeats an existing world) or PROPOSAL.
//!
//! The parameters are taken as they are documented (shares in 0 ..= 1, ranges with `min <= max`,
//! positive sizes). Other values give no panic and no endless loop, and no promise about the system.

use std::f64::consts::TAU;

use indexmap::IndexMap;

use super::cell_stars::within;
use super::{
    BeltSpec, Bounds, CountBounds, DepositParams, GalaxyParams, MoonSpec, PlanetKind, PlanetSpec, Rng, StarKey, StarOrigin, StarSpec,
    SurfaceSpec, SystemParams, SystemSpec, stars_in_cell,
};
use crate::models::body::{Atmosphere, BodyProfile};

/// Streams of a cell's [`Rng`], after the two purposes that `cell_stars` takes. The high 32 bits
/// name the purpose; of the low 32 bits the upper half is the star's index in its cell and the
/// lower half a part of its system.
const SHAPE_STREAMS: u64 = 2 << 32;
const PLANET_STREAMS: u64 = 3 << 32;
const GIANT_STREAMS: u64 = 4 << 32;
const BELT_STREAMS: u64 = 5 << 32;

/// The most planets and the most moons of one planet that are ever drawn. They bound the work when
/// a count of the parameters makes no sense.
const PLANET_LIMIT: u32 = 100;
const MOON_LIMIT: u32 = 100;

/// FACT: an orbit of 900 around a star of 1 L☉ has insolation 1 (`sim::colony`).
pub(super) const REFERENCE_ORBIT: f64 = 900.0;
/// FACT: the PoC planet takes 240 model minutes around its sun at 900, and Tau Ceti's planets scale
/// that period with the orbit to the power of 1.5 (`sim::scenarios`).
const REFERENCE_PERIOD: f64 = 240.0;
/// FACT: the PoC moon takes 40 model minutes at 160 around a planet of radius 50: 3.2 radii.
const MOON_REFERENCE_ORBIT: f64 = 3.2;
const MOON_REFERENCE_PERIOD: f64 = 40.0;

/// Room between the discs of two neighbouring bodies and between the star's body and the first one.
/// PROPOSAL. FACT: the closest pair of Tau Ceti (d and e) leaves 4.5.
const CLEARANCE: f64 = 10.0;
/// Room between the disc of a moon and the disc inside its orbit (the planet or the moon before it).
/// PROPOSAL. FACT: 95 in the PoC.
const MOON_SPACING: Bounds = Bounds { min: 60.0, max: 100.0 };
/// Radius of the moon of a rocky planet, in radii of the planet. PROPOSAL. FACT: 0.3 in the PoC.
const ROCKY_MOON_SIZE: Bounds = Bounds { min: 0.2, max: 0.3 };

/// FACT: the body and the colour of Tau Ceti's dust belt.
const BELT_BODY_RADIUS: f64 = 14.0;
const BELT_COLOR: u32 = 0x6b5a48;
/// FACT: the colour of the PoC moon.
const MOON_COLOR: u32 = 0x9ca3af;
/// PROPOSAL: one colour for every gas giant; their look is decided in E6-02.
const GIANT_COLOR: u32 = 0xd9b38c;

/// The material whose deposits are the ice of a scan profile. FACT: Tau Ceti's profiles report
/// water where the body holds Kriol.
const ICE_MATERIAL: &str = "KRI";
/// The rating of a body nothing is built on. FACT: Tau Ceti's belt.
const EXPEDITIONS: &str = "wyprawy";
/// A profile value that does not apply. FACT: Tau Ceti's belt.
const NOT_APPLICABLE: &str = "—";

pub(super) fn generate_system(p: &GalaxyParams, key: StarKey) -> Option<SystemSpec> {
    let star = stars_in_cell(p, key.cell).into_iter().nth(usize::from(key.index))?;
    if star.origin != StarOrigin::Generated {
        return None;
    }
    Some(system_of(p, star))
}

fn system_of(p: &GalaxyParams, star: StarSpec) -> SystemSpec {
    let rules = &p.system;
    let key = star.key;
    let luminosity = star.luminosity;
    let star_body_radius = star_body_radius(p, &star);

    // The draws that shape the system, in a fixed order; each is taken whether it is used or not.
    let mut shape = rng(p, key, SHAPE_STREAMS, 0);
    let kind_draw = shape.next_f64();
    let count_draw = shape.next_f64();
    let belt_draw = shape.next_f64();
    let belt_place_draw = shape.next_f64();
    let civilization_draw = shape.next_f64();
    let home_draw = shape.next_f64();
    let giant_orbit_draw = shape.next_f64();

    // One draw over the shares: [0, empty) no planet, [empty, empty + giant) a giant, the rest rocky
    // planets only. The classes without giants have no middle part.
    let has_planets = kind_draw >= rules.empty_share;
    let most = rules.max_planets.min(PLANET_LIMIT);
    let giant_class = star.class.is_some_and(|class| rules.giant_classes.contains(&class));
    let has_giant = has_planets && giant_class && most > 0 && kind_draw < rules.empty_share + rules.giant_share;
    let most_rocky = if has_giant { most - 1 } else { most };
    let rocky_count = if has_planets && most_rocky > 0 { count_within(CountBounds { min: 1, max: most_rocky }, count_draw) } else { 0 };

    // The bodies inside the giant's orbit, innermost first: the rocky planets, and the belt anywhere
    // among them.
    let slots = u16::try_from(rocky_count).unwrap_or(u16::MAX);
    let mut inner: Vec<Body> = (0..slots).filter_map(|slot| rocky_draft(p, key, slot)).map(|draft| Body::Planet(Box::new(draft))).collect();
    if belt_draw < rules.belt_share {
        let place = index_below(inner.len() + 1, belt_place_draw);
        inner.insert(place, Body::Belt(belt_draft(p, key)));
    }
    let giant = has_giant.then(|| giant_draft(p, key));

    let reaches: Vec<f64> = inner.iter().map(Body::reach).collect();
    let giant_reach = giant.as_ref().map(Draft::reach);
    let orbits = lay_out(rules, star_body_radius, luminosity, &reaches, giant_reach, giant_orbit_draw, &mut shape);

    let mut planets: Vec<PlanetSpec> = Vec::new();
    let mut belt = None;
    // a body that found no room has no orbit: it is left out
    for (body, orbit) in inner.into_iter().zip(orbits.inner) {
        match body {
            Body::Planet(draft) => planets.push(planet_at(*draft, luminosity, orbit)),
            Body::Belt(draft) => belt = Some(belt_at(draft, luminosity, orbit)),
        }
    }

    // Only a system with planets can have a civilisation, so its chance there is the share of all
    // the systems over the share of those with planets. Its home is one of the rocky planets.
    if has_planets && civilization_draw * (1.0 - rules.empty_share) < rules.civilization_share && !planets.is_empty() {
        let home = index_below(planets.len(), home_draw);
        planets[home].native_civilization = true;
    }

    if let (Some(draft), Some(orbit)) = (giant, orbits.giant) {
        let planet = planet_at(draft, luminosity, orbit);
        // the orbit lies beyond the snow line; what the contract promises is the value itself
        if planet.insolation < rules.snow_line_insolation {
            planets.push(planet);
        }
    }

    SystemSpec { star, star_body_radius, planets, belt }
}

/// The stream of one part of a star's system.
fn rng(p: &GalaxyParams, star: StarKey, purpose: u64, part: u16) -> Rng {
    Rng::for_cell(p.seed, star.cell, purpose | (u64::from(star.index) << 16) | u64::from(part))
}

/// The radius of the star's body on the scene: the star's place between the smallest and the largest
/// star the parameters generate, on a logarithmic scale of the radius, taken into the range of the
/// body. PROPOSAL: no draw, so a larger star is a larger body.
fn star_body_radius(p: &GalaxyParams, star: &StarSpec) -> f64 {
    let (mut smallest, mut largest) = (f64::INFINITY, 0.0);
    for class in p.classes.iter().filter(|class| class.share > 0.0) {
        if class.radius.min < smallest {
            smallest = class.radius.min;
        }
        if class.radius.max > largest {
            largest = class.radius.max;
        }
    }
    let place = if smallest > 0.0 && largest > smallest { libm::log(star.radius / smallest) / libm::log(largest / smallest) } else { 0.5 };
    // one size of star only, or a radius that has no logarithm: the middle of the range
    within(p.system.star_body_radius, if place.is_finite() { place } else { 0.5 })
}

// ------------------------------------------------------------------------------------------------
// bodies before their orbits

/// A planet before its orbit is known.
struct Draft {
    kind: PlanetKind,
    radius: f64,
    initial_angle: f64,
    atmosphere: Atmosphere,
    surface: Option<SurfaceSpec>,
    /// Complete but for the temperature, which follows the orbit.
    profile: BodyProfile,
    /// By growing orbit; complete but for the temperature of their profiles.
    moons: Vec<MoonSpec>,
}

impl Draft {
    /// How far the planet reaches from its orbit: its radius, or its outermost moon.
    fn reach(&self) -> f64 {
        self.moons.last().map_or(self.radius, |moon| moon.orbit_radius + moon.radius)
    }
}

/// A belt before its orbit is known.
struct BeltDraft {
    initial_angle: f64,
    deposits: IndexMap<String, f64>,
}

/// What lies on one orbit inside the giant's. The planet is boxed: its draft is several times the belt's.
enum Body {
    Planet(Box<Draft>),
    Belt(BeltDraft),
}

impl Body {
    fn reach(&self) -> f64 {
        match self {
            Body::Planet(draft) => draft.reach(),
            Body::Belt(_) => BELT_BODY_RADIUS,
        }
    }
}

/// What a moon is, apart from its orbit.
struct MoonBody {
    radius: f64,
    atmosphere: Atmosphere,
    surface: Option<SurfaceSpec>,
    profile: BodyProfile,
}

/// The rocky planet `slot` of a star, drawn from its own stream in a fixed order: grid, angle,
/// atmosphere, moons or none, deposits, then the moons. `None` when the parameters leave it no
/// deposit material: a surface holds at least one.
fn rocky_draft(p: &GalaxyParams, star: StarKey, slot: u16) -> Option<Draft> {
    let rules = &p.system;
    let mut rng = rng(p, star, PLANET_STREAMS, slot);
    let grid_frequency = count_within(rules.grid_frequency, rng.next_f64()).max(1);
    let radius = rules.radius_per_frequency * f64::from(grid_frequency);
    let initial_angle = angle(rng.next_f64());
    let atmosphere = atmosphere(rng.next_f64());
    // the human's rule (E1-01 question 3 = b): every rocky planet draws on its own
    let has_moons = rng.next_f64() < rules.rocky_moon_share;
    let deposit_weights = deposits(&rules.deposits, &mut rng);
    let deposit_seed = deposit_seed(&mut rng);
    if deposit_weights.is_empty() {
        return None;
    }

    let moon_count = if has_moons { rules.rocky_moon_count.min(MOON_LIMIT) } else { 0 };
    // data only (P-19 a): no surface, like the PoC moon no atmosphere
    let moons = moons(moon_count, radius, &mut rng, |rng| MoonBody {
        radius: radius * within(ROCKY_MOON_SIZE, rng.next_f64()),
        atmosphere: Atmosphere::None,
        surface: None,
        profile: remote_profile("księżyc skalisty", String::new(), IndexMap::new()),
    });
    let note = if moons.is_empty() { String::new() } else { format!("Księżyce: {}.", moons.len()) };
    Some(Draft {
        kind: PlanetKind::Rocky,
        radius,
        initial_angle,
        atmosphere,
        profile: surface_profile("planeta skalista", atmosphere, &deposit_weights, &rules.deposits, note),
        surface: Some(SurfaceSpec { grid_frequency, deposit_seed, deposit_weights }),
        moons,
    })
}

/// The gas giant of a star, drawn from its own stream: radius, angle, the number of moons, the moons.
/// Every moon that the parameters leave a deposit material has a surface: nothing lands on the giant
/// (Q23 c), its moons are where one lands.
fn giant_draft(p: &GalaxyParams, star: StarKey) -> Draft {
    let rules = &p.system;
    let mut rng = rng(p, star, GIANT_STREAMS, 0);
    let radius = within(rules.giant_radius, rng.next_f64());
    let initial_angle = angle(rng.next_f64());
    let moon_count = count_within(rules.giant_moons, rng.next_f64()).min(MOON_LIMIT);
    let frequencies = moon_grid_frequency(rules);
    let moons = moons(moon_count, radius, &mut rng, |rng| {
        let grid_frequency = count_within(frequencies, rng.next_f64());
        let atmosphere = atmosphere(rng.next_f64());
        let deposit_weights = deposits(&rules.deposits, rng);
        let deposit_seed = deposit_seed(rng);
        let (surface, profile) = if deposit_weights.is_empty() {
            (None, remote_profile("księżyc skalisty", String::new(), IndexMap::new()))
        } else {
            let profile = surface_profile("księżyc skalisty", atmosphere, &deposit_weights, &rules.deposits, String::new());
            (Some(SurfaceSpec { grid_frequency, deposit_seed, deposit_weights }), profile)
        };
        // the tiles keep the width of a rocky planet's
        MoonBody { radius: rules.radius_per_frequency * f64::from(grid_frequency), atmosphere, surface, profile }
    });
    let note = format!("Bez powierzchni, lądowanie niemożliwe. Księżyce: {}.", moons.len());
    Draft {
        kind: PlanetKind::GasGiant,
        radius,
        initial_angle,
        atmosphere: Atmosphere::Dense,
        surface: None,
        // no parameter says what a giant holds: the profile lists nothing
        profile: remote_profile("gazowy olbrzym", note, IndexMap::new()),
        moons,
    }
}

/// The belt of a star, drawn from its own stream: angle, then the materials of its profile.
fn belt_draft(p: &GalaxyParams, star: StarKey) -> BeltDraft {
    let mut rng = rng(p, star, BELT_STREAMS, 0);
    BeltDraft { initial_angle: angle(rng.next_f64()), deposits: deposits(&p.system.belt_deposits, &mut rng) }
}

/// The moons of one planet, innermost first. `body` draws what each moon is; its spacing and angle
/// follow from the same stream.
fn moons(count: u32, planet_radius: f64, rng: &mut Rng, mut body: impl FnMut(&mut Rng) -> MoonBody) -> Vec<MoonSpec> {
    // the outer edge of the disc inside the next orbit
    let mut edge = planet_radius;
    (0..count)
        .map(|_| {
            let MoonBody { radius, atmosphere, surface, profile } = body(rng);
            let orbit_radius = edge + within(MOON_SPACING, rng.next_f64()) + radius;
            edge = orbit_radius + radius;
            MoonSpec {
                orbit_radius,
                // the same period at the same number of planet radii: planets of one density
                orbit_speed: orbit_speed(orbit_radius, MOON_REFERENCE_ORBIT * planet_radius, MOON_REFERENCE_PERIOD),
                initial_angle: angle(rng.next_f64()),
                radius,
                atmosphere,
                color: MOON_COLOR,
                surface,
                profile,
            }
        })
        .collect()
}

/// Grid frequencies of a giant's moons: below every rocky planet of the parameters, and from 2 where
/// that leaves room (n = 1 is twelve pentagons). PROPOSAL. FACT: the PoC moon has n = 3.
fn moon_grid_frequency(rules: &SystemParams) -> CountBounds {
    let planets = rules.grid_frequency;
    let max = planets.min.saturating_sub(1).min(planets.max).max(1);
    CountBounds { min: max.min(2), max }
}

/// The materials a body holds, with their weights. Every material of the rules is taken with its
/// share, on its own; a body left with nothing takes one material, the likelier the larger its share.
/// Empty only when no material can be taken. Two numbers are drawn for each rule and one more at the
/// end, whatever the body holds.
fn deposits(rules: &[DepositParams], rng: &mut Rng) -> IndexMap<String, f64> {
    let mut held: IndexMap<String, f64> = IndexMap::new();
    // the materials that can be taken, each with the weight it has on this body
    let mut offered: Vec<(&DepositParams, f64)> = Vec::new();
    for rule in rules {
        let holds = rng.next_f64() < rule.share;
        let weight = within(rule.weight, rng.next_f64());
        // share 0 is never, and a weight that is not positive is no deposit
        if rule.share > 0.0 && weight > 0.0 {
            if holds {
                held.insert(rule.material.clone(), weight);
            }
            offered.push((rule, weight));
        }
    }
    let spare = rng.next_f64();
    if held.is_empty() {
        let total: f64 = offered.iter().map(|(rule, _)| rule.share).sum();
        let target = spare * total;
        let mut below = 0.0;
        let mut taken = None;
        for offer in &offered {
            // should `target` round up to the whole sum, the last material is taken
            taken = Some(offer);
            below += offer.0.share;
            if target < below {
                break;
            }
        }
        if let Some((rule, weight)) = taken {
            held.insert(rule.material.clone(), *weight);
        }
    }
    held
}

/// A whole number in 0 ..= 2^31 − 1, as `math::noise::hash3` reads the seed.
fn deposit_seed(rng: &mut Rng) -> f64 {
    // 31 bits: exact as f64
    (rng.next_u64() >> 33) as f64
}

// ------------------------------------------------------------------------------------------------
// orbits

/// Orbits of the bodies of a system.
struct Orbits {
    /// Of the bodies inside the giant's orbit, innermost first; fewer than the bodies when the outer
    /// ones found no room.
    inner: Vec<f64>,
    giant: Option<f64>,
}

/// Sets the bodies on their orbits. `reaches` are the bodies inside the giant's orbit, innermost
/// first; the giant comes with `giant_reach`.
///
/// Every disc ends at least [`CLEARANCE`] before the next one begins, the first begins beyond the
/// star's body, and every orbit lies inside the range of the parameters. A giant lies beyond the snow
/// line. When the range is too narrow, the outermost inner bodies are left out, first of all those
/// that would leave the giant no room.
fn lay_out(
    rules: &SystemParams,
    star_body_radius: f64,
    luminosity: f64,
    reaches: &[f64],
    giant_reach: Option<f64>,
    giant_draw: f64,
    rng: &mut Rng,
) -> Orbits {
    let Bounds { min: lowest, max: highest } = rules.orbit_radius;
    // Where the disc of the first body can begin: beyond the star's body, and so far out that its
    // orbit is inside the range.
    let start = |reach: f64| {
        let edge = lowest - CLEARANCE - reach;
        if edge > star_body_radius { edge } else { star_body_radius }
    };

    // Every body as close to the star as the clearances allow: its orbit there and the outer edge of
    // its disc.
    let mut packed: Vec<(f64, f64)> = Vec::with_capacity(reaches.len());
    let mut edge = reaches.first().map_or(star_body_radius, |first| start(*first));
    for reach in reaches {
        let orbit = edge + CLEARANCE + reach;
        edge = orbit + reach;
        packed.push((orbit, edge));
    }
    let mut kept = packed.iter().take_while(|(orbit, _)| *orbit <= highest).count();

    // The giant first: beyond the snow line and beyond the bodies that leave it room, anywhere up to
    // the end of the range, evenly on a logarithmic scale.
    let mut giant = None;
    if let Some(reach) = giant_reach {
        // the nearest orbit of the giant around a disc that ends at `edge`
        let around = |edge: f64| edge + CLEARANCE + reach;
        let inside = packed.iter().take_while(|(_, edge)| around(*edge) <= highest).count();
        let snow_line = REFERENCE_ORBIT * (luminosity / rules.snow_line_insolation).sqrt();
        let mut from = if inside > 0 { around(packed[inside - 1].1) } else { around(start(reach)) };
        if lowest > from {
            from = lowest;
        }
        if snow_line + CLEARANCE > from {
            from = snow_line + CLEARANCE;
        }
        if from <= highest {
            giant = Some((log_between(from, highest, giant_draw), reach));
            kept = inside;
        }
    }

    // The inner bodies move out from their packed orbits: the room they can all move by is shared out
    // by one draw each, the smallest draw to the innermost body.
    let mut inner = Vec::with_capacity(kept);
    if kept > 0 {
        let (first, _) = packed[0];
        let (last, last_edge) = packed[kept - 1];
        let room = match giant {
            Some((orbit, reach)) => orbit - reach - CLEARANCE - last_edge,
            None => highest - last,
        };
        // rounding can leave it a hair below nothing
        let room = if room > 0.0 { room } else { 0.0 };
        let mut places: Vec<f64> = (0..kept).map(|_| toward_the_star(first, first + room, rng.next_f64())).collect();
        places.sort_by(f64::total_cmp);
        for ((orbit, _), place) in packed.iter().zip(places) {
            let orbit = orbit + room * place;
            // the sums can miss an end of the range by a rounding error
            inner.push(if orbit < lowest {
                lowest
            } else if orbit > highest {
                highest
            } else {
                orbit
            });
        }
    }
    Orbits { inner, giant: giant.map(|(orbit, _)| orbit) }
}

/// A place in 0 ..= 1 for `u` in [0, 1), nearer 0 more often: a body that moves alone between the
/// orbits `near` and `far` is spread evenly on a logarithmic scale, as the giant is.
fn toward_the_star(near: f64, far: f64, u: f64) -> f64 {
    let ratio = far / near;
    if ratio > 1.0 && ratio.is_finite() { (libm::pow(ratio, u) - 1.0) / (ratio - 1.0) } else { u }
}

/// The point `u` of the way from `near` to `far` on a logarithmic scale, for `u` in [0, 1); never
/// outside the two.
fn log_between(near: f64, far: f64, u: f64) -> f64 {
    let at = near * libm::pow(far / near, u);
    if near <= at && at <= far {
        at
    } else if at > far {
        far
    } else {
        // also for ends that have no logarithm
        near
    }
}

// ------------------------------------------------------------------------------------------------
// bodies on their orbits

fn planet_at(draft: Draft, luminosity: f64, orbit_radius: f64) -> PlanetSpec {
    let Draft { kind, radius, initial_angle, atmosphere, surface, mut profile, mut moons } = draft;
    let insolation = insolation_at(luminosity, orbit_radius);
    let warmth = Warmth::of(insolation);
    profile.temperature = warmth.temperature().to_string();
    for moon in &mut moons {
        moon.profile.temperature = warmth.temperature().to_string();
    }
    PlanetSpec {
        kind,
        orbit_radius,
        orbit_speed: orbit_speed(orbit_radius, REFERENCE_ORBIT, REFERENCE_PERIOD),
        initial_angle,
        radius,
        insolation,
        atmosphere,
        color: match kind {
            PlanetKind::Rocky => rocky_color(warmth, atmosphere),
            PlanetKind::GasGiant => GIANT_COLOR,
        },
        surface,
        profile,
        moons,
        native_civilization: false,
    }
}

fn belt_at(draft: BeltDraft, luminosity: f64, orbit_radius: f64) -> BeltSpec {
    BeltSpec {
        orbit_radius,
        orbit_speed: orbit_speed(orbit_radius, REFERENCE_ORBIT, REFERENCE_PERIOD),
        initial_angle: draft.initial_angle,
        radius: BELT_BODY_RADIUS,
        insolation: insolation_at(luminosity, orbit_radius),
        color: BELT_COLOR,
        profile: remote_profile("pas asteroid i pyłu", "Wyprawy górnicze; nie da się na nim budować.".to_string(), draft.deposits),
    }
}

/// Star luminosity × (900 / orbit)²: the default rule of `CelestialBody::insolation`.
fn insolation_at(luminosity: f64, orbit_radius: f64) -> f64 {
    let scale = REFERENCE_ORBIT / orbit_radius;
    luminosity * (scale * scale)
}

/// Radians per model minute on an orbit whose period is `reference_period` at `reference_orbit` and
/// grows with the orbit to the power of 1.5 (Kepler), so a farther body is slower.
fn orbit_speed(orbit_radius: f64, reference_orbit: f64, reference_period: f64) -> f64 {
    let scale = orbit_radius / reference_orbit;
    TAU / (reference_period * scale * scale.sqrt())
}

// ------------------------------------------------------------------------------------------------
// content: words and colours

/// How warm a body is, by its insolation: the word of its scan profile and the colour of a rocky
/// planet. PROPOSAL: the limits lie between the insolations of Tau Ceti's planets whose profiles use
/// the four words (2.1 "wysoka", 1.4 "umiarkowana", 0.9 "chłodna", 0.4 "bardzo niska"). They are not
/// the habitable zone, which nothing here reads (G-22).
#[derive(Clone, Copy)]
enum Warmth {
    Hot,
    Mild,
    Cool,
    Frozen,
}

impl Warmth {
    fn of(insolation: f64) -> Warmth {
        if insolation >= 1.75 {
            Warmth::Hot
        } else if insolation >= 1.0 {
            Warmth::Mild
        } else if insolation >= 0.5 {
            Warmth::Cool
        } else {
            Warmth::Frozen
        }
    }

    fn temperature(self) -> &'static str {
        match self {
            Warmth::Hot => "wysoka",
            Warmth::Mild => "umiarkowana",
            Warmth::Cool => "chłodna",
            Warmth::Frozen => "bardzo niska",
        }
    }
}

/// FACT: the colours of Tau Ceti b, c, d and f by their warmth, and of e, the one with a dense
/// atmosphere. PROPOSAL: the rule that assigns them.
fn rocky_color(warmth: Warmth, atmosphere: Atmosphere) -> u32 {
    match (warmth, atmosphere) {
        (Warmth::Mild | Warmth::Cool, Atmosphere::Dense) => 0x4f7a5a,
        (Warmth::Hot, _) => 0xb0724a,
        (Warmth::Mild, _) => 0x9a8a78,
        (Warmth::Cool, _) => 0x8b8f96,
        (Warmth::Frozen, _) => 0xa9c4d6,
    }
}

/// The scan profile of a body with a surface; the temperature waits for the orbit.
///
/// PROPOSAL, after the profiles of Tau Ceti: the kind names the atmosphere, the water follows the
/// weight of the ice deposits, and the rating the number of materials the body holds out of those
/// the parameters offer: two thirds or more "zalecana", a third or more "średni", fewer "trudny".
fn surface_profile(
    body: &str,
    atmosphere: Atmosphere,
    weights: &IndexMap<String, f64>,
    rules: &[DepositParams],
    note: String,
) -> BodyProfile {
    let kind = match atmosphere {
        Atmosphere::None => format!("{body} bez atmosfery"),
        Atmosphere::Trace => format!("{body}, śladowa atmosfera"),
        Atmosphere::Thin => format!("{body}, rzadka atmosfera"),
        Atmosphere::Dense => format!("{body}, gęsta atmosfera"),
    };
    let water = match weights.get(ICE_MATERIAL) {
        None => "brak",
        Some(weight) if *weight >= 85.0 => "lód, bardzo dużo",
        Some(weight) if *weight >= 60.0 => "lód, dużo",
        Some(_) => "lód",
    };
    let held = weights.len() as u64;
    let offered = rules.iter().filter(|rule| rule.share > 0.0).count() as u64;
    let rating = if 3 * held >= 2 * offered {
        "zalecana"
    } else if 3 * held >= offered {
        "średni"
    } else {
        "trudny"
    };
    BodyProfile {
        kind,
        temperature: String::new(),
        water: water.to_string(),
        note,
        rating: rating.to_string(),
        // FACT: the scan reports the weights of the deposits (Tau Ceti: the grid's weights are the profile's)
        deposits: weights.clone(),
        // an economy number: the generator does not invent it
        shuttle_launch_fuel: None,
    }
}

/// The profile of a body nothing is built on: a gas giant, the moon of a rocky planet, a belt.
fn remote_profile(kind: &str, note: String, deposits: IndexMap<String, f64>) -> BodyProfile {
    BodyProfile {
        kind: kind.to_string(),
        temperature: NOT_APPLICABLE.to_string(),
        water: NOT_APPLICABLE.to_string(),
        note,
        rating: EXPEDITIONS.to_string(),
        deposits,
        shuttle_launch_fuel: None,
    }
}

/// PROPOSAL: the four atmospheres are equally likely.
fn atmosphere(u: f64) -> Atmosphere {
    match count_within(CountBounds { min: 0, max: 3 }, u) {
        0 => Atmosphere::None,
        1 => Atmosphere::Trace,
        2 => Atmosphere::Thin,
        _ => Atmosphere::Dense,
    }
}

// ------------------------------------------------------------------------------------------------
// draws

/// An angle in [0, 2π) for `u` in [0, 1).
fn angle(u: f64) -> f64 {
    let angle = u * TAU;
    // the product can round up onto the full turn
    if angle < TAU { angle } else { 0.0 }
}

/// A whole number of the range, each equally likely, for `u` in [0, 1); `min` when the range is empty.
fn count_within(bounds: CountBounds, u: f64) -> u32 {
    if bounds.max <= bounds.min {
        return bounds.min;
    }
    let span = u64::from(bounds.max - bounds.min) + 1;
    // The cast cuts the fraction off. The product can round up to `span`, which is one too many.
    let step = ((u * span as f64) as u64).min(span - 1);
    bounds.min + step as u32
}

/// An index below `len`, each equally likely, for `u` in [0, 1); `len` is at least 1.
fn index_below(len: usize, u: f64) -> usize {
    ((u * len as f64) as usize).min(len - 1)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::galaxy::generator::{CellCoord, SpectralClass};

    fn far(i: i32) -> CellCoord {
        CellCoord { x: 3_000 + i, y: -7, z: 2 }
    }

    /// The systems of the generated stars of the first `cells` far cells.
    fn systems(p: &GalaxyParams, cells: i32) -> Vec<SystemSpec> {
        (0..cells).flat_map(|i| stars_in_cell(p, far(i))).filter_map(|star| generate_system(p, star.key)).collect()
    }

    /// The orbits that were given keep the rules of the layout; returns how many inner bodies have one.
    fn check_layout(rules: &SystemParams, star_body_radius: f64, reaches: &[f64], giant_reach: Option<f64>, orbits: &Orbits) -> usize {
        let range = rules.orbit_radius;
        let mut edge = star_body_radius;
        for (orbit, reach) in orbits.inner.iter().zip(reaches) {
            assert!(range.min <= *orbit && *orbit <= range.max, "orbit {orbit} outside the range");
            assert!(orbit - reach >= edge + CLEARANCE * 0.999, "orbit {orbit} with reach {reach} after a disc that ends at {edge}");
            edge = orbit + reach;
        }
        if let Some(orbit) = orbits.giant {
            let reach = giant_reach.expect("an orbit for a giant that was not asked for");
            assert!(range.min <= orbit && orbit <= range.max, "giant orbit {orbit} outside the range");
            assert!(orbit - reach >= edge + CLEARANCE * 0.999, "giant orbit {orbit} after a disc that ends at {edge}");
        }
        assert!(orbits.inner.len() <= reaches.len());
        orbits.inner.len()
    }

    #[test]
    fn bodies_without_room_are_left_out_and_the_rest_keeps_its_clearance() {
        // packed around a star body of 60, the orbits are 300, 535, 739, 1073 and 1443
        let reaches = [45.0, 180.0, 14.0, 310.0, 50.0];
        let giant = Some(400.0);
        // (end of the orbit range, luminosity, giant asked for, inner bodies kept, giant kept)
        let cases = [
            (8000.0, 1.0, None, 5, false),
            (1000.0, 1.0, None, 3, false),
            (300.0, 1.0, None, 1, false),
            // the snow line of 1 L☉ is at 2405
            (8000.0, 1.0, giant, 5, true),
            (2000.0, 1.0, giant, 5, false),
            // the snow line of 0.1 L☉ is at 761: the giant fits, around three of the inner bodies
            (1500.0, 0.1, giant, 3, true),
            // no inner body leaves the giant room, and it stays
            (700.0, 0.01, giant, 0, true),
        ];
        for (highest, luminosity, giant_reach, inner_kept, giant_kept) in cases {
            let mut rules = SystemParams::default();
            rules.orbit_radius.max = highest;
            for seed in 0..200 {
                let mut rng = Rng::for_cell(seed, far(0), 77);
                let draw = rng.next_f64();
                let orbits = lay_out(&rules, 60.0, luminosity, &reaches, giant_reach, draw, &mut rng);
                let what = format!("range to {highest}, {luminosity} L☉, giant {giant_reach:?}, seed {seed}");
                assert_eq!(check_layout(&rules, 60.0, &reaches, giant_reach, &orbits), inner_kept, "{what}");
                assert_eq!(orbits.giant.is_some(), giant_kept, "{what}");
                if let Some(orbit) = orbits.giant {
                    assert!(insolation_at(luminosity, orbit) < rules.snow_line_insolation, "{what}: giant at {orbit}");
                }
            }
        }
    }

    #[test]
    fn a_star_too_bright_for_the_orbit_range_has_no_giant() {
        // every star is of class B: its snow line lies at 12 000 or farther, the orbits end at 8000
        let mut p = GalaxyParams { seed: 9, ..GalaxyParams::default() };
        for class in &mut p.classes {
            class.share = if class.class == SpectralClass::B { 1.0 } else { 0.0 };
        }
        p.system.giant_classes = vec![SpectralClass::B];
        p.system.giant_share = 0.5;
        let systems = systems(&p, 100);
        assert!(systems.len() >= 200);
        assert!(systems.iter().all(|s| s.planets.iter().all(|planet| planet.kind == PlanetKind::Rocky)));
        // the systems that drew a giant keep their rocky planets
        let with_planets = systems.iter().filter(|s| !s.planets.is_empty()).count() as f64 / systems.len() as f64;
        assert!((with_planets - 0.8).abs() <= 0.1, "{with_planets} of the systems have planets");
    }

    #[test]
    fn parameters_without_sense_end_without_a_panic() {
        // counts beyond any system: cut at the limits
        let mut p = GalaxyParams { seed: 9, ..GalaxyParams::default() };
        p.system.empty_share = 0.0;
        p.system.max_planets = u32::MAX;
        p.system.rocky_moon_share = 1.0;
        p.system.rocky_moon_count = u32::MAX;
        p.system.giant_moons = CountBounds { min: u32::MAX, max: u32::MAX };
        for spec in systems(&p, 2) {
            assert!(spec.planets.len() <= PLANET_LIMIT as usize);
            assert!(spec.planets.iter().all(|planet| planet.moons.len() <= MOON_LIMIT as usize));
        }

        // no deposit material can be taken: no surface, so no rocky planet and no landing on a moon
        let mut p = GalaxyParams { seed: 9, ..GalaxyParams::default() };
        for rule in &mut p.system.deposits {
            rule.share = 0.0;
        }
        p.system.giant_share = 0.8;
        let systems_without_deposits = systems(&p, 100);
        let planets: Vec<&PlanetSpec> = systems_without_deposits.iter().flat_map(|s| &s.planets).collect();
        assert!(!planets.is_empty(), "the giants are still there");
        assert!(planets.iter().all(|planet| planet.kind == PlanetKind::GasGiant && planet.moons.iter().all(|m| m.surface.is_none())));

        // shares, ranges and sizes that are not numbers or lie the wrong way round
        let mut p = GalaxyParams { seed: 9, ..GalaxyParams::default() };
        p.system.empty_share = f64::NAN;
        p.system.orbit_radius = Bounds { min: 8000.0, max: -300.0 };
        p.system.snow_line_insolation = 0.0;
        p.system.radius_per_frequency = f64::INFINITY;
        p.system.grid_frequency = CountBounds { min: 9, max: 0 };
        let _ = systems(&p, 20);
        p.system.empty_share = 0.0;
        p.system.giant_share = f64::INFINITY;
        p.system.star_body_radius = Bounds { min: f64::NAN, max: f64::NAN };
        let _ = systems(&p, 20);
    }
}
