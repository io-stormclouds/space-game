import { BodyId, ShipId } from '../../shared/ids';
import { Stockpile } from './resource.model';
import { TransferPlan } from './transfer.model';

export type ShipState = 'DOCKED' | 'IN_TRANSIT' | 'MINING';

export interface Spacecraft {
  id: ShipId;
  name: string;
  fuel: number;
  maxFuel: number;
  cargo: Stockpile;
  /** Limit on the total of all resources in the hold. */
  maxCargo: number;
  state: ShipState;
  /** null while IN_TRANSIT. */
  currentBodyId: BodyId | null;
  targetBodyId: BodyId | null;
  transfer: TransferPlan | null;
}
