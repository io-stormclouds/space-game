import type { ResolvedItem } from './catalog/catalog';
import type { Connector, EdgeKind, ObjectLayer } from './catalog/catalog.types';
import {
  CEILING_Y,
  CELL,
  LEVEL_HEIGHT,
  SNAP,
  edgeAxisOfRot,
  frontOf,
  rectAround,
  rotatedSize,
  sideOfRot,
  snapSize,
  type Axis,
  type EdgeRef,
  type Rect,
  type Rot,
  type XZ,
} from './grid';
import type { Piece } from './layout';

/** Footprint of an object in its own frame (unrotated), and where its centre sits relative to the model pivot. */
export interface Footprint {
  readonly w: number;
  readonly d: number;
  /** Footprint centre in model coordinates. */
  readonly ox: number;
  readonly oz: number;
}

export function footprintOf(item: ResolvedItem): Footprint {
  const { min, max } = item.info;
  const p = item.entry.placement;
  if (p.kind === 'object' && p.footprint) {
    const usePivot = p.pivot === 'model';
    return {
      w: p.footprint[0],
      d: p.footprint[1],
      ox: usePivot ? 0 : (min[0] + max[0]) / 2,
      oz: usePivot ? 0 : (min[2] + max[2]) / 2,
    };
  }
  return {
    w: snapSize(max[0] - min[0]),
    d: snapSize(max[2] - min[2]),
    ox: (min[0] + max[0]) / 2,
    oz: (min[2] + max[2]) / 2,
  };
}

/** Half-thickness of an edge model (its real wall face distance from the edge line). */
export const wallFaceOf = (item: ResolvedItem): number => Math.max(-item.info.min[2], item.info.max[2]);

/** Clearance band each side of an edge element where floor objects may not stand (0.5 m steps). */
export const edgeBandOf = (item: ResolvedItem): number =>
  Math.max(SNAP, Math.ceil(wallFaceOf(item) / SNAP - 1e-6) * SNAP);

export type PieceShape =
  | {
      readonly kind: 'floor';
      readonly cells: readonly XZ[];
      readonly noObjects: boolean;
      readonly raisesDeck: boolean;
      readonly connector?: Connector;
    }
  | { readonly kind: 'ceiling'; readonly cells: readonly XZ[] }
  | { readonly kind: 'edge'; readonly edges: readonly EdgeRef[]; readonly edgeKind: EdgeKind; readonly side: 1 | -1; readonly band: number }
  | { readonly kind: 'object'; readonly layer: Exclude<ObjectLayer, 'wall'>; readonly rect: Rect }
  | {
      readonly kind: 'wall-object';
      readonly axis: Axis;
      /** Index of the edge line (z for axis 'x', x for axis 'z'). */
      readonly line: number;
      /** Interval along the wall, metres. */
      readonly from: number;
      readonly to: number;
      readonly side: 1 | -1;
      readonly edges: readonly EdgeRef[];
    };

const EPS = 1e-6;

/** Cells, edges or rectangle a piece occupies. Pure geometry; no knowledge of other pieces. */
export function shapeOf(piece: Piece, item: ResolvedItem): PieceShape {
  const p = item.entry.placement;
  const { level, x, z, rot } = piece;
  switch (p.kind) {
    case 'floor':
    case 'ceiling': {
      const s = p.size;
      const x0 = Math.round((x - (s * CELL) / 2) / CELL);
      const z0 = Math.round((z - (s * CELL) / 2) / CELL);
      const cells: XZ[] = [];
      for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) cells.push({ x: x0 + i, z: z0 + j });
      return p.kind === 'floor'
        ? { kind: 'floor', cells, noObjects: !!p.noObjects, raisesDeck: !!p.raisesDeck, ...(p.connector ? { connector: p.connector } : {}) }
        : { kind: 'ceiling', cells };
    }
    case 'edge': {
      const axis = edgeAxisOfRot(rot);
      const edges: EdgeRef[] = [];
      if (axis === 'x') {
        const x0 = Math.round((x - (p.span * CELL) / 2) / CELL);
        const zl = Math.round(z / CELL);
        for (let i = 0; i < p.span; i++) edges.push({ level, axis, x: x0 + i, z: zl });
      } else {
        const z0 = Math.round((z - (p.span * CELL) / 2) / CELL);
        const xl = Math.round(x / CELL);
        for (let i = 0; i < p.span; i++) edges.push({ level, axis, x: xl, z: z0 + i });
      }
      return { kind: 'edge', edges, edgeKind: p.edge, side: sideOfRot(rot), band: edgeBandOf(item) };
    }
    case 'object': {
      if (p.layer === 'wall') {
        const axis = edgeAxisOfRot(rot);
        const width = item.info.max[0] - item.info.min[0];
        const along = axis === 'x' ? x : z;
        const line = Math.round((axis === 'x' ? z : x) / CELL);
        const from = along - width / 2;
        const to = along + width / 2;
        const edges: EdgeRef[] = [];
        for (let i = Math.floor((from + EPS) / CELL); i <= Math.floor((to - EPS) / CELL); i++) {
          edges.push(axis === 'x' ? { level, axis, x: i, z: line } : { level, axis, x: line, z: i });
        }
        return { kind: 'wall-object', axis, line, from, to, side: sideOfRot(rot), edges };
      }
      const fp = footprintOf(item);
      const [w, d] = rotatedSize(fp.w, fp.d, rot);
      return { kind: 'object', layer: p.layer, rect: rectAround(x, z, w, d) };
    }
  }
}

/** Where to put the model: instance matrix = T(x, y, z) · Ry(rot·90°) · T(local). */
export interface PieceTransform {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly rot: Rot;
  readonly localX: number;
  readonly localZ: number;
}

export interface TransformContext {
  /** Height of the top of the surface under a point (table top), 0 for bare floor. */
  surfaceHeightAt(level: number, x: number, z: number, exceptId?: string): number;
  /** Wall-face distance of the edge element a wall item hangs on. */
  wallFaceAt(level: number, axis: Axis, line: number, along: number): number | undefined;
}

/** Default wall-face distance (standard walls are 0.72–0.74 m thick). */
export const DEFAULT_WALL_FACE = 0.37;

export function transformOf(piece: Piece, item: ResolvedItem, ctx: TransformContext): PieceTransform {
  const p = item.entry.placement;
  const baseY = piece.level * LEVEL_HEIGHT;
  const plain = { x: piece.x, y: baseY, z: piece.z, rot: piece.rot, localX: 0, localZ: 0 };
  if (p.kind !== 'object') return plain;
  const fp = footprintOf(item);
  switch (p.layer) {
    case 'floor':
      return { ...plain, localX: -fp.ox, localZ: -fp.oz };
    case 'surface':
      return {
        ...plain,
        y: baseY + ctx.surfaceHeightAt(piece.level, piece.x, piece.z, piece.id),
        localX: -fp.ox,
        localZ: -fp.oz,
      };
    case 'ceiling':
      return { ...plain, y: baseY + CEILING_Y - item.info.max[1], localX: -fp.ox, localZ: -fp.oz };
    case 'wall': {
      const axis = edgeAxisOfRot(piece.rot);
      const line = Math.round((axis === 'x' ? piece.z : piece.x) / CELL);
      const along = axis === 'x' ? piece.x : piece.z;
      const face = ctx.wallFaceAt(piece.level, axis, line, along) ?? DEFAULT_WALL_FACE;
      const dist = face - item.info.min[2] - (p.inset ?? 0);
      const f = frontOf(piece.rot);
      return {
        x: piece.x + f.x * dist,
        y: baseY + (p.mountY ?? 0),
        z: piece.z + f.z * dist,
        rot: piece.rot,
        localX: -fp.ox,
        localZ: 0,
      };
    }
  }
}
