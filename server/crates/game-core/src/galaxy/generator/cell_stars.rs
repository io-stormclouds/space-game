//! The stars of one cell (task E1-04): the register stars whose position lies in the cell, then the
//! generated stars.
//!
//! How a cell is generated:
//! - the number of candidates is Poisson with the mean `stars_per_cell` (stream [`streams::STAR_COUNT`]),
//!   so the stars of neighbouring cells together are a uniform random scatter;
//! - candidate `i` draws from its own stream ([`streams::star_candidate`]): three numbers for the
//!   position, one for the class (probability share / Σ shares) and one for its place `t` in the
//!   class; every parameter is `min · (max / min)^t` of its bounds, so the four grow together towards
//!   the hot end of the class and the luminosity spreads over its orders of magnitude;
//! - a candidate closer than `min_real_separation_ly` to a register star is left out; the stars that
//!   remain keep their order and take the next indices after the register stars.

use super::{Bounds, CellCoord, ClassParams, GalaxyParams, Rng, SpectralClass, StarKey, StarOrigin, StarSpec, cell_of, streams};
use crate::galaxy::stars::{LY_PER_PARSEC, STARS, Star};

/// Most stars in one cell: every index fits `StarKey::index`, and `u16::MAX` never names a star.
const MAX_STARS: u32 = u16::MAX as u32;

/// The Poisson count is drawn in parts of at most this mean, so that `exp(-mean)` stays a normal number.
const POISSON_PART: f64 = 256.0;

pub(super) fn stars_in_cell(p: &GalaxyParams, cell: CellCoord) -> Vec<StarSpec> {
    let register: Vec<[f64; 3]> = STARS.iter().map(register_pos).collect();
    let mut out: Vec<StarSpec> = Vec::new();
    for (star, pos) in STARS.iter().zip(&register) {
        if cell_of(p, *pos) == cell {
            let key = StarKey { cell, index: out.len() as u16 };
            out.push(register_spec(star, *pos, key));
        }
    }

    // only classes with a positive share are ever generated; without any there is no generated star
    let classes: Vec<&ClassParams> = p.classes.iter().filter(|c| c.share > 0.0).collect();
    if classes.is_empty() {
        return out;
    }
    let total: f64 = classes.iter().map(|c| c.share).sum();

    let candidates = candidate_count(p, cell, MAX_STARS - out.len() as u32);
    for i in 0..candidates {
        let mut rng = Rng::for_cell(p.seed, cell, streams::star_candidate(i));
        let pos = [
            in_cell(cell.x, p.cell_ly, rng.next_f64()),
            in_cell(cell.y, p.cell_ly, rng.next_f64()),
            in_cell(cell.z, p.cell_ly, rng.next_f64()),
        ];
        let class = pick_class(&classes, total, rng.next_f64());
        let t = rng.next_f64();
        if register.iter().any(|r| distance(*r, pos) < p.min_real_separation_ly) {
            continue;
        }
        let key = StarKey { cell, index: out.len() as u16 };
        out.push(StarSpec {
            key,
            origin: StarOrigin::Generated,
            name: designation(key),
            pos_ly: pos,
            class: Some(class.class),
            luminosity: between(class.luminosity, t),
            mass: between(class.mass, t),
            radius: between(class.radius, t),
            temperature: between(class.temperature, t),
            color: class.color,
        });
    }
    out
}

/// `Star::pos` (parsecs) in light years, axis by axis.
fn register_pos(s: &Star) -> [f64; 3] {
    [s.pos.x * LY_PER_PARSEC, s.pos.y * LY_PER_PARSEC, s.pos.z * LY_PER_PARSEC]
}

fn register_spec(s: &Star, pos_ly: [f64; 3], key: StarKey) -> StarSpec {
    StarSpec {
        key,
        origin: StarOrigin::Real { id: s.id },
        name: s.name.clone(),
        pos_ly,
        class: register_class(&s.spectral_class),
        luminosity: s.luminosity,
        mass: s.mass,
        radius: s.radius,
        temperature: s.temperature,
        color: u32::from_str_radix(s.color.trim_start_matches('#'), 16).expect("register colours are #RRGGBB"),
    }
}

/// The first letter of the register's spectral class when it is a main-sequence class; brown and
/// white dwarfs have none.
fn register_class(spectral_class: &str) -> Option<SpectralClass> {
    match spectral_class.chars().next()? {
        'O' => Some(SpectralClass::O),
        'B' => Some(SpectralClass::B),
        'A' => Some(SpectralClass::A),
        'F' => Some(SpectralClass::F),
        'G' => Some(SpectralClass::G),
        'K' => Some(SpectralClass::K),
        'M' => Some(SpectralClass::M),
        _ => None,
    }
}

/// How many candidates the cell draws: Poisson with the mean `stars_per_cell`, at most `cap`.
fn candidate_count(p: &GalaxyParams, cell: CellCoord, cap: u32) -> u32 {
    let mean = p.stars_per_cell;
    if mean.is_nan() || mean <= 0.0 {
        return 0;
    }
    if mean >= f64::from(cap) {
        return cap;
    }
    // a sum of independent Poisson counts is a Poisson count with the sum of the means
    let mut rng = Rng::for_cell(p.seed, cell, streams::STAR_COUNT);
    let mut count: u32 = 0;
    let mut left = mean;
    while left > 0.0 && count < cap {
        let part = if left < POISSON_PART { left } else { POISSON_PART };
        count = count.saturating_add(poisson(&mut rng, part));
        left -= part;
    }
    count.min(cap)
}

/// Knuth's method: the number of uniform numbers whose running product stays above `exp(-mean)`.
fn poisson(rng: &mut Rng, mean: f64) -> u32 {
    let limit = libm::exp(-mean);
    let mut count: u32 = 0;
    let mut product = rng.next_f64();
    while product > limit {
        count += 1;
        product *= rng.next_f64();
    }
    count
}

/// A coordinate inside cell `coord` of edge `edge`, at `u` ∈ [0, 1) of the way across.
fn in_cell(coord: i32, edge: f64, u: f64) -> f64 {
    let low = f64::from(coord) * edge;
    let at = low + u * edge;
    // rounding can carry `at` onto the upper edge, which belongs to the next cell
    if at < low + edge && at < (f64::from(coord) + 1.0) * edge { at } else { low }
}

/// The class whose share covers `u` ∈ [0, 1) of the total: probability share / Σ shares.
fn pick_class<'a>(classes: &[&'a ClassParams], total: f64, u: f64) -> &'a ClassParams {
    let target = u * total;
    let mut covered = 0.0;
    for class in classes {
        covered += class.share;
        if target < covered {
            return class;
        }
    }
    // only rounding of the running sum gets here
    classes[classes.len() - 1]
}

/// The value at `t` ∈ [0, 1) between the bounds: `min · (max / min)^t` when both are positive,
/// otherwise linear; never outside the bounds.
fn between(b: Bounds, t: f64) -> f64 {
    let value = if b.min > 0.0 && b.max > 0.0 {
        let (low, high) = (libm::log(b.min), libm::log(b.max));
        libm::exp(low + t * (high - low))
    } else {
        b.min + t * (b.max - b.min)
    };
    if value < b.min {
        b.min
    } else if value > b.max {
        b.max
    } else {
        value
    }
}

fn distance(a: [f64; 3], b: [f64; 3]) -> f64 {
    let (dx, dy, dz) = (a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    (dx * dx + dy * dy + dz * dz).sqrt()
}

/// A catalogue designation from the key only (provisional until E3-01), e.g. `SG +2000 -3 +0 #1`.
fn designation(key: StarKey) -> String {
    format!("SG {:+} {:+} {:+} #{}", key.cell.x, key.cell.y, key.cell.z, key.index)
}
