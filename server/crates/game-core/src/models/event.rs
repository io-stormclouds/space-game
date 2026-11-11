//! Domain events and rejection codes (`domain-event.model.ts`). One dictionary for the whole game:
//! the UI maps each code to a text (W16), `detail` carries the numbers ("brakuje FER 10").

use serde::{Deserialize, Serialize};

use super::atanor_machine::Deployment;
use super::resource::{Cost, Stockpile};
use super::rover::Rover;
use super::structure::Structure;
use super::transfer::TransferPlan;
use crate::atanor::Solution;
use crate::ids::{BodyId, MaterialCode, RoverId, ShipId, StructureKind, TileId};

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq, Hash)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum RejectReason {
    // 3D PoC
    NoFuel,
    NoReturnReserve,
    AlreadyThere,
    InTransit,
    NoShip,
    TileOccupied,
    NoResources,
    NoGrid,
    NoDeposit,
    NoPower,
    NoRover,
    RoverMoving,
    NoPath,
    // unified rules (economy doc, canvas)
    NoCrew,
    NoStorage,
    LevelCap,
    MaxLevel,
    NoAtmosphere,
    NoFootprint,
    NotBuildable,
    NoStructure,
    Busy,
    NoRecipe,
    RoverLimit,
    // colonisation flow (canvas)
    NotScanned,
    ScanRunning,
    NoColonySite,
    NoMothership,
    NoShuttle,
    NoColony,
    // flight targets
    NotLandable,
    // Atanor machine (AT4): outside the building limits, or the program cannot run (it does not
    // reach a repeating cycle with deliveries)
    MachineInvalid,
    MachineNotProducing,
    // terrain (T8): a footprint tile cannot be built on (water); `detail` names its class
    BadTerrain,
}

/// Simulation faults that are not command rejections (Atanor: two atoms on one hex).
#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum FaultCode {
    Jam,
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "SCREAMING_SNAKE_CASE")]
pub enum MiningStopReason {
    CargoFull,
    Depleted,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ShuttleTrip {
    pub id: String,
    pub ship_id: ShipId,
    pub body_id: BodyId,
    pub cargo: Stockpile,
    /// Lands and unloads at this time.
    pub arrives_at: f64,
    /// Back on the mothership and available again.
    pub returns_at: f64,
    pub unloaded: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct VehicleOrder {
    pub id: String,
    pub body_id: BodyId,
    pub kind: StructureKind,
    /// Structure that builds it (HQ or garage).
    pub structure_id: String,
    pub ends_at: f64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE", rename_all_fields = "camelCase")]
pub enum DomainEvent {
    TransferStarted {
        ship_id: ShipId,
        plan: TransferPlan,
    },
    TransferArrived {
        ship_id: ShipId,
        body_id: BodyId,
    },
    MiningTick {
        ship_id: ShipId,
        body_id: BodyId,
        resource: MaterialCode,
        amount: f64,
    },
    MiningStopped {
        ship_id: ShipId,
        reason: MiningStopReason,
    },
    CargoUnloaded {
        ship_id: ShipId,
        body_id: BodyId,
        cargo: Stockpile,
    },
    Refueled {
        ship_id: ShipId,
    },
    ConstructionOrdered {
        structure: Structure,
        cost: Cost,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        from_ship_id: Option<ShipId>,
    },
    ConstructionStarted {
        structure_id: String,
        rover_id: RoverId,
    },
    StructureBuilt {
        structure: Structure,
        cost: Cost,
    },
    UpgradeOrdered {
        structure_id: String,
        cost: Cost,
    },
    StructureUpgraded {
        structure_id: String,
        level: u32,
    },
    ConstructionCancelled {
        structure_id: String,
        refund: Cost,
    },
    StructureDemolished {
        structure_id: String,
        refund: Cost,
    },
    ExtractionTick {
        body_id: BodyId,
        tile_id: TileId,
        resource: MaterialCode,
        amount: f64,
    },
    DepositDepleted {
        body_id: BodyId,
        tile_id: TileId,
    },
    BatchStarted {
        structure_id: String,
        recipe: String,
        consumed: Cost,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        progress: Option<f64>,
    },
    BatchCompleted {
        structure_id: String,
        recipe: String,
        produced: Stockpile,
    },
    RecipeSet {
        structure_id: String,
        recipe: String,
    },
    RoverMoveOrdered {
        rover_id: RoverId,
        path: Vec<usize>,
    },
    RoverArrived {
        rover_id: RoverId,
        tile_index: usize,
    },
    RoverAssigned {
        rover_id: RoverId,
        structure_id: String,
    },
    VehicleOrdered {
        order: VehicleOrder,
        cost: Cost,
    },
    RoverProduced {
        order_id: String,
        rover: Rover,
    },
    ScanStarted {
        ship_id: ShipId,
        ends_at: f64,
    },
    ScanCompleted {
        body_ids: Vec<BodyId>,
    },
    ColonySiteChosen {
        body_id: BodyId,
    },
    SpaceportPlaced {
        structure: Structure,
        cost: Cost,
        ship_id: ShipId,
        rovers: Vec<Rover>,
    },
    ColonyFounded {
        body_id: BodyId,
        structure_id: String,
    },
    ShuttleLaunched {
        trip: ShuttleTrip,
    },
    ShuttleUnloaded {
        trip_id: String,
        body_id: BodyId,
        cargo: Stockpile,
    },
    ShuttleReturned {
        trip_id: String,
    },
    // Fabryka atanorowa (AT4): drafts, deployment, atoms in and products out
    AtanorDraftSaved {
        structure_id: String,
        recipe: String,
        solution: Solution,
    },
    AtanorDeployStarted {
        structure_id: String,
        recipe: String,
        cost: Cost,
        deployment: Deployment,
    },
    AtanorDeployed {
        structure_id: String,
        returned: Stockpile,
    },
    AtanorConsumed {
        structure_id: String,
        consumed: Stockpile,
    },
    AtanorDelivered {
        structure_id: String,
        produced: Stockpile,
        count: u64,
    },
    // trade with the hubs (B6): the cargo left for a hub, a shipment from a hub landed
    ShipmentDeparted {
        shipment_id: String,
        body_id: BodyId,
        hub_id: String,
        cargo: Stockpile,
    },
    HubDelivered {
        shipment_id: String,
        body_id: BodyId,
        cargo: Stockpile,
    },
    CommandRejected {
        #[serde(default, skip_serializing_if = "Option::is_none")]
        ship_id: Option<ShipId>,
        reason: RejectReason,
        #[serde(default, skip_serializing_if = "Option::is_none")]
        detail: Option<String>,
    },
}

impl DomainEvent {
    pub fn rejected(reason: RejectReason) -> DomainEvent {
        DomainEvent::CommandRejected { ship_id: None, reason, detail: None }
    }

    pub fn rejected_with(reason: RejectReason, detail: impl Into<String>) -> DomainEvent {
        DomainEvent::CommandRejected { ship_id: None, reason, detail: Some(detail.into()) }
    }

    pub fn is_rejection(&self) -> bool {
        matches!(self, DomainEvent::CommandRejected { .. })
    }

    /// The `type` tag of the event, e.g. `TRANSFER_STARTED`.
    pub fn type_name(&self) -> &'static str {
        match self {
            DomainEvent::TransferStarted { .. } => "TRANSFER_STARTED",
            DomainEvent::TransferArrived { .. } => "TRANSFER_ARRIVED",
            DomainEvent::MiningTick { .. } => "MINING_TICK",
            DomainEvent::MiningStopped { .. } => "MINING_STOPPED",
            DomainEvent::CargoUnloaded { .. } => "CARGO_UNLOADED",
            DomainEvent::Refueled { .. } => "REFUELED",
            DomainEvent::ConstructionOrdered { .. } => "CONSTRUCTION_ORDERED",
            DomainEvent::ConstructionStarted { .. } => "CONSTRUCTION_STARTED",
            DomainEvent::StructureBuilt { .. } => "STRUCTURE_BUILT",
            DomainEvent::UpgradeOrdered { .. } => "UPGRADE_ORDERED",
            DomainEvent::StructureUpgraded { .. } => "STRUCTURE_UPGRADED",
            DomainEvent::ConstructionCancelled { .. } => "CONSTRUCTION_CANCELLED",
            DomainEvent::StructureDemolished { .. } => "STRUCTURE_DEMOLISHED",
            DomainEvent::ExtractionTick { .. } => "EXTRACTION_TICK",
            DomainEvent::DepositDepleted { .. } => "DEPOSIT_DEPLETED",
            DomainEvent::BatchStarted { .. } => "BATCH_STARTED",
            DomainEvent::BatchCompleted { .. } => "BATCH_COMPLETED",
            DomainEvent::RecipeSet { .. } => "RECIPE_SET",
            DomainEvent::RoverMoveOrdered { .. } => "ROVER_MOVE_ORDERED",
            DomainEvent::RoverArrived { .. } => "ROVER_ARRIVED",
            DomainEvent::RoverAssigned { .. } => "ROVER_ASSIGNED",
            DomainEvent::VehicleOrdered { .. } => "VEHICLE_ORDERED",
            DomainEvent::RoverProduced { .. } => "ROVER_PRODUCED",
            DomainEvent::ScanStarted { .. } => "SCAN_STARTED",
            DomainEvent::ScanCompleted { .. } => "SCAN_COMPLETED",
            DomainEvent::ColonySiteChosen { .. } => "COLONY_SITE_CHOSEN",
            DomainEvent::SpaceportPlaced { .. } => "SPACEPORT_PLACED",
            DomainEvent::ColonyFounded { .. } => "COLONY_FOUNDED",
            DomainEvent::ShuttleLaunched { .. } => "SHUTTLE_LAUNCHED",
            DomainEvent::ShuttleUnloaded { .. } => "SHUTTLE_UNLOADED",
            DomainEvent::ShuttleReturned { .. } => "SHUTTLE_RETURNED",
            DomainEvent::AtanorDraftSaved { .. } => "ATANOR_DRAFT_SAVED",
            DomainEvent::AtanorDeployStarted { .. } => "ATANOR_DEPLOY_STARTED",
            DomainEvent::AtanorDeployed { .. } => "ATANOR_DEPLOYED",
            DomainEvent::AtanorConsumed { .. } => "ATANOR_CONSUMED",
            DomainEvent::AtanorDelivered { .. } => "ATANOR_DELIVERED",
            DomainEvent::ShipmentDeparted { .. } => "SHIPMENT_DEPARTED",
            DomainEvent::HubDelivered { .. } => "HUB_DELIVERED",
            DomainEvent::CommandRejected { .. } => "COMMAND_REJECTED",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn json_shape_matches_ts() {
        let e = DomainEvent::rejected_with(RejectReason::NoPower, "brakuje 3 MW");
        let json = serde_json::to_value(&e).unwrap();
        assert_eq!(json, serde_json::json!({ "type": "COMMAND_REJECTED", "reason": "NO_POWER", "detail": "brakuje 3 MW" }));
        let e = DomainEvent::MiningStopped { ship_id: "ship-1".into(), reason: MiningStopReason::CargoFull };
        assert_eq!(
            serde_json::to_value(&e).unwrap(),
            serde_json::json!({ "type": "MINING_STOPPED", "shipId": "ship-1", "reason": "CARGO_FULL" })
        );
    }
}
