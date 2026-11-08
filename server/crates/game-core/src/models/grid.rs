//! Goldberg grid of a body (`planet-grid.model.ts`).

use serde::{Deserialize, Serialize};

use crate::ids::{BodyId, MaterialCode, TileId};
use crate::math::vec3::Vec3;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum TileKind {
    Pent,
    Hex,
}

/// Static description of a deposit; the remaining amount lives in `WorldState.deposits`.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Deposit {
    pub resource: MaterialCode,
    /// Initial amount.
    pub amount: f64,
}

/// One face of the Goldberg polyhedron, in the body's local frame (body centre at the origin).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Tile {
    pub id: TileId,
    /// 0..N−1, stable for a given frequency.
    pub index: usize,
    pub kind: TileKind,
    /// On the sphere of the body's radius.
    pub center: Vec3,
    /// Unit vector = normalize(center).
    pub normal: Vec3,
    /// 5 or 6 points on the sphere, counter-clockwise seen from outside.
    pub vertices: Vec<Vec3>,
    /// Indices of the 5 or 6 neighbouring tiles, same angular order as `vertices`.
    pub neighbors: Vec<usize>,
    pub deposit: Option<Deposit>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PlanetGrid {
    pub body_id: BodyId,
    /// n in GP(n,0). Tiles = 10·n² + 2.
    pub frequency: usize,
    pub radius: f64,
    pub tiles: Vec<Tile>,
    /// Approximate edge length of a hexagonal tile; used to size what is placed on it.
    pub tile_edge: f64,
}

impl PlanetGrid {
    pub fn tile_by_id(&self, id: &str) -> Option<&Tile> {
        self.tiles.iter().find(|t| t.id == id)
    }
}
