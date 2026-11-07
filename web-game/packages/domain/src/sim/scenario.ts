import { BodyId } from '../shared/ids';
import { GAME_CONSTANTS, GameConstants } from './config/game-constants';
import { buildGoldbergGrid } from './math/goldberg-grid';
import { footprintTiles } from './math/footprint';
import { Vec3, scale, vec3 } from './math/vec3';
import { CelestialBody } from './models/celestial-body.model';
import { PlanetGrid, Tile, TileId, tileId } from './models/planet-grid.model';
import { Stockpile } from './models/resource.model';
import { Rover } from './models/rover.model';
import { Spacecraft } from './models/spacecraft.model';
import { Structure, StructureKind } from './models/structure.model';
import { WorldState } from './reducer';
import { RuleOverrides, Rules } from './rules';
import { ColonizationParams } from './systems/colony-system';

/** A starting world as data (W06: the world is data, scenarios are presets). */
export interface Scenario {
  id: string;
  name: string;
  bodies: ReadonlyArray<CelestialBody>;
  ships: ReadonlyArray<Spacecraft>;
  /** Structures standing at t = 0, placed deterministically on the grids. */
  structures(grids: ReadonlyMap<BodyId, PlanetGrid>, rules: Rules): Structure[];
  /** Rovers at t = 0. */
  rovers(grids: ReadonlyMap<BodyId, PlanetGrid>, structures: ReadonlyArray<Structure>): Rover[];
  storage: Readonly<Record<BodyId, Stockpile>>;
  overrides?: RuleOverrides;
  colonization: ColonizationParams;
  constants?: Partial<GameConstants>;
  /** Whether the system scan has been done at t = 0. */
  scanned: boolean;
}

/** Same numbers for every scenario unless it overrides them. */
export const DEFAULT_COLONIZATION: ColonizationParams = {
  scanMinutes: 15,
  portCost: { STA: 120, BET: 80, UKL: 10 },
  portBuildMinutes: 12,
  landedRovers: 2,
  shuttleCapacity: 250,
  shuttleTripMinutes: 6,
};

export function scenarioConstants(s: Scenario): GameConstants {
  return { ...GAME_CONSTANTS, ...s.constants };
}

/** Surface grids of every body that has one (deterministic). */
export function buildWorldGrids(bodies: ReadonlyArray<CelestialBody>): Map<BodyId, PlanetGrid> {
  return new Map(
    bodies
      .filter((b) => b.surfaceGrid)
      .map((b) => [b.id, buildGoldbergGrid(b.id, b.radius, b.surfaceGrid!.frequency, b.surfaceGrid!.depositSeed, b.surfaceGrid!.depositWeights)]),
  );
}

export function createWorld(s: Scenario, grids: ReadonlyMap<BodyId, PlanetGrid>, rules: Rules): WorldState {
  const structures = s.structures(grids, rules);
  const deposits: Record<TileId, number> = {};
  for (const grid of grids.values()) for (const t of grid.tiles) if (t.deposit) deposits[t.id] = t.deposit.amount;
  return {
    time: 0,
    bodies: s.bodies,
    ships: s.ships,
    storage: { ...s.storage },
    structures,
    deposits,
    rovers: s.rovers(grids, structures),
    scan: s.scanned ? { state: 'DONE', at: 0 } : { state: 'NONE' },
    colony: { siteBodyId: null, foundedAt: null },
    shuttles: [],
    vehicleOrders: [],
    nextId: 0,
  };
}

/** A structure that already works at t = 0. */
export function standingStructure(kind: StructureKind, bodyId: BodyId, tiles: ReadonlyArray<number>, level = 1): Structure {
  const ids = tiles.map((i) => tileId(bodyId, i));
  return {
    id: `${kind}@${ids[0]}`,
    kind,
    bodyId,
    tileId: ids[0]!,
    tiles: ids,
    level,
    targetLevel: level,
    state: 'ACTIVE',
    progress: 0,
    paid: {},
    builtAt: 0,
  };
}

/** The tile closest to the body's local +Y: where the home landing pad goes. */
export function topTile(grid: PlanetGrid): Tile {
  return grid.tiles.reduce((best, t) => (t.normal.y > best.normal.y ? t : best), grid.tiles[0]!);
}

/**
 * First place near the top of the grid, at least `minRing` steps from the top tile, where a
 * footprint of `size` fits on free tiles without deposits. Deterministic.
 */
export function findFreeFootprint(grid: PlanetGrid, size: number, taken: ReadonlySet<number>, minRing = 0): number[] | null {
  const top = topTile(grid).index;
  const ring = new Map<number, number>([[top, 0]]);
  const queue = [top];
  for (let q = 0; q < queue.length; q++) {
    const cur = queue[q]!;
    for (const n of grid.tiles[cur]!.neighbors) {
      if (ring.has(n)) continue;
      ring.set(n, ring.get(cur)! + 1);
      queue.push(n);
    }
  }
  const order = [...grid.tiles].sort((a, b) => ring.get(a.index)! - ring.get(b.index)! || b.normal.y - a.normal.y);
  for (const t of order) {
    if (ring.get(t.index)! < minRing) continue;
    for (let r = 0; r < t.neighbors.length; r++) {
      const tiles = footprintTiles(grid, t.index, size, r);
      if (tiles && tiles.every((i) => !taken.has(i) && !grid.tiles[i]!.deposit)) return tiles;
    }
  }
  return null;
}

/** Docking point for a landing pad tile: tile centre lifted along its normal. */
export function padDockingOffset(grid: PlanetGrid, tile: Tile, padLiftFactor: number = GAME_CONSTANTS.padLiftFactor, out: Vec3 = vec3()): Vec3 {
  return scale(out, tile.normal, grid.radius * (1 + padLiftFactor));
}

/** Landing pad tile of a body (the first LAND built), if it has one. The port is not a docking point: the mothership stays in orbit. */
export function landingPadTileOf(grids: ReadonlyMap<BodyId, PlanetGrid>, structures: ReadonlyArray<Structure>, bodyId: BodyId): Tile | null {
  const grid = grids.get(bodyId);
  const pad = structures.find((s) => s.bodyId === bodyId && s.kind === 'LAND' && s.level > 0);
  if (!grid || !pad) return null;
  return grid.tiles.find((t) => t.id === pad.tileId) ?? null;
}
