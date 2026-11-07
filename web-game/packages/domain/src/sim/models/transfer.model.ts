import { BodyId, ShipId } from '../../shared/ids';
import { Vec3 } from '../math/vec3';

/** Immutable description of a transfer stored in game state. Per-frame progress lives in TransferSystem. */
export interface TransferPlan {
  shipId: ShipId;
  fromBodyId: BodyId;
  toBodyId: BodyId;
  /** Game time at departure. */
  startTime: number;
  /** World position at departure. */
  startPos: Vec3;
  /** Predicted intercept point at departure (refined every frame inside TransferSystem). */
  leadPos: Vec3;
  cruiseSpeed: number;
  estimatedDuration: number;
  fuelCost: number;
}
