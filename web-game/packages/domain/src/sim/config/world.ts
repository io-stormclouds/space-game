import { BodyId } from '../../shared/ids';
import { PlanetGrid, Tile, TileId } from '../models/planet-grid.model';
import { Rover } from '../models/rover.model';
import { Structure } from '../models/structure.model';
import { WorldState } from '../reducer';
import { Rules } from '../rules';
import { buildWorldGrids, createWorld, landingPadTileOf, padDockingOffset, topTile } from '../scenario';
import { POC_SCENARIO } from '../scenarios/poc';
import { INITIAL_BODIES } from './initial-world';

// The PoC world as module constants, for the ported tests. New code uses Simulation + a Scenario.

export { padDockingOffset, topTile };

/** Default rules (economy catalog, no overrides). */
export const POC_RULES = new Rules();

/** Surface grids of every body that has one, generated once per process (deterministic). */
export const WORLD_GRIDS: ReadonlyMap<BodyId, PlanetGrid> = buildWorldGrids(INITIAL_BODIES);

/** Home base starts with a landing pad on the top tile, a solar panel next to it and the port. */
export const INITIAL_STRUCTURES: ReadonlyArray<Structure> = POC_SCENARIO.structures(WORLD_GRIDS, POC_RULES);

export const INITIAL_ROVERS: ReadonlyArray<Rover> = POC_SCENARIO.rovers(WORLD_GRIDS, INITIAL_STRUCTURES);

/** Remaining amount of every deposit at the start. */
export const INITIAL_DEPOSITS: Readonly<Record<TileId, number>> = createWorld(POC_SCENARIO, WORLD_GRIDS, POC_RULES).deposits;

export function createInitialWorld(): WorldState {
  return createWorld(POC_SCENARIO, WORLD_GRIDS, POC_RULES);
}

/** Landing pad tile of a body, if it has one (the first built). */
export function landingPadTile(structures: ReadonlyArray<Structure>, bodyId: BodyId): Tile | null {
  return landingPadTileOf(WORLD_GRIDS, structures, bodyId);
}
