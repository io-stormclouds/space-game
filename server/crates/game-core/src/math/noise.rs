//! Seeded integer hash and value noise (`seeded-noise.ts`). Integer arithmetic reproduces
//! `Math.imul` / `>>>` exactly, so deposits and asteroid shapes are identical to the TS world.

use super::js::{imul, to_int32};
use super::vec3::Vec3;

/// Deterministic integer hash → [0, 1).
pub fn hash3(seed: f64, x: f64, y: f64, z: f64) -> f64 {
    let mut h = imul(to_int32(x), 0x27d4eb2d)
        ^ imul(to_int32(y), 0x165667b1)
        ^ imul(to_int32(z), 0x9e3779b1_u32 as i32)
        ^ imul(to_int32(seed), 0x85ebca6b_u32 as i32);
    h = imul(h ^ ((h as u32) >> 15) as i32, 0x2c1b3c6d);
    h = imul(h ^ ((h as u32) >> 12) as i32, 0x297a2d39);
    h ^= ((h as u32) >> 15) as i32;
    (h as u32) as f64 / 4294967296.0
}

#[inline]
fn smooth(t: f64) -> f64 {
    t * t * (3.0 - 2.0 * t)
}

#[inline]
fn mix(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}

/// Trilinear value noise in [0, 1].
pub fn value_noise(seed: f64, p: Vec3) -> f64 {
    let (x0, y0, z0) = (p.x.floor(), p.y.floor(), p.z.floor());
    let (fx, fy, fz) = (smooth(p.x - x0), smooth(p.y - y0), smooth(p.z - z0));
    let c = |dx: f64, dy: f64, dz: f64| hash3(seed, x0 + dx, y0 + dy, z0 + dz);
    let x00 = mix(c(0.0, 0.0, 0.0), c(1.0, 0.0, 0.0), fx);
    let x10 = mix(c(0.0, 1.0, 0.0), c(1.0, 1.0, 0.0), fx);
    let x01 = mix(c(0.0, 0.0, 1.0), c(1.0, 0.0, 1.0), fx);
    let x11 = mix(c(0.0, 1.0, 1.0), c(1.0, 1.0, 1.0), fx);
    mix(mix(x00, x10, fy), mix(x01, x11, fy), fz)
}

/// Fractal sum of value noise, normalised to [0, 1].
pub fn fbm(seed: f64, p: Vec3, octaves: usize) -> f64 {
    let mut sum = 0.0;
    let mut amp = 1.0;
    let mut norm = 0.0;
    let mut freq = 1.0;
    for o in 0..octaves {
        sum += amp * value_noise(seed + (o as f64) * 101.0, Vec3 { x: p.x * freq, y: p.y * freq, z: p.z * freq });
        norm += amp;
        amp *= 0.5;
        freq *= 2.0;
    }
    sum / norm
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::math::vec3::vec3;

    #[test]
    fn hash_is_deterministic_and_in_range() {
        assert_eq!(hash3(7.0, 1.0, 2.0, 3.0), hash3(7.0, 1.0, 2.0, 3.0));
        assert_ne!(hash3(7.0, 1.0, 2.0, 3.0), hash3(8.0, 1.0, 2.0, 3.0));
        for i in 0..1000 {
            let h = hash3(3.0, i as f64, (i * 7) as f64, -(i as f64));
            assert!((0.0..1.0).contains(&h));
        }
    }

    #[test]
    fn noise_in_range_and_continuous() {
        for i in 0..500 {
            let fi = i as f64;
            let p = vec3(fi.sin() * 10.0, (fi * 1.3).cos() * 10.0, fi * 0.01);
            let v = value_noise(5.0, p);
            let f = fbm(5.0, p, 3);
            assert!((0.0..=1.0).contains(&v));
            assert!((0.0..=1.0).contains(&f));
            let near = value_noise(5.0, vec3(p.x + 1e-4, p.y, p.z));
            assert!((near - v).abs() < 1e-2);
        }
    }
}
