//! Stars of the galaxy PoC (`galaxy/stars.ts`, `stars.data.ts`). The register is one JSON file
//! exported from the TypeScript source (`tools/conformance/export-stars.ts`).

use std::sync::LazyLock;

use serde::{Deserialize, Serialize};

use crate::math::js;
use crate::math::vec3::{Vec3, vec3};

/// Light years in one parsec.
pub const LY_PER_PARSEC: f64 = 3.26156;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StarData {
    pub id: u32,
    pub name: String,
    /// Parsecs from Sol (source coordinates).
    pub x: f64,
    pub y: f64,
    pub z: f64,
    /// Apparent magnitude (lower = brighter).
    pub magnitude: f64,
    pub absolute_mag: f64,
    pub spectral_class: String,
    /// Hex colour.
    pub color: String,
    /// Light years from Sol; authoritative (the economy doc reads it).
    pub distance: f64,
    pub constellation: String,
    pub description: String,
    /// Kelvin.
    pub temperature: f64,
    /// Solar masses, radii, luminosities.
    pub mass: f64,
    pub radius: f64,
    pub luminosity: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub planets: Option<u32>,
}

/// Star with a position consistent with its distance.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Star {
    #[serde(flatten)]
    pub data: StarData,
    /// Position in parsecs from Sol: direction from the source x, y, z; length = distance / 3.26156.
    pub pos: Vec3,
    /// |x, y, z| of the source data in light years, before W10 (for the register).
    pub source_distance: f64,
}

impl std::ops::Deref for Star {
    type Target = StarData;
    fn deref(&self) -> &StarData {
        &self.data
    }
}

static STARS_JSON: &str = include_str!("../../data/stars.json");

/// The source register, as exported from TypeScript.
pub static STAR_DATA: LazyLock<Vec<StarData>> = LazyLock::new(|| serde_json::from_str(STARS_JSON).expect("stars.json is valid"));

/// The 41 stars with consistent positions.
pub static STARS: LazyLock<Vec<Star>> = LazyLock::new(|| STAR_DATA.iter().cloned().map(normalize_star).collect());

/// W10 A: for part of the stars the distance computed from x, y, z disagrees with `distance`
/// (Vega about 41 ly vs 25.04 ly). `distance` stays authoritative: keep the direction, rescale the vector.
pub fn normalize_star(s: StarData) -> Star {
    let len = js::hypot3(s.x, s.y, s.z);
    let source_distance = len * LY_PER_PARSEC;
    if len == 0.0 || s.distance <= 0.0 {
        return Star { data: s, pos: vec3(0.0, 0.0, 0.0), source_distance };
    }
    let k = s.distance / LY_PER_PARSEC / len;
    let pos = vec3(s.x * k, s.y * k, s.z * k);
    Star { data: s, pos, source_distance }
}

/// Stars whose source coordinates were off by more than `tolerance` (relative).
pub fn inconsistent_source_stars(tolerance: f64) -> Vec<&'static Star> {
    STARS.iter().filter(|s| s.distance > 0.0 && (s.source_distance - s.distance).abs() / s.distance > tolerance).collect()
}

/// Distance between two stars [ly].
pub fn light_years_between(a: &Star, b: &Star) -> f64 {
    js::hypot3(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z) * LY_PER_PARSEC
}

/// Farthest star from Sol [pc]; the galaxy camera's far plane must reach beyond it (W09: Deneb).
pub fn max_star_radius() -> f64 {
    STARS.iter().map(|s| js::hypot3(s.pos.x, s.pos.y, s.pos.z)).fold(f64::NEG_INFINITY, f64::max)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn register_is_consistent_with_distances() {
        assert_eq!(STARS.len(), 41);
        let sol = &STARS[0];
        assert_eq!((sol.id, sol.pos), (0, vec3(0.0, 0.0, 0.0)));
        for s in STARS.iter().skip(1) {
            let d = js::hypot3(s.pos.x, s.pos.y, s.pos.z) * LY_PER_PARSEC;
            assert!((d - s.distance).abs() < 1e-9, "{}: {d} vs {}", s.name, s.distance);
        }
        assert!(inconsistent_source_stars(0.05).iter().any(|s| s.name.starts_with("Vega")));
        assert!(max_star_radius() > 500.0);
    }
}
