import { BodyId, ShipId } from '../../shared/ids';
import { Vec3 } from '../math/vec3';

/**
 * Immutable description of a transfer. Arrival time and the intercept point are fixed when the
 * order is given (TECH-1): the position in flight is a pure function of the plan and the time.
 */
export interface TransferPlan {
  shipId: ShipId;
  fromBodyId: BodyId;
  toBodyId: BodyId;
  /** Game time at departure [min]. */
  startTime: number;
  /** World position at departure. */
  startPos: Vec3;
  /** Docking point of the target at arrival time. */
  leadPos: Vec3;
  cruiseSpeed: number;
  /** Flight time [min]; arrival = startTime + estimatedDuration. */
  estimatedDuration: number;
  fuelCost: number;
}

export function arrivalTime(plan: TransferPlan): number {
  return plan.startTime + plan.estimatedDuration;
}
