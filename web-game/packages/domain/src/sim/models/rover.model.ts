import { BodyId, RoverId } from '../../shared/ids';

export type RoverState = 'IDLE' | 'MOVING';

/** Surface vehicle. Lives on one body and moves tile to tile over the Goldberg grid. */
export interface Rover {
  id: RoverId;
  name: string;
  bodyId: BodyId;
  /** Tile it stands on (IDLE) or departed from (MOVING). */
  tileIndex: number;
  state: RoverState;
  /** Remaining tile indices to visit, destination last. Empty when IDLE. */
  path: ReadonlyArray<number>;
}
