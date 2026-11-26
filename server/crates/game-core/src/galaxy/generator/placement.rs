//! The start star of a new account (task E1-08, P-18 a).
//!
//! Which stars can be offered is the contract's: a generated star that is not occupied, has a planet
//! with a surface and lies at the right distance. The distance is measured from the occupied stars,
//! register stars among them; with no occupied star it is measured from `origin_ly` and has no lower
//! bound.
//!
//! Which of them is offered is set here: the one nearest to `origin_ly`, and of two equally far the
//! one with the smaller key. PROPOSAL. So the accounts fill a ball around the origin, a gap left
//! inside the ball is filled before the ball grows, and the answer depends on the set of occupied
//! stars only.
//!
//! Nothing is drawn and nothing is kept between calls: a call reads the stars of every cell it needs
//! through `stars_in_cell`. The cells that can hold the star are those within reach of a point the
//! distance is measured from. They are visited column by column (a column is the cells of one x and
//! y), the columns nearest to the origin first, and a column or a cell that lies farther from the
//! origin than the best star found so far is left out. The order of the visits changes the work, not
//! the answer: the star taken is the smallest (distance from the origin, key) of all that can be
//! offered.
//!
//! The parameters are taken as they are documented. A `max_ly` of more than [`REACH_LIMIT`] cells is
//! searched up to that limit and a `min_ly` beyond it gives `None`; other values without sense give
//! no panic and no endless loop, and no promise about the star.

use std::collections::{BTreeMap, BTreeSet};
use std::ops::RangeInclusive;

use super::cell_stars::{distance_ly, edges};
use super::system::system_of;
use super::{CellCoord, GalaxyParams, PlacementParams, StarKey, StarOrigin, StarSpec, cell_of, stars_in_cell};

/// The farthest cell that is searched around a point, in cells along each axis: 65³ cells around one
/// point. It bounds the work when `max_ly` makes no sense.
const REACH_LIMIT: i64 = 32;

/// A cell that holds points the distance is measured from.
struct Anchors {
    /// Every star of the cell: read once, used again when the search visits the cell.
    stars: Vec<StarSpec>,
    /// The occupied stars of the cell, or the origin.
    points: Vec<[f64; 3]>,
}

pub(super) fn place_account(p: &GalaxyParams, occupied: &[StarKey], rules: &PlacementParams) -> Option<StarKey> {
    // the set of the keys: in the order of the keys and each once, however they are listed
    let mut taken = occupied.to_vec();
    taken.sort_unstable();
    taken.dedup();

    let mut anchors: BTreeMap<CellCoord, Anchors> = BTreeMap::new();
    for key in &taken {
        let cell = anchors.entry(key.cell).or_insert_with(|| Anchors { stars: stars_in_cell(p, key.cell), points: Vec::new() });
        // a key that names no star is ignored
        if let Some(star) = cell.stars.get(usize::from(key.index)) {
            cell.points.push(star.pos_ly);
        }
    }
    anchors.retain(|_, cell| !cell.points.is_empty());

    // With no occupied star the distance is measured from the origin and has no lower bound.
    let least_ly = if anchors.is_empty() {
        let cell = cell_of(p, rules.origin_ly);
        anchors.insert(cell, Anchors { stars: stars_in_cell(p, cell), points: vec![rules.origin_ly] });
        0.0
    } else {
        rules.min_ly
    };
    // no distance is at least the one and at most the other
    if least_ly > rules.max_ly {
        return None;
    }
    // Points beyond the limit are not looked at, so a minimum that reaches beyond it cannot be kept.
    if cells_within(p, least_ly) > REACH_LIMIT {
        return None;
    }
    // the cast is exact: a whole number in 1 ..= 32
    let reach = cells_within(p, rules.max_ly).min(REACH_LIMIT) as i32;

    let mut search =
        Search { p, origin: rules.origin_ly, least_ly, most_ly: rules.max_ly, taken: &taken, anchors: &anchors, reach, best: None };
    search.run();
    search.best.map(|(_, key)| key)
}

/// How many cells away, along each axis, the cell of a point within `distance_ly` of a star can be:
/// the whole cells of the distance and one more. A distance of a whole number of cells takes a cell
/// more than it needs, so a rounding error at the face of a cell hides no point.
fn cells_within(p: &GalaxyParams, distance_ly: f64) -> i64 {
    // the cast cuts the fraction off and saturates; a quotient that is not a number gives 0
    let whole = (distance_ly / p.cell_ly) as i64;
    whole.saturating_add(1).max(1)
}

/// The coordinates within `reach` cells of `at`, cut at the ends of the range of `i32`.
fn around(at: i32, reach: i32) -> RangeInclusive<i32> {
    at.saturating_sub(reach)..=at.saturating_add(reach)
}

/// The system of the star has a planet with a surface.
fn has_landable_planet(p: &GalaxyParams, star: &StarSpec) -> bool {
    system_of(p, star.clone()).planets.iter().any(|planet| planet.surface.is_some())
}

/// One search for the start star.
struct Search<'a> {
    p: &'a GalaxyParams,
    origin: [f64; 3],
    /// The nearest point is at least this far from the star...
    least_ly: f64,
    /// ...and at most this far.
    most_ly: f64,
    /// The occupied keys, sorted.
    taken: &'a [StarKey],
    /// The cells with points, by their coordinates.
    anchors: &'a BTreeMap<CellCoord, Anchors>,
    /// A point within `most_ly` of a star lies at most this many cells from the star's cell on each axis.
    reach: i32,
    /// The best star so far: its distance from the origin and its key.
    best: Option<(f64, StarKey)>,
}

impl Search<'_> {
    fn run(&mut self) {
        for (away, x, y) in self.columns() {
            // the columns come in the order of their distance: the rest lies farther still
            if self.beyond_best(away) {
                break;
            }
            // The points within reach of the column, whatever their z, and the z of their cells.
            let mut points: Vec<[f64; 3]> = Vec::new();
            let mut levels: Vec<i32> = Vec::new();
            let ys = around(y, self.reach);
            for near_x in around(x, self.reach) {
                let from = CellCoord { x: near_x, y: *ys.start(), z: i32::MIN };
                let to = CellCoord { x: near_x, y: *ys.end(), z: i32::MAX };
                for (cell, anchors) in self.anchors.range(from..=to) {
                    levels.push(cell.z);
                    points.extend_from_slice(&anchors.points);
                }
            }
            levels.sort_unstable();
            // upwards through the cells within reach of a level, each cell once
            let mut visited: Option<i32> = None;
            for level in levels {
                for z in around(level, self.reach) {
                    if visited.is_none_or(|last| z > last) {
                        self.visit(CellCoord { x, y, z }, &points);
                        visited = Some(z);
                    }
                }
            }
        }
    }

    /// Every column with a cell within reach of a cell with points, the nearest to the origin first.
    fn columns(&self) -> Vec<(f64, i32, i32)> {
        let mut columns: BTreeSet<(i32, i32)> = BTreeSet::new();
        let mut last = None;
        for cell in self.anchors.keys() {
            // the cells of one column follow one another in the order of the keys
            let column = (cell.x, cell.y);
            if last != Some(column) {
                last = Some(column);
                for x in around(cell.x, self.reach) {
                    for y in around(cell.y, self.reach) {
                        columns.insert((x, y));
                    }
                }
            }
        }
        let mut columns: Vec<(f64, i32, i32)> = columns.into_iter().map(|(x, y)| (self.away(x, y, None), x, y)).collect();
        // the sort keeps the order of x and y among columns equally far
        columns.sort_by(|a, b| a.0.total_cmp(&b.0));
        columns
    }

    /// Looks at the stars of one cell. `points` holds every point within `most_ly` of the cell.
    fn visit(&mut self, cell: CellCoord, points: &[[f64; 3]]) {
        if self.beyond_best(self.away(cell.x, cell.y, Some(cell.z))) {
            return;
        }
        let anchors = self.anchors;
        let read;
        let stars: &[StarSpec] = match anchors.get(&cell) {
            Some(known) => &known.stars,
            None => {
                read = stars_in_cell(self.p, cell);
                &read
            }
        };
        for star in stars.iter().filter(|star| star.origin == StarOrigin::Generated) {
            let away = distance_ly(star.pos_ly, self.origin);
            // the cheap questions first, the system of the star last
            if self.improves(away, star.key)
                && self.in_range(star.pos_ly, points)
                && self.taken.binary_search(&star.key).is_err()
                && has_landable_planet(self.p, star)
            {
                self.best = Some((away, star.key));
            }
        }
    }

    /// The distance from the origin to the nearest point of a cell, or of a whole column when `z` is
    /// `None`. No generated star of the cell is nearer: its position lies between the edges, and the
    /// distance is computed the same way from differences that are no smaller.
    fn away(&self, x: i32, y: i32, z: Option<i32>) -> f64 {
        let gap = |axis: usize, coord: i32| {
            let (low, high) = edges(coord, self.p.cell_ly);
            let at = self.origin[axis];
            if at < low {
                low - at
            } else if at > high {
                at - high
            } else {
                0.0
            }
        };
        distance_ly([gap(0, x), gap(1, y), z.map_or(0.0, |z| gap(2, z))], [0.0; 3])
    }

    /// Nothing that far from the origin can be the answer.
    fn beyond_best(&self, away: f64) -> bool {
        self.best.is_some_and(|(best, _)| away > best)
    }

    /// A star at this distance from the origin comes before the best so far.
    fn improves(&self, away: f64, key: StarKey) -> bool {
        self.best.is_none_or(|(best, best_key)| away < best || (away == best && key < best_key))
    }

    /// The nearest point is at least `least_ly` and at most `most_ly` from `pos`.
    fn in_range(&self, pos: [f64; 3], points: &[[f64; 3]]) -> bool {
        let mut nearest = f64::INFINITY;
        for point in points {
            let distance = distance_ly(pos, *point);
            if distance < self.least_ly {
                return false;
            }
            if distance < nearest {
                nearest = distance;
            }
        }
        self.least_ly <= nearest && nearest <= self.most_ly
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::galaxy::generator::generate_system;
    use crate::galaxy::stars::STARS;

    fn params() -> GalaxyParams {
        GalaxyParams { seed: 9, ..GalaxyParams::default() }
    }

    fn star_at(p: &GalaxyParams, key: StarKey) -> Option<StarSpec> {
        stars_in_cell(p, key.cell).into_iter().nth(usize::from(key.index))
    }

    /// The answer by the definition alone: every star of every cell near a point is looked at, in
    /// the order of the cells, and nothing is left out.
    fn by_definition(p: &GalaxyParams, occupied: &[StarKey], rules: &PlacementParams) -> Option<StarKey> {
        let stars: Vec<[f64; 3]> = occupied.iter().filter_map(|key| star_at(p, *key)).map(|star| star.pos_ly).collect();
        let (least_ly, points) = if stars.is_empty() { (0.0, vec![rules.origin_ly]) } else { (rules.min_ly, stars) };
        // every cell with a place within `max_ly` of a point, and a cell to spare on every side
        let margin = rules.max_ly + p.cell_ly;
        let mut cells: BTreeSet<CellCoord> = BTreeSet::new();
        for at in &points {
            let low = cell_of(p, [at[0] - margin, at[1] - margin, at[2] - margin]);
            let high = cell_of(p, [at[0] + margin, at[1] + margin, at[2] + margin]);
            for x in low.x..=high.x {
                for y in low.y..=high.y {
                    for z in low.z..=high.z {
                        cells.insert(CellCoord { x, y, z });
                    }
                }
            }
        }
        let mut best: Option<(f64, StarKey)> = None;
        for cell in cells {
            for star in stars_in_cell(p, cell) {
                if star.origin != StarOrigin::Generated || occupied.contains(&star.key) {
                    continue;
                }
                let nearest = points.iter().map(|at| distance_ly(star.pos_ly, *at)).fold(f64::INFINITY, f64::min);
                if !(least_ly <= nearest && nearest <= rules.max_ly) {
                    continue;
                }
                let landable =
                    generate_system(p, star.key).is_some_and(|system| system.planets.iter().any(|planet| planet.surface.is_some()));
                let away = distance_ly(star.pos_ly, rules.origin_ly);
                if landable && best.is_none_or(|(least, key)| away < least || (away == least && star.key < key)) {
                    best = Some((away, star.key));
                }
            }
        }
        best.map(|(_, key)| key)
    }

    /// Places `accounts` one after another on top of `occupied`; each must be the answer by definition.
    fn grow(p: &GalaxyParams, rules: &PlacementParams, mut occupied: Vec<StarKey>, accounts: usize, what: &str) -> Vec<StarKey> {
        for account in 0..accounts {
            let placed = place_account(p, &occupied, rules);
            assert_eq!(placed, by_definition(p, &occupied, rules), "{what}: account {account}");
            occupied.push(placed.unwrap_or_else(|| panic!("{what}: no star for account {account}")));
        }
        occupied
    }

    #[test]
    fn the_search_gives_the_answer_of_the_definition() {
        let p = params();
        let far = PlacementParams { origin_ly: [30_005.0, -65.0, 25.0], min_ly: 8.0, max_ly: 16.0 };
        grow(&p, &far, Vec::new(), 20, "far from the register");

        // among the register stars, with one of them occupied: Sol counts as an occupied star
        let sol_cell = CellCoord { x: 0, y: 0, z: 0 };
        let is_sol = |star: &StarSpec| star.origin == StarOrigin::Real { id: STARS[0].id };
        let sol = stars_in_cell(&p, sol_cell).into_iter().find(is_sol).expect("Sol is in the cell of the origin");
        let near_sol = PlacementParams { origin_ly: [0.0, 0.0, 0.0], min_ly: 8.0, max_ly: 16.0 };
        let placed = grow(&p, &near_sol, vec![sol.key], 15, "around Sol");
        let first = star_at(&p, placed[1]).expect("the first account has a star");
        let from_sol = distance_ly(first.pos_ly, sol.pos_ly);
        assert!((8.0..=16.0).contains(&from_sol), "the first account is {from_sol} ly from the occupied Sol");

        // no minimum: only the list keeps an occupied star out
        let open = PlacementParams { min_ly: 0.0, max_ly: 12.0, ..far };
        let placed = grow(&p, &open, Vec::new(), 15, "no minimum");
        let distinct: BTreeSet<StarKey> = placed.iter().copied().collect();
        assert_eq!(distinct.len(), placed.len());

        // the origin far from the occupied stars: the star on their side that faces it
        let aside = PlacementParams { origin_ly: [30_105.0, -65.0, 25.0], ..far };
        let cluster = grow(&p, &far, Vec::new(), 6, "a cluster");
        grow(&p, &aside, cluster, 6, "an origin beside the cluster");
    }

    #[test]
    fn the_reach_follows_the_cells_and_the_distances() {
        // cells of 4 ly at the density of the defaults: the maximum reaches four cells
        let fine = GalaxyParams { cell_ly: 4.0, stars_per_cell: 0.2, ..params() };
        let rules = PlacementParams { origin_ly: [30_005.0, -65.0, 25.0], min_ly: 6.0, max_ly: 13.0 };
        assert_eq!(cells_within(&fine, rules.max_ly), 4);
        grow(&fine, &rules, Vec::new(), 10, "fine cells");

        // distances of a whole number of cells
        let p = params();
        let whole = PlacementParams { min_ly: 10.0, max_ly: 20.0, ..rules };
        assert_eq!((cells_within(&p, 10.0), cells_within(&p, 20.0)), (2, 3));
        grow(&p, &whole, Vec::new(), 10, "whole cells");

        assert_eq!((cells_within(&p, 0.0), cells_within(&p, 9.99), cells_within(&p, 16.0)), (1, 1, 2));
        // without sense: no reach below one cell, no overflow
        assert_eq!((cells_within(&p, -25.0), cells_within(&p, f64::NAN)), (1, 1));
        assert!(cells_within(&p, f64::INFINITY) > REACH_LIMIT && cells_within(&p, 1e300) > REACH_LIMIT);
        assert_eq!((around(5, 2), around(i32::MAX - 1, 2), around(i32::MIN, 2)), (3..=7, i32::MAX - 3..=i32::MAX, i32::MIN..=i32::MIN + 2));
    }

    #[test]
    fn occupied_stars_far_apart_are_searched_each_on_its_own() {
        let p = params();
        let here = PlacementParams { origin_ly: [30_005.0, -65.0, 25.0], min_ly: 8.0, max_ly: 16.0 };
        let there = PlacementParams { origin_ly: [-12_345.0, 40_000.0, 9_000.0], ..here };
        let first = place_account(&p, &[], &here).expect("a star near the first origin");
        let second = place_account(&p, &[], &there).expect("a star near the second origin");
        // thousands of cells apart on every axis: the cells between them are never read
        let occupied = [first, second];
        for rules in [here, there, PlacementParams { origin_ly: [0.0, 0.0, 0.0], ..here }] {
            assert_eq!(place_account(&p, &occupied, &rules), by_definition(&p, &occupied, &rules), "origin {:?}", rules.origin_ly);
        }
        let near_first = place_account(&p, &occupied, &here).expect("a star near the first occupied star");
        let near_second = place_account(&p, &occupied, &there).expect("a star near the second occupied star");
        assert_ne!(near_first, near_second, "each origin takes the star on its side");
    }

    #[test]
    fn keys_that_name_no_star_are_ignored() {
        let p = params();
        let rules = PlacementParams { origin_ly: [30_005.0, -65.0, 25.0], min_ly: 8.0, max_ly: 16.0 };
        let cell = cell_of(&p, rules.origin_ly);
        let nobody = [StarKey { cell, index: u16::MAX }, StarKey { cell: CellCoord { x: 77, y: -77, z: 7 }, index: 60_000 }];
        let first = place_account(&p, &[], &rules).expect("a star near the origin");
        // only such keys: the list is as good as empty, and the origin decides
        assert_eq!(place_account(&p, &nobody, &rules), Some(first));
        // among the keys of stars they change nothing
        let second = place_account(&p, &[first], &rules);
        assert!(second.is_some() && second != Some(first));
        assert_eq!(place_account(&p, &[nobody[0], first, nobody[1]], &rules), second);
    }

    #[test]
    fn distances_without_sense_end_without_a_panic() {
        let p = params();
        let rules = PlacementParams { origin_ly: [30_005.0, -65.0, 25.0], min_ly: 8.0, max_ly: 16.0 };
        let first = place_account(&p, &[], &rules).expect("a star near the origin");
        let second = place_account(&p, &[first], &rules).expect("a second star");

        // a maximum beyond the limit is searched up to the limit: the nearest star is the same
        for max_ly in [1e9, f64::INFINITY] {
            assert_eq!(place_account(&p, &[], &PlacementParams { max_ly, ..rules }), Some(first), "max_ly = {max_ly}");
            assert_eq!(place_account(&p, &[first], &PlacementParams { max_ly, ..rules }), Some(second), "max_ly = {max_ly}");
        }
        // a minimum beyond the limit, a minimum above the maximum, a maximum below nothing: no star
        let nothing = [(330.0, 1e9), (17.0, 16.0), (f64::INFINITY, f64::INFINITY), (-2.0, -1.0), (8.0, f64::NAN), (f64::NAN, 16.0)];
        for (min_ly, max_ly) in nothing {
            assert_eq!(place_account(&p, &[first], &PlacementParams { min_ly, max_ly, ..rules }), None, "{min_ly} ..= {max_ly}");
        }
        assert_eq!(place_account(&p, &[], &PlacementParams { max_ly: -1.0, ..rules }), None);
        assert_eq!(place_account(&p, &[], &PlacementParams { max_ly: f64::NAN, ..rules }), None);

        // an origin that is not a place, cells without a size: any answer, no panic
        for origin_ly in [[f64::NAN; 3], [f64::INFINITY, 0.0, f64::NEG_INFINITY], [1e300, -1e300, 0.0]] {
            let _ = place_account(&p, &[], &PlacementParams { origin_ly, ..rules });
            let _ = place_account(&p, &[first], &PlacementParams { origin_ly, ..rules });
        }
        for cell_ly in [0.0, -10.0, f64::NAN, f64::INFINITY] {
            let odd = GalaxyParams { cell_ly, ..params() };
            let _ = place_account(&odd, &[], &rules);
            let _ = place_account(&odd, &[first], &rules);
        }
    }
}
