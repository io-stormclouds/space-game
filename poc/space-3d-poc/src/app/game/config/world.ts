import { BodyId } from '../../shared/ids';
import { buildGoldbergGrid } from '../math/goldberg-grid';
import { Vec3, scale, vec3 } from '../math/vec3';
import { PlanetGrid, Tile, TileId, tileId } from '../models/planet-grid.model';
import { Rover } from '../models/rover.model';
import { Structure } from '../models/structure.model';
import { WorldState } from '../reducer';
import { GAME_CONSTANTS } from './game-constants';
import { INITIAL_BODIES, INITIAL_ROVER, INITIAL_SHIPS, INITIAL_STOCKPILE, PLANET_ID } from './initial-world';

/** Surface grids of every body that has one, generated once per process (deterministic). */
export const WORLD_GRIDS: ReadonlyMap<BodyId, PlanetGrid> = new Map(
  INITIAL_BODIES.filter((b) => b.surfaceGrid).map((b) => [
    b.id,
    buildGoldbergGrid(b.id, b.radius, b.surfaceGrid!.frequency, b.surfaceGrid!.depositSeed),
  ]),
);

/** The tile closest to the body's local +Y: where the home landing pad goes. */
export function topTile(grid: PlanetGrid): Tile {
  return grid.tiles.reduce((best, t) => (t.normal.y > best.normal.y ? t : best), grid.tiles[0]);
}

function structure(kind: Structure['kind'], bodyId: BodyId, index: number): Structure {
  return { id: `${kind}@${tileId(bodyId, index)}`, kind, bodyId, tileId: tileId(bodyId, index), builtAt: 0 };
}

/** Home base starts with a landing pad on the top tile and a solar panel next to it. */
export const INITIAL_STRUCTURES: ReadonlyArray<Structure> = (() => {
  const grid = WORLD_GRIDS.get(PLANET_ID);
  if (!grid) return [];
  const pad = topTile(grid);
  const solar = pad.neighbors.find((n) => !grid.tiles[n].deposit) ?? pad.neighbors[0];
  return [structure('LANDING_PAD', PLANET_ID, pad.index), structure('SOLAR', PLANET_ID, solar)];
})();

export const INITIAL_ROVERS: ReadonlyArray<Rover> = (() => {
  const grid = WORLD_GRIDS.get(INITIAL_ROVER.bodyId);
  return grid ? [{ ...INITIAL_ROVER, tileIndex: topTile(grid).index }] : [];
})();

/** Remaining amount of every deposit at the start. */
export const INITIAL_DEPOSITS: Readonly<Record<TileId, number>> = (() => {
  const out: Record<TileId, number> = {};
  for (const grid of WORLD_GRIDS.values()) {
    for (const t of grid.tiles) if (t.deposit) out[t.id] = t.deposit.amount;
  }
  return out;
})();

export function createInitialWorld(): WorldState {
  return {
    bodies: INITIAL_BODIES,
    ships: INITIAL_SHIPS,
    stockpile: { ...INITIAL_STOCKPILE },
    structures: INITIAL_STRUCTURES,
    deposits: INITIAL_DEPOSITS,
    rovers: INITIAL_ROVERS,
  };
}

/** Docking point for a landing pad tile: tile centre lifted along its normal. */
export function padDockingOffset(grid: PlanetGrid, tile: Tile, out: Vec3 = vec3()): Vec3 {
  return scale(out, tile.normal, grid.radius * (1 + GAME_CONSTANTS.padLiftFactor));
}

/** Landing pad tile of a body, if it has one (the first built). */
export function landingPadTile(structures: ReadonlyArray<Structure>, bodyId: BodyId): Tile | null {
  const grid = WORLD_GRIDS.get(bodyId);
  const pad = structures.find((s) => s.bodyId === bodyId && s.kind === 'LANDING_PAD');
  if (!grid || !pad) return null;
  return grid.tiles.find((t) => t.id === pad.tileId) ?? null;
}
