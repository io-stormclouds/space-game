//! Player orders (`simulation.ts` `Command`). The server receives these through the protocol.

use serde::{Deserialize, Serialize};

use super::resource::Cost;
use crate::atanor::Solution;
use crate::ids::{BodyId, RoverId, ShipId, StructureKind, TileId};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE", rename_all_fields = "camelCase")]
pub enum Command {
    MoveShip {
        ship_id: ShipId,
        to: BodyId,
    },
    Build {
        body_id: BodyId,
        tile_id: TileId,
        kind: StructureKind,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        rotation: Option<i64>,
    },
    Upgrade {
        structure_id: String,
    },
    CancelConstruction {
        structure_id: String,
    },
    Demolish {
        structure_id: String,
    },
    SetRecipe {
        structure_id: String,
        recipe: String,
    },
    MoveRover {
        rover_id: RoverId,
        tile_index: usize,
    },
    AssignRover {
        rover_id: RoverId,
        structure_id: String,
    },
    ProduceRover {
        body_id: BodyId,
    },
    ScanSystem {
        ship_id: ShipId,
    },
    ChooseColonySite {
        body_id: BodyId,
    },
    PlaceSpaceport {
        body_id: BodyId,
        tile_id: TileId,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        rotation: Option<i64>,
    },
    CallShuttle {
        body_id: BodyId,
        cargo: Cost,
    },
    /// Fabryka atanorowa (AT4): keep the draft with the world; deploy a program as the machine.
    SaveAtanorDraft {
        structure_id: String,
        solution: Solution,
    },
    DeployAtanor {
        structure_id: String,
        solution: Solution,
    },
    /// Trade (B6, 05-SOCIAL §3.2): the cargo leaves the body's storage for a hub of the galaxy. The
    /// world only lets it go; the galaxy service carries it (the server checks the hub id).
    ShipToHub {
        body_id: BodyId,
        hub_id: String,
        cargo: Cost,
    },
    /// System command: a shipment from a hub lands in the body's storage. The server writes it into
    /// the world's log when the galaxy says it arrived; a client may not send it.
    HubDelivery {
        shipment_id: String,
        body_id: BodyId,
        cargo: Cost,
    },
}

impl Command {
    /// Commands only the server issues (the bridge from the galaxy into a world).
    pub fn is_system(&self) -> bool {
        matches!(self, Command::HubDelivery { .. })
    }

    /// Commands that only make sense with the galaxy service behind the world.
    pub fn needs_galaxy(&self) -> bool {
        matches!(self, Command::ShipToHub { .. } | Command::HubDelivery { .. })
    }
}
