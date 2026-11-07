import { BodyId, ShipId } from '../../shared/ids';
import { Stockpile } from './resource.model';
import { TransferPlan } from './transfer.model';

export type ShipState = 'DOCKED' | 'IN_TRANSIT' | 'MINING';
/** SHIP: PoC transport that mines and unloads at the home base. MOTHERSHIP: Arka-1, carries the colony. */
export type ShipRole = 'SHIP' | 'MOTHERSHIP';

/** Units carried by a mothership, released during colonisation. */
export interface Onboard {
  rovers: number;
  shuttles: number;
  probes: number;
}

export interface Spacecraft {
  id: ShipId;
  name: string;
  role: ShipRole;
  fuel: number;
  maxFuel: number;
  cargo: Stockpile;
  /** Limit on the total of all materials in the hold. */
  maxCargo: number;
  state: ShipState;
  /** null while IN_TRANSIT. */
  currentBodyId: BodyId | null;
  targetBodyId: BodyId | null;
  transfer: TransferPlan | null;
  onboard?: Onboard;
}
