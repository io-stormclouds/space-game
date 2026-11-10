//! Data of the `GameApi` contract (`packages/api/src/contract.ts`), serialised to the same JSON.

use indexmap::IndexMap;
use serde::{Deserialize, Serialize};

use game_core::economy::{EconomyParams, EconomyTables, StorageClass, TerrainRules};
use game_core::ids::BodyId;
use game_core::math::vec3::Vec3;
use game_core::models::command::Command;
use game_core::models::event::{DomainEvent, RejectReason};
use game_core::models::resource::Qty;
use game_core::sim::objectives::Objective;
use game_core::sim::reducer::WorldState;
use game_core::sim::simulation::ColonyReadout;

/// Sliding statistics of the simulation step, for the performance overlay.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct StepStats {
    pub mean_ms: f64,
    pub max_ms: f64,
    pub steps_per_second: f64,
    pub minutes_per_second: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SimulatedPlayer {
    pub id: String,
    pub name: String,
    pub corporation: String,
    pub home_star: String,
    pub colonies: f64,
    pub score: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct MarketQuote {
    pub material: String,
    pub value: f64,
    pub bid: f64,
    pub ask: f64,
    pub change: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct MarketHub {
    pub id: String,
    pub name: String,
    pub star: String,
    pub quotes: Vec<MarketQuote>,
}

/// What the UI renders. Pushed at about 10 Hz, after commands and on demand.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct GameSnapshot {
    pub scenario_id: String,
    pub world: WorldState,
    pub colonies: IndexMap<BodyId, ColonyReadout>,
    pub objectives: Vec<Objective>,
    pub players: Vec<SimulatedPlayer>,
    pub hubs: Vec<MarketHub>,
    pub tempo: f64,
    pub paused: bool,
    pub step: u64,
    pub stats: StepStats,
}

/// Positions that change every frame, for the renderer.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct FrameData {
    pub time: f64,
    pub rovers: IndexMap<String, [f64; 3]>,
    pub transit: IndexMap<String, f64>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct RecordedCommand {
    pub step: u64,
    pub command: Command,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct TempoChange {
    pub step: u64,
    pub tempo: f64,
}

/// Save file (JSON). `world` restores the game; `commands` replays it from the scenario start.
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SaveFile {
    pub format: String,
    pub version: u32,
    pub scenario_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub economy: Option<EconomyParams>,
    pub step_seconds: f64,
    pub tempos: Vec<TempoChange>,
    pub step: u64,
    pub world: WorldState,
    pub commands: Vec<RecordedCommand>,
    #[serde(default)]
    pub meta: serde_json::Value,
}

impl SaveFile {
    /// Reads a save file from JSON, checking the format before the fields (the mock's message).
    pub fn parse(value: serde_json::Value) -> Result<SaveFile, String> {
        let format = value.get("format").and_then(|v| v.as_str());
        let version = value.get("version").and_then(|v| v.as_u64());
        if format != Some("space-game-save") || version != Some(1) {
            return Err("not a space-game save file (v1)".to_string());
        }
        serde_json::from_value(value).map_err(|e| format!("bad save file: {e}"))
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
pub struct ReplayStats {
    pub commands: u64,
    pub rejected: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ReplayResult {
    #[serde(flatten)]
    pub snapshot: GameSnapshot,
    pub replay_stats: ReplayStats,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct CommandResult {
    pub ok: bool,
    pub events: Vec<DomainEvent>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct CatalogMaterial {
    pub id: String,
    pub name: String,
    pub tier: String,
    pub cls: StorageClass,
    pub unit: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CatalogLevel {
    pub level: u32,
    pub cost: Qty,
    pub build_time: f64,
    pub power: f64,
    pub crew: f64,
    pub storage: IndexMap<StorageClass, f64>,
    pub output_factor: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Extracts {
    pub material: String,
    pub rate: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CatalogBuilding {
    pub id: String,
    pub name: String,
    pub era: u8,
    pub category: String,
    pub footprint: usize,
    pub max_level: u32,
    pub buildable: bool,
    pub levels: Vec<CatalogLevel>,
    pub extracts: Vec<Extracts>,
    pub recipes: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct CatalogRecipe {
    pub id: String,
    pub building: String,
    pub inp: Qty,
    pub out: Qty,
    pub time: f64,
    pub power: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CatalogStar {
    pub name: String,
    pub spectral_class: String,
    pub distance: f64,
    pub luminosity: f64,
    pub temperature: f64,
    pub planets: u32,
    pub color: String,
    pub description: String,
    pub pos: Vec3,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CatalogVehicle {
    pub cost: Qty,
    pub build_time: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct CatalogColonization {
    pub scan_minutes: f64,
    pub port_cost: Qty,
    pub port_build_minutes: f64,
    pub shuttle_capacity: f64,
    pub shuttle_trip_minutes: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct CatalogView {
    pub stars: Vec<CatalogStar>,
    pub materials: Vec<CatalogMaterial>,
    pub buildings: Vec<CatalogBuilding>,
    pub recipes: Vec<CatalogRecipe>,
    pub rover: CatalogVehicle,
    pub colonization: CatalogColonization,
    /// What terrain does to building (T8): buildable classes, cost and time in % per class and on a road.
    pub terrain: TerrainRules,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Availability {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<RejectReason>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

/// Result of checking a building on a tile (the placement ghost).
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BuildPreview {
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<RejectReason>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    pub tiles: Vec<usize>,
    /// Materials the order takes, after the terrain under the footprint (T8). Present once the check
    /// got past BAD_TERRAIN: when `ok`, and also on a later rejection (for PORT: NO_RESOURCES).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub cost: Option<Qty>,
    /// Minutes one rover needs to build it (catalog time × terrain time %); present together with `cost`.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub build_time: Option<f64>,
}

/// Terrain of a tile (T8); numbers are the tile's own (a road's on a road tile).
pub type TileTerrainInfo = game_core::sim::terrain_rules::TileTerrain;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TileChoice {
    pub tile_index: usize,
    pub rotation: i64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct TileDeposit {
    pub material: String,
    pub initial: f64,
    pub remaining: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct TileOption {
    pub kind: String,
    pub ok: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub reason: Option<RejectReason>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub extracts: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TileInfo {
    pub body_id: BodyId,
    pub index: usize,
    pub kind: game_core::models::grid::TileKind,
    pub deposit: Option<TileDeposit>,
    /// Terrain class of the tile; null on bodies without terrain.
    pub terrain: Option<TileTerrainInfo>,
    pub structure_id: Option<String>,
    pub options: Vec<TileOption>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct EconomyReport {
    pub params: EconomyParams,
    pub defaults: EconomyParams,
    pub doc: EconomyTables,
    pub current: EconomyTables,
}
