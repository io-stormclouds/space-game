/**
 * Grid geometry of the interior editor. Pure TypeScript.
 *
 * World axes follow the kit (glTF): +Y up, the deck lies in the XZ plane.
 * - A CELL is a 4 m × 4 m floor tile: cell (x, z) covers X ∈ [4x, 4x+4], Z ∈ [4z, 4z+4].
 * - An EDGE is the 4 m side of a cell; walls, doors, glass and railings live on edges,
 *   centred on the edge line (that is how the kit models are built: X ∈ [-2, 2], thickness on Z).
 *   axis 'x' edge (x, z): from vertex (x, z) to (x+1, z), separates cells (x, z-1) | (x, z).
 *   axis 'z' edge (x, z): from vertex (x, z) to (x, z+1), separates cells (x-1, z) | (x, z).
 * - A LEVEL (deck) is 4 m high; level L sits at y = 4L.
 * - Objects snap to a 0.5 m sub-grid.
 * - Rotation is a quarter-turn count about +Y. A model's FRONT is its local +Z, so after
 *   rotation r the front points to: 0 → +Z, 1 → +X, 2 → −Z, 3 → −X.
 */

export const CELL = 4;
export const LEVEL_HEIGHT = 4;
export const SNAP = 0.5;
/** Underside of the ceiling tile (Ceiling_Tile_Grey_Metal spans y 3.86–4.01). */
export const CEILING_Y = 3.86;

export type Rot = 0 | 1 | 2 | 3;
export type Axis = 'x' | 'z';

export interface XZ {
  readonly x: number;
  readonly z: number;
}

export interface CellRef extends XZ {
  readonly level: number;
}

export interface EdgeRef extends XZ {
  readonly level: number;
  readonly axis: Axis;
}

/** Axis-aligned rectangle on the deck, in metres. */
export interface Rect {
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
}

/** Inclusive rectangle of cells. */
export interface CellRect {
  readonly x0: number;
  readonly z0: number;
  readonly x1: number;
  readonly z1: number;
}

const EPS = 1e-6;

export const cellKey = (level: number, x: number, z: number): string => `${level}|${x}|${z}`;
export const edgeKey = (e: EdgeRef): string => `${e.level}|${e.axis}|${e.x}|${e.z}`;

export function parseEdgeKey(key: string): EdgeRef {
  const [level, axis, x, z] = key.split('|');
  return { level: Number(level), axis: axis as Axis, x: Number(x), z: Number(z) };
}

export function parseCellKey(key: string): CellRef {
  const [level, x, z] = key.split('|');
  return { level: Number(level), x: Number(x), z: Number(z) };
}

export const normRot = (r: number): Rot => ((((Math.round(r) % 4) + 4) % 4) as Rot);

export const snap = (v: number, step = SNAP): number => Math.round(v / step) * step;

/** Rounds a size to the 0.5 m sub-grid, never below one step. */
export const snapSize = (v: number): number => Math.max(SNAP, Math.round(v / SNAP) * SNAP);

export const cellOf = (x: number, z: number): XZ => ({
  x: Math.floor(x / CELL),
  z: Math.floor(z / CELL),
});

export const cellCenter = (x: number, z: number): XZ => ({
  x: (x + 0.5) * CELL,
  z: (z + 0.5) * CELL,
});

export function edgeCenter(e: EdgeRef): XZ {
  return e.axis === 'x'
    ? { x: (e.x + 0.5) * CELL, z: e.z * CELL }
    : { x: e.x * CELL, z: (e.z + 0.5) * CELL };
}

/** The two cells an edge separates: [negative side, positive side]. */
export function edgeCells(e: EdgeRef): readonly [XZ, XZ] {
  return e.axis === 'x'
    ? [
        { x: e.x, z: e.z - 1 },
        { x: e.x, z: e.z },
      ]
    : [
        { x: e.x - 1, z: e.z },
        { x: e.x, z: e.z },
      ];
}

export interface CellSide {
  readonly edge: EdgeRef;
  readonly neighbor: XZ;
}

/** The four edges of a cell with the neighbour across each one. */
export function cellSides(level: number, x: number, z: number): readonly CellSide[] {
  return [
    { edge: { level, axis: 'x', x, z }, neighbor: { x, z: z - 1 } },
    { edge: { level, axis: 'x', x, z: z + 1 }, neighbor: { x, z: z + 1 } },
    { edge: { level, axis: 'z', x, z }, neighbor: { x: x - 1, z } },
    { edge: { level, axis: 'z', x: x + 1, z }, neighbor: { x: x + 1, z } },
  ];
}

/** Edge between two side-by-side cells. */
export function edgeBetween(level: number, a: XZ, b: XZ): EdgeRef {
  return a.x === b.x ? { level, axis: 'x', x: a.x, z: Math.max(a.z, b.z) } : { level, axis: 'z', x: Math.max(a.x, b.x), z: a.z };
}

/** Rotation of an edge piece facing the given cell next to it. */
export function edgeRotTowards(e: EdgeRef, cell: XZ): Rot {
  const [, pos] = edgeCells(e);
  return edgeRot(e.axis, pos.x === cell.x && pos.z === cell.z ? 1 : -1);
}

/**
 * Stairs in cell `foot` (kit ramps rise towards their local −Z, so the low end is the front):
 * walk on from `entry` (the cell in front, same deck) and step off onto `landing` (the cell
 * behind, one deck up). The cell above the ramp must stay open.
 */
export interface StairsLink {
  readonly foot: CellRef;
  readonly entry: CellRef;
  readonly landing: CellRef;
  /** foot | entry on the ramp's deck. */
  readonly bottomEdge: EdgeRef;
  /** opening | landing on the deck above. */
  readonly topEdge: EdgeRef;
}

export function stairsLink(level: number, x: number, z: number, rot: Rot): StairsLink {
  const f = frontOf(rot);
  const foot = { level, x, z };
  const entry = { level, x: x + f.x, z: z + f.z };
  const landing = { level: level + 1, x: x - f.x, z: z - f.z };
  return { foot, entry, landing, bottomEdge: edgeBetween(level, foot, entry), topEdge: edgeBetween(level + 1, foot, landing) };
}

/** Rotation whose front faces the given side of an edge (+1 = positive side). */
export const edgeRot = (axis: Axis, side: 1 | -1): Rot =>
  axis === 'x' ? (side > 0 ? 0 : 2) : side > 0 ? 1 : 3;

/** Axis an edge piece with this rotation runs along (the model's local X). */
export const edgeAxisOfRot = (rot: Rot): Axis => (rot % 2 === 0 ? 'x' : 'z');

/** Which side of its edge a rotation faces. */
export const sideOfRot = (rot: Rot): 1 | -1 => (rot === 0 || rot === 1 ? 1 : -1);

/** Unit front direction after rotation. */
export function frontOf(rot: Rot): XZ {
  switch (rot) {
    case 0:
      return { x: 0, z: 1 };
    case 1:
      return { x: 1, z: 0 };
    case 2:
      return { x: 0, z: -1 };
    case 3:
      return { x: -1, z: 0 };
  }
}

/** Rotates a local XZ vector by a quarter-turn count about +Y (same as Three.js rotation.y). */
export function rotateXZ(lx: number, lz: number, rot: Rot): XZ {
  // + 0 turns -0 into 0 so results compare and serialise cleanly.
  switch (rot) {
    case 0:
      return { x: lx + 0, z: lz + 0 };
    case 1:
      return { x: lz + 0, z: -lx + 0 };
    case 2:
      return { x: -lx + 0, z: -lz + 0 };
    case 3:
      return { x: -lz + 0, z: lx + 0 };
  }
}

export const rotatedSize = (w: number, d: number, rot: Rot): readonly [number, number] =>
  rot % 2 === 0 ? [w, d] : [d, w];

export const rectAround = (cx: number, cz: number, w: number, d: number): Rect => ({
  minX: cx - w / 2,
  minZ: cz - d / 2,
  maxX: cx + w / 2,
  maxZ: cz + d / 2,
});

/** Strict overlap: rectangles that only touch do not overlap. */
export const rectsOverlap = (a: Rect, b: Rect): boolean =>
  a.minX < b.maxX - EPS && b.minX < a.maxX - EPS && a.minZ < b.maxZ - EPS && b.minZ < a.maxZ - EPS;

export const rectContains = (r: Rect, x: number, z: number): boolean =>
  x >= r.minX - EPS && x <= r.maxX + EPS && z >= r.minZ - EPS && z <= r.maxZ + EPS;

/** Cells a rectangle overlaps (strictly, so a rect ending on a cell border does not reach the next cell). */
export function cellsOfRect(r: Rect): XZ[] {
  const out: XZ[] = [];
  const x0 = Math.floor((r.minX + EPS) / CELL);
  const x1 = Math.floor((r.maxX - EPS) / CELL);
  const z0 = Math.floor((r.minZ + EPS) / CELL);
  const z1 = Math.floor((r.maxZ - EPS) / CELL);
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) out.push({ x, z });
  return out;
}

export function normCellRect(a: XZ, b: XZ): CellRect {
  return {
    x0: Math.min(a.x, b.x),
    z0: Math.min(a.z, b.z),
    x1: Math.max(a.x, b.x),
    z1: Math.max(a.z, b.z),
  };
}

export function cellsOfCellRect(r: CellRect): XZ[] {
  const out: XZ[] = [];
  for (let x = r.x0; x <= r.x1; x++) for (let z = r.z0; z <= r.z1; z++) out.push({ x, z });
  return out;
}

/** Nearest grid vertex (in cell units) to a world point. */
export const vertexOf = (x: number, z: number): XZ => ({
  x: Math.round(x / CELL),
  z: Math.round(z / CELL),
});

/** Nearest edge to a world point, with the distance from the edge line in metres. */
export function nearestEdge(level: number, x: number, z: number): { edge: EdgeRef; dist: number; side: 1 | -1 } {
  const cx = Math.floor(x / CELL);
  const cz = Math.floor(z / CELL);
  const u = x / CELL - cx; // 0..1 inside the cell
  const v = z / CELL - cz;
  const candidates: { edge: EdgeRef; dist: number; side: 1 | -1 }[] = [
    { edge: { level, axis: 'x', x: cx, z: cz }, dist: v * CELL, side: 1 },
    { edge: { level, axis: 'x', x: cx, z: cz + 1 }, dist: (1 - v) * CELL, side: -1 },
    { edge: { level, axis: 'z', x: cx, z: cz }, dist: u * CELL, side: 1 },
    { edge: { level, axis: 'z', x: cx + 1, z: cz }, dist: (1 - u) * CELL, side: -1 },
  ];
  candidates.sort((a, b) => a.dist - b.dist);
  return candidates[0];
}

/** Edges of a straight run between two grid vertices (dominant axis wins). */
export function edgesOnLine(level: number, from: XZ, to: XZ): EdgeRef[] {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const out: EdgeRef[] = [];
  if (Math.abs(dx) >= Math.abs(dz)) {
    const z = from.z;
    for (let x = Math.min(from.x, to.x); x < Math.max(from.x, to.x); x++) out.push({ level, axis: 'x', x, z });
  } else {
    const x = from.x;
    for (let z = Math.min(from.z, to.z); z < Math.max(from.z, to.z); z++) out.push({ level, axis: 'z', x, z });
  }
  return out;
}

/** Rectangle (metres) covering an edge line thickened by `band` on both sides. */
export function edgeBandRect(e: EdgeRef, band: number): Rect {
  return e.axis === 'x'
    ? { minX: e.x * CELL, maxX: (e.x + 1) * CELL, minZ: e.z * CELL - band, maxZ: e.z * CELL + band }
    : { minX: e.x * CELL - band, maxX: e.x * CELL + band, minZ: e.z * CELL, maxZ: (e.z + 1) * CELL };
}

/** Perimeter edges of a cell rectangle, each with the side that faces the inside. */
export function perimeterEdges(level: number, r: CellRect): { edge: EdgeRef; inside: 1 | -1 }[] {
  const out: { edge: EdgeRef; inside: 1 | -1 }[] = [];
  for (let x = r.x0; x <= r.x1; x++) {
    out.push({ edge: { level, axis: 'x', x, z: r.z0 }, inside: 1 });
    out.push({ edge: { level, axis: 'x', x, z: r.z1 + 1 }, inside: -1 });
  }
  for (let z = r.z0; z <= r.z1; z++) {
    out.push({ edge: { level, axis: 'z', x: r.x0, z }, inside: 1 });
    out.push({ edge: { level, axis: 'z', x: r.x1 + 1, z }, inside: -1 });
  }
  return out;
}
