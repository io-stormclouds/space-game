import { BodyId, RoverId } from '../../shared/ids';

/** IDLE; MOVING along `path`; BUILDING at the site of `job`. */
export type RoverState = 'IDLE' | 'MOVING' | 'BUILDING';

/** Construction rover (Łazik konstrukcyjny). Lives on one body and moves tile to tile over the Goldberg grid. */
export interface Rover {
  id: RoverId;
  name: string;
  bodyId: BodyId;
  /** Tile it stands on (IDLE, BUILDING) or departed from (MOVING). */
  tileIndex: number;
  state: RoverState;
  /** Remaining tile indices to visit, destination last. Empty when not moving. */
  path: ReadonlyArray<number>;
  /** Construction site (structure id) it works for, or null. */
  job: string | null;
}
