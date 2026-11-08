//! Continuous motion inside a tick (`atanor/engine/trajectory.ts`, AT5). A tick's motion is a rigid
//! move per arm: a 60° turn around a fixed point or a straight translation, sampled at
//! `TRAJECTORY_SUBSTEPS` fractions in cartesian hex space. Deterministic: fixed sub-step count,
//! fixed clearance, a precomputed turn table with fdlibm `sin`/`cos` (bit for bit as V8's `Math`).

use std::sync::LazyLock;

use super::hex::{Hex, hex_add, hex_rotate_around, hex_round};

/// Sub-steps per tick: a 60° turn is sampled every 5°.
pub const TRAJECTORY_SUBSTEPS: usize = 12;

/// Minimum distance (in hex spacings) between two atoms, or two grippers of different arms, while
/// they move.
pub const TRAJECTORY_CLEARANCE: f64 = 0.5;

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Motion {
    /// Turn by `steps` × 60° around `center` (positive = clockwise, as `hex_rotate_around`).
    Rotate { center: Hex, steps: i32 },
    /// Straight move by `delta`.
    Translate { delta: Hex },
}

/// Cartesian point in hex spacings: neighbours are 1 apart (y grows like r, as on screen).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Point {
    pub x: f64,
    pub y: f64,
}

fn sqrt3_2() -> f64 {
    3f64.sqrt() / 2.0
}

/// Cosine and sine of k × (60° / TRAJECTORY_SUBSTEPS), k = 0..=TRAJECTORY_SUBSTEPS.
static TURN_TABLE: LazyLock<[(f64, f64); TRAJECTORY_SUBSTEPS + 1]> = LazyLock::new(|| {
    let mut table = [(0.0, 0.0); TRAJECTORY_SUBSTEPS + 1];
    for (k, entry) in table.iter_mut().enumerate() {
        let angle = (std::f64::consts::PI / 3.0) * (k as f64 / TRAJECTORY_SUBSTEPS as f64);
        *entry = (libm::cos(angle), libm::sin(angle));
    }
    table
});

pub fn hex_to_point(h: Hex) -> Point {
    Point { x: h.q as f64 + h.r as f64 / 2.0, y: h.r as f64 * sqrt3_2() }
}

/// Hex containing a point (cube rounding).
pub fn point_to_hex(p: Point) -> Hex {
    let r = p.y / sqrt3_2();
    let q = p.x - r / 2.0;
    hex_round(q, r)
}

/// Where `pos` ends after the whole motion (exact hex arithmetic).
pub fn motion_end(motion: Option<&Motion>, pos: Hex) -> Hex {
    match motion {
        None => pos,
        Some(Motion::Rotate { center, steps }) => hex_rotate_around(pos, *center, *steps),
        Some(Motion::Translate { delta }) => hex_add(pos, *delta),
    }
}

/// Position of `pos` after sub-step `k` of TRAJECTORY_SUBSTEPS (k = 0: start, k = N: end).
/// Rotations of more than one step (not produced by arm commands) are scaled linearly.
pub fn motion_point(motion: Option<&Motion>, pos: Hex, k: usize) -> Point {
    let p = hex_to_point(pos);
    let Some(motion) = motion else { return p };
    let t = k as f64 / TRAJECTORY_SUBSTEPS as f64;
    match motion {
        Motion::Translate { delta } => {
            let d = hex_to_point(*delta);
            Point { x: p.x + d.x * t, y: p.y + d.y * t }
        }
        Motion::Rotate { center, steps } => {
            let c = hex_to_point(*center);
            let (cos, sin) = if steps.abs() == 1 {
                let (cos, sin) = TURN_TABLE[k];
                (cos, sin * *steps as f64)
            } else {
                let angle = (std::f64::consts::PI / 3.0) * *steps as f64 * t;
                (libm::cos(angle), libm::sin(angle))
            };
            let dx = p.x - c.x;
            let dy = p.y - c.y;
            Point { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos }
        }
    }
}

pub fn distance_squared(a: Point, b: Point) -> f64 {
    let dx = a.x - b.x;
    let dy = a.y - b.y;
    dx * dx + dy * dy
}

/// Hexes `pos` passes through during the motion (sampled sub-steps, start and end included).
pub fn swept_hexes(motion: Option<&Motion>, pos: Hex) -> Vec<Hex> {
    let mut seen: Vec<Hex> = Vec::new();
    for k in 0..=TRAJECTORY_SUBSTEPS {
        let h = point_to_hex(motion_point(motion, pos, k));
        if !seen.contains(&h) {
            seen.push(h);
        }
    }
    seen
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::atanor::hex::hex;

    #[test]
    fn rotation_ends_on_the_lattice() {
        let m = Motion::Rotate { center: hex(1, -1), steps: 1 };
        let end = motion_end(Some(&m), hex(2, -1));
        assert_eq!(end, hex(1, 0));
        let sampled = point_to_hex(motion_point(Some(&m), hex(2, -1), TRAJECTORY_SUBSTEPS));
        assert_eq!(sampled, end);
        assert_eq!(point_to_hex(hex_to_point(hex(-3, 2))), hex(-3, 2));
    }

    #[test]
    fn length_two_arc_passes_the_inner_hex() {
        // an atom at distance 2 sweeps within 0.27 of the lattice point between start and end
        let m = Motion::Rotate { center: hex(0, 0), steps: 1 };
        let mid = motion_point(Some(&m), hex(2, 0), TRAJECTORY_SUBSTEPS / 2);
        let d2 = distance_squared(mid, hex_to_point(hex(1, 1)));
        assert!(d2 < TRAJECTORY_CLEARANCE * TRAJECTORY_CLEARANCE, "{d2}");
    }
}
