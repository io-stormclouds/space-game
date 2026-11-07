import { BodyId, RoverId, ShipId } from '../../shared/ids';
import type { AtanorSolution } from '../../atanor/engine/types';
import type { AtanorDeployment } from './atanor-machine.model';
import { TileId } from './planet-grid.model';
import { Cost, MaterialCode, Stockpile } from './resource.model';
import { Rover } from './rover.model';
import { Structure, StructureKind } from './structure.model';
import { TransferPlan } from './transfer.model';

/**
 * One dictionary of rejection codes for the whole game. The first 13 come from the 3D PoC; the UI
 * maps each code to a text (W16: dictionary), the `detail` carries numbers ("brakuje FER 10").
 */
export const REJECT_CODES = [
  // 3D PoC
  'NO_FUEL',
  'NO_RETURN_RESERVE',
  'ALREADY_THERE',
  'IN_TRANSIT',
  'NO_SHIP',
  'TILE_OCCUPIED',
  'NO_RESOURCES',
  'NO_GRID',
  'NO_DEPOSIT',
  'NO_POWER',
  'NO_ROVER',
  'ROVER_MOVING',
  'NO_PATH',
  // unified rules (economy doc, canvas)
  'NO_CREW',
  'NO_STORAGE',
  'LEVEL_CAP',
  'MAX_LEVEL',
  'NO_ATMOSPHERE',
  'NO_FOOTPRINT',
  'NOT_BUILDABLE',
  'NO_STRUCTURE',
  'BUSY',
  'NO_RECIPE',
  'ROVER_LIMIT',
  // colonisation flow (canvas)
  'NOT_SCANNED',
  'SCAN_RUNNING',
  'NO_COLONY_SITE',
  'NO_MOTHERSHIP',
  'NO_SHUTTLE',
  'NO_COLONY',
  // flight targets
  'NOT_LANDABLE',
  // Atanor machine (AT4): outside the building limits or the program cannot run; it does not
  // produce (no repeating cycle with deliveries)
  'MACHINE_INVALID',
  'MACHINE_NOT_PRODUCING',
] as const;

export type RejectReason = (typeof REJECT_CODES)[number];

/** Simulation faults that are not command rejections (Atanor: two atoms on one hex). */
export const FAULT_CODES = ['JAM'] as const;
export type FaultCode = (typeof FAULT_CODES)[number];

export interface ShuttleTrip {
  id: string;
  shipId: ShipId;
  bodyId: BodyId;
  cargo: Stockpile;
  /** Lands and unloads at this time. */
  arrivesAt: number;
  /** Back on the mothership and available again. */
  returnsAt: number;
  unloaded: boolean;
}

export interface VehicleOrder {
  id: string;
  bodyId: BodyId;
  kind: StructureKind;
  /** Structure that builds it (HQ or garage). */
  structureId: string;
  endsAt: number;
}

export type DomainEvent =
  | { type: 'TRANSFER_STARTED'; shipId: ShipId; plan: TransferPlan }
  | { type: 'TRANSFER_ARRIVED'; shipId: ShipId; bodyId: BodyId }
  | { type: 'MINING_TICK'; shipId: ShipId; bodyId: BodyId; resource: MaterialCode; amount: number }
  | { type: 'MINING_STOPPED'; shipId: ShipId; reason: 'CARGO_FULL' | 'DEPLETED' }
  | { type: 'CARGO_UNLOADED'; shipId: ShipId; bodyId: BodyId; cargo: Stockpile }
  | { type: 'REFUELED'; shipId: ShipId }
  | { type: 'CONSTRUCTION_ORDERED'; structure: Structure; cost: Cost; fromShipId?: ShipId }
  | { type: 'CONSTRUCTION_STARTED'; structureId: string; roverId: RoverId }
  | { type: 'STRUCTURE_BUILT'; structure: Structure; cost: Cost }
  | { type: 'UPGRADE_ORDERED'; structureId: string; cost: Cost }
  | { type: 'STRUCTURE_UPGRADED'; structureId: string; level: number }
  | { type: 'CONSTRUCTION_CANCELLED'; structureId: string; refund: Cost }
  | { type: 'STRUCTURE_DEMOLISHED'; structureId: string; refund: Cost }
  | { type: 'EXTRACTION_TICK'; bodyId: BodyId; tileId: TileId; resource: MaterialCode; amount: number }
  | { type: 'DEPOSIT_DEPLETED'; bodyId: BodyId; tileId: TileId }
  | { type: 'BATCH_STARTED'; structureId: string; recipe: string; consumed: Cost; progress?: number }
  | { type: 'BATCH_COMPLETED'; structureId: string; recipe: string; produced: Stockpile }
  | { type: 'RECIPE_SET'; structureId: string; recipe: string }
  | { type: 'ROVER_MOVE_ORDERED'; roverId: RoverId; path: ReadonlyArray<number> }
  | { type: 'ROVER_ARRIVED'; roverId: RoverId; tileIndex: number }
  | { type: 'ROVER_ASSIGNED'; roverId: RoverId; structureId: string }
  | { type: 'VEHICLE_ORDERED'; order: VehicleOrder; cost: Cost }
  | { type: 'ROVER_PRODUCED'; orderId: string; rover: Rover }
  | { type: 'SCAN_STARTED'; shipId: ShipId; endsAt: number }
  | { type: 'SCAN_COMPLETED'; bodyIds: ReadonlyArray<BodyId> }
  | { type: 'COLONY_SITE_CHOSEN'; bodyId: BodyId }
  | { type: 'SPACEPORT_PLACED'; structure: Structure; cost: Cost; shipId: ShipId; rovers: ReadonlyArray<Rover> }
  | { type: 'COLONY_FOUNDED'; bodyId: BodyId; structureId: string }
  | { type: 'SHUTTLE_LAUNCHED'; trip: ShuttleTrip }
  | { type: 'SHUTTLE_UNLOADED'; tripId: string; bodyId: BodyId; cargo: Stockpile }
  | { type: 'SHUTTLE_RETURNED'; tripId: string }
  // Fabryka atanorowa (AT4): drafts, deployment, atoms in and products out
  | { type: 'ATANOR_DRAFT_SAVED'; structureId: string; recipe: string; solution: AtanorSolution }
  | { type: 'ATANOR_DEPLOY_STARTED'; structureId: string; recipe: string; deployment: AtanorDeployment; cost: Cost }
  | { type: 'ATANOR_DEPLOYED'; structureId: string; returned: Stockpile }
  | { type: 'ATANOR_CONSUMED'; structureId: string; consumed: Stockpile }
  | { type: 'ATANOR_DELIVERED'; structureId: string; produced: Stockpile; count: number }
  | { type: 'COMMAND_REJECTED'; shipId?: ShipId; reason: RejectReason; detail?: string };

export type DomainEventType = DomainEvent['type'];
