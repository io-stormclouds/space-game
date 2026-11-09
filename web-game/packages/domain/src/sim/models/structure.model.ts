import { BodyId } from '../../shared/ids';
import { TileId } from './planet-grid.model';
import { Cost } from './resource.model';

/** Building id from the economy catalog: MIN, ICE, SIT, SOL, WND, HAB, DEP, SKL, LAND, HQ, SMT… */
export type StructureKind = string;

/**
 * PLANNED: ordered, materials paid, waiting for a rover. CONSTRUCTING: a rover is building it.
 * ACTIVE: working at `level`. UPGRADING: working at `level` with reduced output while `targetLevel` is built.
 */
export type StructureState = 'PLANNED' | 'CONSTRUCTING' | 'ACTIVE' | 'UPGRADING';

export interface ProductionBatch {
  recipe: string;
  /** 0..1 */
  progress: number;
}

export interface Structure {
  id: string;
  kind: StructureKind;
  bodyId: BodyId;
  /** Anchor tile (the one the player clicked). */
  tileId: TileId;
  /** Every tile of the footprint, anchor first. */
  tiles: ReadonlyArray<TileId>;
  /** Working level; 0 until the first construction ends. */
  level: number;
  /** Level being built: 1 for a new building, level + 1 while upgrading. */
  targetLevel: number;
  state: StructureState;
  /** 0..1 of the current construction or upgrade. */
  progress: number;
  /** What the current construction cost (for refunds). */
  paid: Cost;
  /** Game time when it was ordered. */
  builtAt: number;
  /**
   * Build time of the first construction in % of the catalog time, from the terrain under the footprint
   * (integer; set only when ≠ 100, dropped when the building is finished; upgrades ignore it).
   */
  timePct?: number;
  /** Selected production recipe (buildings with several). */
  recipe?: string;
  /** Production in progress. */
  batch?: ProductionBatch | null;
}

/** Whether the structure works (produces, consumes, stores). */
export function isWorking(s: Structure): boolean {
  return s.state === 'ACTIVE' || s.state === 'UPGRADING';
}

/** Whether the structure is a construction site that needs a rover. */
export function isSite(s: Structure): boolean {
  return s.state !== 'ACTIVE';
}
