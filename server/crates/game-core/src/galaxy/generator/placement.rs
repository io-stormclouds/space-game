//! The start star of a new account (task E1-08, P-18 a).
//!
//! The rule: of the stars that [`place_account`](super::place_account) may offer, the one nearest to
//! `origin_ly`, ties broken by the smaller [`StarKey`]. The accounts so grow one cluster around the
//! origin: each new account takes the free place nearest to the origin whose nearest neighbour is
//! between `min_ly` and `max_ly` away, a hole inside the cluster before its edge. Nothing is drawn at
//! random, and the occupied stars are read as a set (sorted, each once), so their order does not count.
//!
//! How the search stays local:
//! - a candidate lies within `max_ly` of an occupied star (of `origin_ly` for the first account), so
//!   only the cells whose span lies that close to one of them are visited, and the nearest occupied
//!   star of a candidate is among the stars that reach its cell;
//! - the cells are visited by growing distance of their span from `origin_ly`; once that distance is
//!   larger than the best candidate's, no later cell holds a better one;
//! - the system of a star (the costly part) is generated only when the star would beat the best one.
//!
//! The span of a cell is measured with the same operations as the distance of a star inside it, and
//! every one of them is monotonic in IEEE 754, so a star is never nearer than its cell: no star is
//! missed at the edge of a cell. The cost grows with the number of occupied stars × (`max_ly` /
//! `cell_ly`)³ cells.

use std::collections::BTreeMap;

use super::{CellCoord, GalaxyParams, PlacementParams, StarKey, StarOrigin, StarSpec, generate_system, stars_in_cell};

pub(super) fn place_account(p: &GalaxyParams, occupied: &[StarKey], rules: &PlacementParams) -> Option<StarKey> {
    // the stars of every cell this call reads, each cell generated once
    let mut cells: BTreeMap<CellCoord, Vec<StarSpec>> = BTreeMap::new();

    // the occupied stars as a set; a key that names no star is left out
    let mut taken: BTreeMap<StarKey, [f64; 3]> = BTreeMap::new();
    for key in occupied {
        let stars = cells.entry(key.cell).or_insert_with(|| stars_in_cell(p, key.cell));
        if let Some(star) = stars.get(usize::from(key.index)) {
            taken.insert(*key, star.pos_ly);
        }
    }

    // the first account is measured from the origin, with no lower bound
    let (anchors, min_ly): (Vec<[f64; 3]>, f64) =
        if taken.is_empty() { (vec![rules.origin_ly], f64::NEG_INFINITY) } else { (taken.values().copied().collect(), rules.min_ly) };
    let max_ly = rules.max_ly;
    if min_ly > max_ly {
        // no distance fits an empty interval (with NaN nothing passes the comparisons below either)
        return None;
    }

    // every cell whose span lies within max_ly of an anchor, with the anchors that reach it
    let edge = p.cell_ly;
    let mut reach: BTreeMap<CellCoord, Vec<usize>> = BTreeMap::new();
    for (i, anchor) in anchors.iter().enumerate() {
        let (xs, ys, zs) = (axis_cells(anchor[0], max_ly, edge), axis_cells(anchor[1], max_ly, edge), axis_cells(anchor[2], max_ly, edge));
        for &(x, gx) in &xs {
            for &(y, gy) in &ys {
                for &(z, gz) in &zs {
                    if (gx * gx + gy * gy + gz * gz).sqrt() <= max_ly {
                        reach.entry(CellCoord { x, y, z }).or_default().push(i);
                    }
                }
            }
        }
    }

    // the cells by growing distance of their span from the origin
    let origin = rules.origin_ly;
    let mut order: Vec<(f64, CellCoord)> = reach.keys().map(|&cell| (span_distance(origin, cell, edge), cell)).collect();
    order.sort_by(|a, b| a.0.total_cmp(&b.0).then(a.1.cmp(&b.1)));

    let mut best: Option<(f64, StarKey)> = None;
    for (bound, cell) in order {
        if best.is_some_and(|(nearest, _)| bound > nearest) {
            break;
        }
        let near = &reach[&cell];
        let stars = cells.entry(cell).or_insert_with(|| stars_in_cell(p, cell));
        for star in stars.iter() {
            if star.origin != StarOrigin::Generated || taken.contains_key(&star.key) {
                continue;
            }
            if !in_shell(star.pos_ly, near, &anchors, min_ly, max_ly) {
                continue;
            }
            let from_origin = distance(star.pos_ly, origin);
            let better = best.is_none_or(|(d, key)| from_origin.total_cmp(&d).then(star.key.cmp(&key)).is_lt());
            if better && has_landable_planet(p, star.key) {
                best = Some((from_origin, star.key));
            }
        }
    }
    best.map(|(_, key)| key)
}

/// The nearest of the anchors `near` is at least `min_ly` and at most `max_ly` from `pos`. `near`
/// holds every anchor within `max_ly` of `pos`, so its nearest is the nearest of all when it counts.
fn in_shell(pos: [f64; 3], near: &[usize], anchors: &[[f64; 3]], min_ly: f64, max_ly: f64) -> bool {
    let mut nearest = f64::INFINITY;
    for &i in near {
        let d = distance(pos, anchors[i]);
        if d < min_ly {
            return false;
        }
        if d < nearest {
            nearest = d;
        }
    }
    min_ly <= nearest && nearest <= max_ly
}

/// The system of the star has a planet with a surface.
fn has_landable_planet(p: &GalaxyParams, key: StarKey) -> bool {
    generate_system(p, key).is_some_and(|spec| spec.planets.iter().any(|planet| planet.surface.is_some()))
}

/// The cells of one axis whose span lies within `max_ly` of `at`, each with its gap from `at`. The
/// range reaches one cell further on both sides than the division says, so rounding cannot shorten it.
fn axis_cells(at: f64, max_ly: f64, edge: f64) -> Vec<(i32, f64)> {
    // `as` saturates at the ends of i32 (and gives 0 for NaN)
    let first = (libm::floor((at - max_ly) / edge) - 1.0) as i32;
    let last = (libm::floor((at + max_ly) / edge) + 1.0) as i32;
    (first..=last).map(|c| (c, gap(at, c, edge))).filter(|&(_, g)| g <= max_ly).collect()
}

/// How far `at` lies from the span of cell `c` on one axis (0 inside). A star of the cell lies in
/// [c·edge, (c + 1)·edge] (`cell_stars::in_cell`), so its difference from `at` is never smaller.
fn gap(at: f64, c: i32, edge: f64) -> f64 {
    let low = f64::from(c) * edge;
    let high = (f64::from(c) + 1.0) * edge;
    if low > at {
        low - at
    } else if high < at {
        at - high
    } else {
        0.0
    }
}

/// The distance from `at` to the nearest point of the cell: never more than the distance from `at`
/// to a star of the cell, as both are computed.
fn span_distance(at: [f64; 3], cell: CellCoord, edge: f64) -> f64 {
    let (gx, gy, gz) = (gap(at[0], cell.x, edge), gap(at[1], cell.y, edge), gap(at[2], cell.z, edge));
    (gx * gx + gy * gy + gz * gz).sqrt()
}

fn distance(a: [f64; 3], b: [f64; 3]) -> f64 {
    let (dx, dy, dz) = (a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    (dx * dx + dy * dy + dz * dz).sqrt()
}
