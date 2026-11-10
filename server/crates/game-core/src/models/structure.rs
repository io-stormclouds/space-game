//! Buildings and construction sites (`structure.model.ts`).

use serde::{Deserialize, Serialize};

use super::resource::Cost;
use super::serde_util::double_option;
use crate::ids::{BodyId, StructureKind, TileId};

/// PLANNED: ordered, materials paid, waiting for a rover. CONSTRUCTING: a rover is building it.
/// ACTIVE: working at `level`. UPGRADING: working at `level` with reduced output while `target_level` is built.
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "UPPERCASE")]
pub enum StructureState {
    Planned,
    Constructing,
    Active,
    Upgrading,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ProductionBatch {
    pub recipe: String,
    /// 0..1
    pub progress: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Structure {
    pub id: String,
    pub kind: StructureKind,
    pub body_id: BodyId,
    /// Anchor tile (the one the player clicked).
    pub tile_id: TileId,
    /// Every tile of the footprint, anchor first.
    pub tiles: Vec<TileId>,
    /// Working level; 0 until the first construction ends.
    pub level: u32,
    /// Level being built: 1 for a new building, level + 1 while upgrading.
    pub target_level: u32,
    pub state: StructureState,
    /// 0..1 of the current construction or upgrade.
    pub progress: f64,
    /// What the current construction cost (for refunds).
    pub paid: Cost,
    /// Game time when it was ordered.
    pub built_at: f64,
    /// Build time of the first construction in % of the catalog time, from the terrain under the
    /// footprint (set only when ≠ 100, dropped when the building is finished; upgrades ignore it).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub time_pct: Option<u32>,
    /// Selected production recipe (buildings with several).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recipe: Option<String>,
    /// Production in progress: absent, `null`, or a batch (TS `batch?: ProductionBatch | null`).
    #[serde(default, skip_serializing_if = "Option::is_none", with = "double_option")]
    pub batch: Option<Option<ProductionBatch>>,
}

impl Structure {
    /// Whether the structure works (produces, consumes, stores).
    pub fn is_working(&self) -> bool {
        matches!(self.state, StructureState::Active | StructureState::Upgrading)
    }

    /// Whether the structure is a construction site that needs a rover.
    pub fn is_site(&self) -> bool {
        self.state != StructureState::Active
    }

    pub fn current_batch(&self) -> Option<&ProductionBatch> {
        self.batch.as_ref().and_then(|b| b.as_ref())
    }
}
