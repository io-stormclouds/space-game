//! Identifiers. The TypeScript domain uses branded strings; here plain `String` aliases keep the JSON
//! identical and the code simple. (`shared/ids.ts`, `models/planet-grid.model.ts`)

pub type BodyId = String;
pub type ShipId = String;
pub type RoverId = String;
pub type TileId = String;
pub type StructureKind = String;
pub type MaterialCode = String;

/// `${bodyId}:${index}`
pub fn tile_id(body_id: &str, index: usize) -> TileId {
    format!("{body_id}:{index}")
}

/// Index part of a tile id (`rover-system.ts` `tileIndexOf`): the number after the last colon.
pub fn tile_index_of(tile_id: &str) -> usize {
    let start = tile_id.rfind(':').map(|i| i + 1).unwrap_or(0);
    tile_id[start..].parse().unwrap_or(0)
}
