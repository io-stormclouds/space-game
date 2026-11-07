import { BodyId, RoverId, ShipId } from '../../shared/ids';
import { TileId } from './planet-grid.model';
import { Cost, ResourceKind, Stockpile } from './resource.model';
import { Structure } from './structure.model';
import { TransferPlan } from './transfer.model';

export type RejectReason =
  | 'NO_FUEL'
  | 'NO_RETURN_RESERVE'
  | 'ALREADY_THERE'
  | 'IN_TRANSIT'
  | 'NO_SHIP'
  | 'TILE_OCCUPIED'
  | 'NO_RESOURCES'
  | 'NO_GRID'
  | 'NO_DEPOSIT'
  | 'NO_POWER'
  | 'NO_ROVER'
  | 'ROVER_MOVING'
  | 'NO_PATH';

export type DomainEvent =
  | { type: 'TRANSFER_STARTED'; shipId: ShipId; plan: TransferPlan }
  | { type: 'TRANSFER_ARRIVED'; shipId: ShipId; bodyId: BodyId }
  | { type: 'MINING_TICK'; shipId: ShipId; bodyId: BodyId; resource: ResourceKind; amount: number }
  | { type: 'MINING_STOPPED'; shipId: ShipId; reason: 'CARGO_FULL' | 'DEPLETED' }
  | { type: 'CARGO_UNLOADED'; shipId: ShipId; cargo: Stockpile }
  | { type: 'REFUELED'; shipId: ShipId }
  | { type: 'STRUCTURE_BUILT'; structure: Structure; cost: Cost }
  | { type: 'EXTRACTION_TICK'; bodyId: BodyId; tileId: TileId; resource: ResourceKind; amount: number }
  | { type: 'DEPOSIT_DEPLETED'; bodyId: BodyId; tileId: TileId }
  | { type: 'ROVER_MOVE_ORDERED'; roverId: RoverId; path: ReadonlyArray<number> }
  | { type: 'ROVER_ARRIVED'; roverId: RoverId; tileIndex: number }
  | { type: 'COMMAND_REJECTED'; shipId?: ShipId; reason: RejectReason; detail?: string };
