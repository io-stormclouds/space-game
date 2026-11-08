//! Axial hexagonal coordinates (q, r) of a pointy-topped grid (`atanor/grid/hex.ts`). The third cube
//! coordinate s = −q − r is implicit. Integers everywhere, so the `cleanZero` of the source (−0 → 0)
//! is not needed.

use serde::{Deserialize, Serialize};

use crate::math::js;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash, Default)]
pub struct Hex {
    pub q: i32,
    pub r: i32,
}

pub const fn hex(q: i32, r: i32) -> Hex {
    Hex { q, r }
}

impl Hex {
    /// `${q},${r}` — the map key of the source.
    pub fn key(&self) -> String {
        format!("{},{}", self.q, self.r)
    }
}

pub fn hex_from_key(key: &str) -> Hex {
    let mut parts = key.split(',').map(|p| p.trim().parse::<i32>().unwrap_or(0));
    hex(parts.next().unwrap_or(0), parts.next().unwrap_or(0))
}

pub fn hex_add(a: Hex, b: Hex) -> Hex {
    hex(a.q + b.q, a.r + b.r)
}

pub fn hex_sub(a: Hex, b: Hex) -> Hex {
    hex(a.q - b.q, a.r - b.r)
}

pub fn hex_scale(h: Hex, k: i32) -> Hex {
    hex(h.q * k, h.r * k)
}

pub fn hex_distance(a: Hex, b: Hex) -> i32 {
    let (sa, sb) = (-a.q - a.r, -b.q - b.r);
    (a.q - b.q).abs().max((a.r - b.r).abs()).max((sa - sb).abs())
}

/// 6 directions clockwise from East (3 o'clock): E, SE, SW, W, NW, NE.
pub const HEX_DIRECTIONS: [Hex; 6] = [hex(1, 0), hex(0, 1), hex(-1, 1), hex(-1, 0), hex(0, -1), hex(1, -1)];

pub fn hex_direction(dir_index: i32) -> Hex {
    HEX_DIRECTIONS[dir_index.rem_euclid(6) as usize]
}

pub fn hex_neighbor(h: Hex, dir_index: i32) -> Hex {
    hex_add(h, hex_direction(dir_index))
}

pub fn hex_all_neighbors(h: Hex) -> [Hex; 6] {
    let mut out = [Hex::default(); 6];
    for (i, d) in HEX_DIRECTIONS.iter().enumerate() {
        out[i] = hex_add(h, *d);
    }
    out
}

/// 60° clockwise around the origin: (q, r, s) → (−r, −s, −q).
pub fn hex_rotate_cw(rel: Hex) -> Hex {
    hex(-rel.r, rel.q + rel.r)
}

/// 60° counter-clockwise around the origin: (q, r, s) → (−s, −q, −r).
pub fn hex_rotate_ccw(rel: Hex) -> Hex {
    hex(rel.q + rel.r, -rel.q)
}

/// Rotates `point` around `center` by `steps` × 60° (positive = clockwise).
pub fn hex_rotate_around(point: Hex, center: Hex, steps: i32) -> Hex {
    let n = steps.rem_euclid(6);
    if n == 0 {
        return point;
    }
    let mut rel = hex_sub(point, center);
    for _ in 0..n {
        rel = hex_rotate_cw(rel);
    }
    hex_add(center, rel)
}

/// Cube rounding of fractional axial coordinates (`hexRound`), with JavaScript's `Math.round`.
pub fn hex_round(frac_q: f64, frac_r: f64) -> Hex {
    let frac_s = -frac_q - frac_r;
    let mut q = js::round(frac_q);
    let mut r = js::round(frac_r);
    let s = js::round(frac_s);
    let q_diff = (q - frac_q).abs();
    let r_diff = (r - frac_r).abs();
    let s_diff = (s - frac_s).abs();
    if q_diff > r_diff && q_diff > s_diff {
        q = -r - s;
    } else if r_diff > s_diff {
        r = -q - s;
    }
    hex(q as i32, r as i32)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rotation_and_distance() {
        assert_eq!(hex_rotate_cw(hex(1, 0)), hex(0, 1));
        assert_eq!(hex_rotate_ccw(hex(0, 1)), hex(1, 0));
        assert_eq!(hex_rotate_around(hex(2, -1), hex(1, -1), -1), hex_add(hex(1, -1), hex_direction(5)));
        assert_eq!(hex_distance(hex(0, 0), hex(2, -1)), 2);
        assert_eq!(hex_direction(-1), hex(1, -1));
        assert_eq!(hex_round(0.4, -0.4), hex(0, 0));
        assert_eq!(hex(-1, 2).key(), "-1,2");
    }
}
