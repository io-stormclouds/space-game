//! Hex-kit terrain of a body (`sim/terrain/terrain-types.ts`, T8): the style on the body, the class
//! of each tile and the settlement on the grid.

use serde::{Deserialize, Serialize};

/// Terrain style of a body. `Medieval` = `Mixed` terrain plus a ruined settlement.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum TerrainBiome {
    Mixed,
    Medieval,
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
        }
    }
}

/// Terrain style of one body (`CelestialBody.surfaceGrid.terrain`): biome and noise seed.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct TerrainConfig {
    pub biome: TerrainBiome,
    pub seed: f64,
}

/// Terrain a grid was classified with (`PlanetGrid.terrain`) and the settlement centre (castle tile).
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GridTerrain {
    pub biome: TerrainBiome,
    pub seed: f64,
    pub settlement_center: Option<usize>,
}
