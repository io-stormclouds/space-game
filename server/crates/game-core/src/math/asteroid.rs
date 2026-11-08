//! Irregular seeded asteroid mesh and the depletion scale (`asteroid-shape.ts`).

use super::geodesic::geodesic_sphere;
use super::noise::fbm;
use super::vec3::{Vec3, vec3};
use crate::models::body::CelestialBody;

#[derive(Clone, Debug, PartialEq)]
pub struct AsteroidShape {
    pub body_id: String,
    pub seed: f64,
    /// 10·detail² + 2 points, radii within radius × (1 ± roughness).
    pub vertices: Vec<Vec3>,
    /// CCW seen from outside.
    pub faces: Vec<[usize; 3]>,
}

/// Spatial frequency of the noise over the unit sphere; larger = lumpier.
const NOISE_SCALE: f64 = 1.8;
const NOISE_OFFSET: f64 = 37.3;

pub fn asteroid_shape(body: &CelestialBody, detail: usize) -> AsteroidShape {
    let seed = body.shape.as_ref().map(|s| s.seed).unwrap_or(1.0);
    let roughness = body.shape.as_ref().map(|s| s.roughness).unwrap_or(0.3);
    let geo = geodesic_sphere(detail);
    let vertices = geo
        .vertices
        .iter()
        .map(|dir| {
            let p = vec3(dir.x * NOISE_SCALE + NOISE_OFFSET, dir.y * NOISE_SCALE + NOISE_OFFSET, dir.z * NOISE_SCALE + NOISE_OFFSET);
            let n = fbm(seed, p, 3) * 2.0 - 1.0; // [-1, 1]
            dir.scale(body.radius * (1.0 + roughness * n))
        })
        .collect();
    AsteroidShape { body_id: body.id.clone(), seed, vertices, faces: geo.faces }
}

/// Visual scale of a body whose minerals are being extracted: volume ∝ remaining minerals, never
/// below `floor` so the rock stays a target.
pub fn depletion_scale(minerals: f64, initial: f64, floor: f64) -> f64 {
    if initial <= 0.0 {
        return 1.0;
    }
    let ratio = (minerals / initial).clamp(0.0, 1.0);
    floor.max(ratio.cbrt())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn depletion_follows_cube_root_with_floor() {
        assert_eq!(depletion_scale(500.0, 500.0, 0.4), 1.0);
        assert!((depletion_scale(250.0, 500.0, 0.4) - 0.7937).abs() < 1e-3);
        assert!((depletion_scale(450.0, 500.0, 0.4) - 0.9655).abs() < 1e-3);
        assert_eq!(depletion_scale(0.0, 500.0, 0.4), 0.4);
        assert_eq!(depletion_scale(10.0, 500.0, 0.4), 0.4);
        assert_eq!(depletion_scale(600.0, 500.0, 0.4), 1.0);
        assert_eq!(depletion_scale(0.0, 0.0, 0.4), 1.0);
    }
}
