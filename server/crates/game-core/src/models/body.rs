//! Celestial bodies (`celestial-body.model.ts`).

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

use super::resource::Cost;
use crate::ids::BodyId;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum BodyKind {
    Star,
    Planet,
    Moon,
    Asteroid,
    Belt,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Atmosphere {
    None,
    Trace,
    Thin,
    Dense,
}

/// What a scan tells the player about a body (canvas board "Skanowanie"). Content data, Polish.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BodyProfile {
    #[serde(rename = "type")]
    pub kind: String,
    pub temperature: String,
    pub water: String,
    pub note: String,
    /// "zalecana", "średni", "trudny", "wyprawy".
    pub rating: String,
    /// Surface share of each deposit material [%], as the scan reports it.
    pub deposits: IndexMap<String, f64>,
    /// Fuel to launch a shuttle from the surface [u].
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shuttle_launch_fuel: Option<f64>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SurfaceGrid {
    pub frequency: usize,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deposit_seed: Option<f64>,
    /// Relative weights of deposit materials; default FER, KRI and SIL equally (PoC).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub deposit_weights: Option<IndexMap<String, f64>>,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct Shape {
    pub seed: f64,
    pub roughness: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CelestialBody {
    pub id: BodyId,
    pub name: String,
    pub kind: BodyKind,
    pub radius: f64,
    /// `None` = centre of the system (the star).
    pub parent_id: Option<BodyId>,
    /// Orbit radius relative to the parent; 0 for the central body.
    pub orbit_radius: f64,
    /// Constant angular velocity ω [rad per model minute].
    pub orbit_speed: f64,
    /// Initial phase φ [rad].
    pub initial_angle: f64,
    /// Docking altitude = radius × this factor.
    pub orbital_altitude_factor: f64,
    /// Unloads cargo and refuels ships.
    pub is_home_base: bool,
    /// Minable by a docked ship (asteroids).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub resources: Option<Cost>,
    pub color: u32,
    /// Goldberg GP(n,0) surface grid; tiles = 10·n² + 2. Only bodies with a grid can be built on.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub surface_grid: Option<SurfaceGrid>,
    /// Irregular, seeded mesh instead of a sphere (asteroids).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shape: Option<Shape>,
    /// Wind turbines need a dense atmosphere. Default none.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub atmosphere: Option<Atmosphere>,
    /// Solar multiplier; when absent: star luminosity × (900 / orbit radius of the root planet)².
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub insolation: Option<f64>,
    /// Stars only: luminosity in L☉ (default 1).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub luminosity: Option<f64>,
    /// Unknown until the system scan; default true.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub revealed: Option<bool>,
    /// Display name before the scan, e.g. "Obiekt 3".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unknown_name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub profile: Option<BodyProfile>,
}

impl CelestialBody {
    /// A body with the mandatory fields set and every optional one absent.
    pub fn base(id: &str, name: &str, kind: BodyKind, radius: f64, parent_id: Option<&str>, color: u32) -> CelestialBody {
        CelestialBody {
            id: id.to_string(),
            name: name.to_string(),
            kind,
            radius,
            parent_id: parent_id.map(str::to_string),
            orbit_radius: 0.0,
            orbit_speed: 0.0,
            initial_angle: 0.0,
            orbital_altitude_factor: 1.25,
            is_home_base: false,
            resources: None,
            color,
            surface_grid: None,
            shape: None,
            atmosphere: None,
            insolation: None,
            luminosity: None,
            revealed: None,
            unknown_name: None,
            profile: None,
        }
    }
}
