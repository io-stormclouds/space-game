import { BodyId } from '../../shared/ids';
import { Vec3 } from '../math/vec3';
import { ResourceKind } from './resource.model';

export type TileId = string & { readonly __brand: 'TileId' };
export const tileId = (bodyId: BodyId, index: number): TileId => `${bodyId}:${index}` as TileId;

export type TileKind = 'PENT' | 'HEX';

/** Static description of a deposit; the remaining amount lives in `WorldState.deposits`. */
export interface Deposit {
  resource: ResourceKind;
  /** Initial amount. */
  amount: number;
}

/** One face of the Goldberg polyhedron, in the body's local frame (body centre at the origin). */
export interface Tile {
  id: TileId;
  /** 0..N−1, stable for a given (frequency). */
  index: number;
  kind: TileKind;
  /** On the sphere of the body's radius. */
  center: Vec3;
  /** Unit vector = normalize(center). */
  normal: Vec3;
  /** 5 or 6 points on the sphere, counter-clockwise seen from outside. */
  vertices: ReadonlyArray<Vec3>;
  /** Indices of the 5 or 6 neighbouring tiles, same angular order as `vertices`. */
  neighbors: ReadonlyArray<number>;
  deposit: Deposit | null;
}

export interface PlanetGrid {
  bodyId: BodyId;
  /** n in GP(n,0). Tiles = 10·n² + 2. */
  frequency: number;
  radius: number;
  tiles: ReadonlyArray<Tile>;
  /** Approximate edge length of a hexagonal tile; used to size what is placed on it. */
  tileEdge: number;
}
