//! Stars of a cell (task E1-04): the register stars that lie in it, then the generated ones.
//!
//! The generated stars of a cell come from a list of candidates:
//! - the number of candidates is a Poisson draw with the mean [`GalaxyParams::stars_per_cell`]: the
//!   count that stars scattered evenly and independently through space leave in a volume;
//! - candidate `i` has a stream of its own and draws in a fixed order: x, y, z, class, place within
//!   the class;
//! - a candidate closer to a register star than the separation is left out and not replaced. The
//!   stars after it keep their positions and parameters; their indices move up.
//!
//! The parameters are taken as they are documented: `cell_ly` positive and finite, [`Bounds`] with
//! `min <= max`. Other values give no panic and no endless loop, and no promise about the stars.

use super::{Bounds, CellCoord, ClassParams, GalaxyParams, Rng, SpectralClass, StarKey, StarOrigin, StarSpec, cell_of};
use crate::galaxy::stars::{LY_PER_PARSEC, STARS, Star};

/// Streams of a cell's [`Rng`]: the high 32 bits name the purpose, the low 32 bits the item.
/// Purposes 0 and 1 are taken here; whatever else draws from a cell takes a number of its own.
const COUNT_STREAM: u64 = 0;
const CANDIDATE_STREAMS: u64 = 1 << 32;

/// The largest mean that is drawn: twice the 65 536 stars a cell can hold (`StarKey::index` is a
/// `u16`). It bounds the work when the parameter makes no sense.
const MEAN_LIMIT: f64 = 131_072.0;

/// The largest mean of one Poisson step: `exp(-mean)` and the series that starts from it stay far
/// from underflow.
const POISSON_STEP_MEAN: f64 = 16.0;

pub(super) fn stars_in_cell(p: &GalaxyParams, cell: CellCoord) -> Vec<StarSpec> {
    let mut stars: Vec<StarSpec> = Vec::new();
    // positions of the register stars close enough to the cell to forbid a part of it
    let mut near: Vec<[f64; 3]> = Vec::new();
    for star in STARS.iter() {
        let pos_ly = register_pos_ly(star);
        let away = distance_ly(pos_ly, nearest_in_cell(p, cell, pos_ly));
        // `cell_of` decides; the distance only spares it for a star a whole cell away or more
        if away <= p.cell_ly
            && cell_of(p, pos_ly) == cell
            && let Some(key) = next_key(cell, &stars)
        {
            stars.push(register_star(star, key, pos_ly));
        }
        // a star farther from the cell than the separation is not that close to any point of it
        if away <= p.min_real_separation_ly {
            near.push(pos_ly);
        }
    }

    let total_share = total_share(&p.classes);
    // without a class to take there is no generated star
    let candidates = if total_share > 0.0 { poisson(&mut Rng::for_cell(p.seed, cell, COUNT_STREAM), p.stars_per_cell) } else { 0 };
    for candidate in 0..candidates {
        let Some(key) = next_key(cell, &stars) else { break };
        let mut rng = Rng::for_cell(p.seed, cell, CANDIDATE_STREAMS | u64::from(candidate));
        let x = along_axis(cell.x, p.cell_ly, rng.next_f64());
        let y = along_axis(cell.y, p.cell_ly, rng.next_f64());
        let z = along_axis(cell.z, p.cell_ly, rng.next_f64());
        let pos_ly = [x, y, z];
        if near.iter().any(|real| distance_ly(*real, pos_ly) < p.min_real_separation_ly) {
            continue;
        }
        let Some(class) = pick_class(&p.classes, total_share, rng.next_f64()) else { break };
        // One draw places the star within its class and all four parameters follow it, so a hotter
        // star of a class is also the heavier, brighter and larger one, as on the main sequence.
        let place = rng.next_f64();
        stars.push(StarSpec {
            key,
            origin: StarOrigin::Generated,
            name: designation(key),
            pos_ly,
            class: Some(class.class),
            luminosity: within(class.luminosity, place),
            mass: within(class.mass, place),
            radius: within(class.radius, place),
            temperature: within(class.temperature, place),
            color: class.color,
        });
    }
    stars
}

/// The key of the next star of the result; `None` when the cell is full.
fn next_key(cell: CellCoord, stars: &[StarSpec]) -> Option<StarKey> {
    u16::try_from(stars.len()).ok().map(|index| StarKey { cell, index })
}

// ------------------------------------------------------------------------------------------------
// register stars

fn register_pos_ly(star: &Star) -> [f64; 3] {
    [star.pos.x * LY_PER_PARSEC, star.pos.y * LY_PER_PARSEC, star.pos.z * LY_PER_PARSEC]
}

fn register_star(star: &Star, key: StarKey, pos_ly: [f64; 3]) -> StarSpec {
    StarSpec {
        key,
        origin: StarOrigin::Real { id: star.id },
        name: star.name.clone(),
        pos_ly,
        class: register_class(&star.spectral_class),
        luminosity: star.luminosity,
        mass: star.mass,
        radius: star.radius,
        temperature: star.temperature,
        color: register_color(&star.color),
    }
}

/// The first letter of the register's spectral class when it is a main-sequence letter; brown and
/// white dwarfs (L, T, Y, D) have none.
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

/// The register's `#RRGGBB` as 0xRRGGBB. The register is compiled in, so a colour that does not
/// parse is an error of the build's data, like a `stars.json` that does not parse.
fn register_color(color: &str) -> u32 {
    u32::from_str_radix(color.trim_start_matches('#'), 16).expect("the register's colours are #RRGGBB")
}

// ------------------------------------------------------------------------------------------------
// geometry of a cell

/// The lower edge of a cell on one axis and the upper edge, which belongs to the next cell.
fn edges(coord: i32, cell_ly: f64) -> (f64, f64) {
    let low = f64::from(coord) * cell_ly;
    (low, low + cell_ly)
}

/// The point `u` of the way through the cell on one axis, for `u` in [0, 1).
fn along_axis(coord: i32, cell_ly: f64, u: f64) -> f64 {
    let (low, high) = edges(coord, cell_ly);
    let at = low + u * cell_ly;
    // the sum can round up onto the upper edge
    if at < high { at } else { low }
}

/// The point of the cell nearest to `pos`, the cell's faces included: `pos` itself when it is inside.
fn nearest_in_cell(p: &GalaxyParams, cell: CellCoord, pos: [f64; 3]) -> [f64; 3] {
    let axis = |coord: i32, at: f64| {
        let (low, high) = edges(coord, p.cell_ly);
        if at < low {
            low
        } else if at > high {
            high
        } else {
            at
        }
    };
    [axis(cell.x, pos[0]), axis(cell.y, pos[1]), axis(cell.z, pos[2])]
}

fn distance_ly(a: [f64; 3], b: [f64; 3]) -> f64 {
    let (dx, dy, dz) = (a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    (dx * dx + dy * dy + dz * dz).sqrt()
}

// ------------------------------------------------------------------------------------------------
// generated stars

/// A Poisson draw with the given mean; 0 for a mean that is not positive. The mean is cut at
/// [`MEAN_LIMIT`].
fn poisson(rng: &mut Rng, mean: f64) -> u32 {
    if mean.is_nan() || mean <= 0.0 {
        return 0;
    }
    let mean = if mean > MEAN_LIMIT { MEAN_LIMIT } else { mean };
    // A sum of independent Poisson draws is a Poisson draw of the summed mean: a large mean is
    // drawn in equal steps. The cast is exact: a whole number in 0 ..= 8192.
    let steps = libm::ceil(mean / POISSON_STEP_MEAN) as u32;
    let step_mean = mean / f64::from(steps);
    (0..steps).map(|_| poisson_step(rng, step_mean)).sum()
}

/// A Poisson draw for a mean of at most [`POISSON_STEP_MEAN`], by inversion: one uniform number
/// against the running sum of P(0), P(1), ...
fn poisson_step(rng: &mut Rng, mean: f64) -> u32 {
    let u = rng.next_f64();
    let mut k: u32 = 0;
    let mut term = libm::exp(-mean); // P(0)
    let mut below = term; // P(0) + ... + P(k)
    while u >= below {
        k += 1;
        term *= mean / f64::from(k); // P(k) = P(k − 1) × mean / k
        let next = below + term;
        if next == below {
            // The terms grow up to the mean and shrink after it, so the sum stops growing only in
            // the far tail: it has reached its last value, a rounding error below 1, and `u` lies
            // in the gap.
            break;
        }
        below = next;
    }
    k
}

/// The sum of the shares of the classes that can be generated.
fn total_share(classes: &[ClassParams]) -> f64 {
    classes.iter().filter(|c| c.share > 0.0).map(|c| c.share).sum()
}

/// The class at `u` of the way through the shares, for `u` in [0, 1): each class with a positive
/// share is taken with probability share / Σ shares. `None` when no class has a share.
fn pick_class(classes: &[ClassParams], total_share: f64, u: f64) -> Option<&ClassParams> {
    let target = u * total_share;
    let mut below = 0.0;
    let mut last = None;
    for class in classes.iter().filter(|c| c.share > 0.0) {
        below += class.share;
        if target < below {
            return Some(class);
        }
        last = Some(class);
    }
    // `target` rounded up to the whole sum: the top of the range is the last class
    last
}

/// The value `place` of the way from `min` to `max`, for `place` in [0, 1); never outside the range.
fn within(bounds: Bounds, place: f64) -> f64 {
    let value = bounds.min + place * (bounds.max - bounds.min);
    // `min + (max − min)` can miss `max` by a rounding error
    if value > bounds.max {
        bounds.max
    } else if value < bounds.min {
        bounds.min
    } else {
        value
    }
}

/// The catalogue designation of a generated star: its key, spelled out. Provisional until E3-01.
fn designation(key: StarKey) -> String {
    format!("SG {:+}{:+}{:+}/{}", key.cell.x, key.cell.y, key.cell.z, key.index)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn far(i: i32) -> CellCoord {
        CellCoord { x: 3_000 + i, y: -7, z: 2 }
    }

    #[test]
    fn poisson_keeps_its_mean_and_spread_beyond_one_step() {
        // 100 is drawn in 7 steps; the variance of a Poisson draw equals its mean
        let draws: Vec<f64> = (0..2_000).map(|i| f64::from(poisson(&mut Rng::for_cell(1, far(i), COUNT_STREAM), 100.0))).collect();
        let n = draws.len() as f64;
        let mean = draws.iter().sum::<f64>() / n;
        let variance = draws.iter().map(|x| (x - mean) * (x - mean)).sum::<f64>() / (n - 1.0);
        assert!((mean - 100.0).abs() <= 1.0, "mean {mean}");
        assert!((variance - 100.0).abs() <= 15.0, "variance {variance}");

        for mean in [0.0, -1.0, f64::NAN, f64::NEG_INFINITY] {
            assert_eq!(poisson(&mut Rng::for_cell(1, far(0), COUNT_STREAM), mean), 0, "mean {mean}");
        }
    }

    #[test]
    fn a_cell_is_full_at_the_last_index_of_the_key() {
        for stars_per_cell in [1e300, f64::INFINITY] {
            let p = GalaxyParams { seed: 5, stars_per_cell, ..GalaxyParams::default() };
            let stars = stars_in_cell(&p, far(0));
            assert_eq!(stars.len(), 65_536);
            assert!(stars.iter().enumerate().all(|(i, star)| usize::from(star.key.index) == i));
        }
    }

    #[test]
    fn classes_without_a_share_are_never_taken() {
        let mut classes = GalaxyParams::default().classes;
        for (class, share) in classes.iter_mut().zip([0.0, 1.0, 0.0, -2.0, 3.0, f64::NAN, 0.0]) {
            class.share = share;
        }
        let total = total_share(&classes);
        assert_eq!(total, 4.0);
        let taken = |u: f64| pick_class(&classes, total, u).map(|c| c.class);
        assert_eq!(taken(0.0), Some(SpectralClass::B));
        assert_eq!(taken(0.249), Some(SpectralClass::B));
        assert_eq!(taken(0.25), Some(SpectralClass::G));
        assert_eq!(taken(1.0 - f64::EPSILON / 2.0), Some(SpectralClass::G));
        // the top of the range, should rounding ever reach it
        assert_eq!(taken(1.0), Some(SpectralClass::G));

        // no class with a share: no generated star, whatever the density
        let mut p = GalaxyParams { seed: 5, ..GalaxyParams::default() };
        for class in &mut p.classes {
            class.share = 0.0;
        }
        assert_eq!(pick_class(&p.classes, total_share(&p.classes), 0.5), None);
        assert!((0..50).all(|i| stars_in_cell(&p, far(i)).is_empty()));
    }

    #[test]
    fn generated_values_stay_inside_their_ranges() {
        // the largest number `Rng::next_f64` returns
        let top = 1.0 - f64::EPSILON / 2.0;
        for bounds in [Bounds { min: 0.1, max: 0.7 }, Bounds { min: 0.0005, max: 0.08 }, Bounds { min: 2.0, max: 2.0 }] {
            for place in [0.0, 0.5, top] {
                let value = within(bounds, place);
                assert!(bounds.min <= value && value <= bounds.max, "{bounds:?} at {place}: {value}");
            }
        }
        for (coord, cell_ly) in [(2_099, 10.0), (-3, 10.0), (i32::MAX, 0.1), (i32::MIN, 3.3)] {
            let (low, high) = edges(coord, cell_ly);
            for u in [0.0, 0.5, top] {
                let at = along_axis(coord, cell_ly, u);
                assert!(low <= at && at < high, "cell {coord} of {cell_ly} ly at {u}: {at}");
            }
        }
    }
}
