//! Hex-kit terrain of a body (`sim/terrain/terrain-types.ts`, T8, T5): the style on the body, the
//! class of each tile and the settlement on the grid.

use serde::{Deserialize, Serialize};

/// Terrain style of a body (`BIOMES`, `math/terrain.rs`): `Mixed` grass, lakes, forest, rock and polar
/// caps; `Medieval` = `Mixed` with other thresholds plus a ruined settlement; `Winter` snow with frozen
/// lakes; `Dry` sand or regolith with dune hollows and rock.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum TerrainBiome {
    Mixed,
    Medieval,
    Winter,
    Dry,
}

/// Class of one tile.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum TerrainKind {
    Grass,
    Forest,
    Rock,
    Snow,
    Water,
    Sand,
    Dune,
    Ice,
    Regolith,
}

impl TerrainKind {
    /// The JSON name (`"forest"`).
    pub fn as_str(self) -> &'static str {
        match self {
            TerrainKind::Grass => "grass",
            TerrainKind::Forest => "forest",
            TerrainKind::Rock => "rock",
            TerrainKind::Snow => "snow",
            TerrainKind::Water => "water",
            TerrainKind::Sand => "sand",
            TerrainKind::Dune => "dune",
            TerrainKind::Ice => "ice",
            TerrainKind::Regolith => "regolith",
        }
    }
}

/// Class of the basins (the lowest tiles of the first noise field): lakes, frozen lakes, dune hollows
/// or dried lake beds (TS `TerrainBasin`).
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum TerrainBasin {
    Water,
    Ice,
    Dune,
}

impl TerrainBasin {
    pub fn kind(self) -> TerrainKind {
        match self {
            TerrainBasin::Water => TerrainKind::Water,
            TerrainBasin::Ice => TerrainKind::Ice,
            TerrainBasin::Dune => TerrainKind::Dune,
        }
    }
}

/// Class of the ground (the tiles no rule claims; TS `TerrainGround`). Always buildable: a basin
/// removed from a pentagon, a deposit or the landing cap, a cleared settlement tile and a road become
/// the ground.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum TerrainGround {
    Grass,
    Snow,
    Sand,
    Regolith,
}

impl TerrainGround {
    pub fn kind(self) -> TerrainKind {
        match self {
            TerrainGround::Grass => TerrainKind::Grass,
            TerrainGround::Snow => TerrainKind::Snow,
            TerrainGround::Sand => TerrainKind::Sand,
            TerrainGround::Regolith => TerrainKind::Regolith,
        }
    }
}

/// Terrain style of one body (`CelestialBody.surfaceGrid.terrain`). Key order is the world JSON order
/// of the TS; the optional keys are written only when set, and an absent key takes the biome's value.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TerrainConfig {
    pub biome: TerrainBiome,
    /// Seed of the noise fields.
    pub seed: f64,
    /// Class of the ground (the majority), e.g. `Regolith` instead of `Sand` on a dry body.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ground: Option<TerrainGround>,
    /// Class of the basins, e.g. `Dune` for dried lake beds on a body without water (T-26).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub basin: Option<TerrainBasin>,
    /// Noise level below which a tile is a basin (`f1 < basinLevel`); lower = fewer basins.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub basin_level: Option<f64>,
    /// Landing zone: every tile where `normal.y > landingCap` is the plain ground (T-25).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub landing_cap: Option<f64>,
}

impl TerrainConfig {
    /// A biome and a seed, no overrides.
    pub fn new(biome: TerrainBiome, seed: f64) -> TerrainConfig {
        TerrainConfig { biome, seed, ground: None, basin: None, basin_level: None, landing_cap: None }
    }
}

/// Terrain a grid was classified with (`PlanetGrid.terrain`: the config, keys in its order, and the
/// settlement centre, the castle tile).
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GridTerrain {
    pub biome: TerrainBiome,
    pub seed: f64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ground: Option<TerrainGround>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub basin: Option<TerrainBasin>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub basin_level: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub landing_cap: Option<f64>,
    pub settlement_center: Option<usize>,
}
