import { connectorOf, resolveItem } from './catalog/catalog';
import { EDGE_KINDS } from './catalog/catalog.types';
import {
  CELL,
  cellSides,
  cellsOfCellRect,
  edgeCells,
  edgeCenter,
  edgeKey,
  edgeRot,
  edgeRotTowards,
  edgesOnLine,
  frontOf,
  normCellRect,
  normRot,
  perimeterEdges,
  rectContains,
  stairsLink,
  type EdgeRef,
  type Rot,
  type XZ,
} from './grid';
import { LayoutIndex, type IndexedPiece } from './layout-index';
import { applyChange, IdAllocator, type Change, type Piece } from './layout';
import { checkPlacement } from './rules';

/**
 * Planners turn an editor gesture into a Change against the current layout, without applying it.
 * The same plan feeds the ghost preview (green = `change.add`, red = `rejected`, red tint =
 * `change.remove`) and, on release, the undoable command. Rejected pieces never enter the change,
 * so a rectangle or a line commits whatever part of it is valid.
 */
export interface Plan {
  readonly label: string;
  readonly change: Change;
  readonly rejected: readonly Piece[];
  /** First rejection reason (HUD hint). */
  readonly reason?: string;
}

export const EMPTY_PLAN: Plan = { label: '', change: { add: [], remove: [] }, rejected: [] };

class PlanBuilder {
  private readonly add: Piece[] = [];
  private readonly remove = new Map<string, Piece>();
  private readonly rejected: Piece[] = [];
  private reason?: string;
  private readonly ids: IdAllocator;

  constructor(
    private readonly index: LayoutIndex,
    private readonly label: string,
  ) {
    this.ids = new IdAllocator(index.layout.seq);
  }

  newId(): string {
    return this.ids.next();
  }

  /** Validates and queues a new piece (replacing what it displaces). */
  place(piece: Piece, ignore?: ReadonlySet<string>): boolean {
    const check = checkPlacement(this.index, piece, ignore);
    if (!check.ok) {
      this.rejected.push(piece);
      this.reason ??= check.reason;
      return false;
    }
    for (const id of check.replaces) {
      const p = this.index.layout.pieces.get(id);
      if (p) this.remove.set(id, p);
    }
    this.add.push(piece);
    return true;
  }

  drop(piece: Piece): void {
    this.remove.set(piece.id, piece);
  }

  build(): Plan {
    const change = withCascade(this.index, { add: this.add, remove: [...this.remove.values()] });
    return { label: this.label, change, rejected: this.rejected, ...(this.reason ? { reason: this.reason } : {}) };
  }
}

/** Does a piece still have what it stands or hangs on? (Collisions are not support.) */
function hasSupport(index: LayoutIndex, ip: IndexedPiece): boolean {
  const s = ip.shape;
  const level = ip.piece.level;
  if (s.kind === 'object') {
    if (s.layer === 'floor') {
      const x0 = Math.floor((s.rect.minX + 1e-6) / CELL);
      const x1 = Math.floor((s.rect.maxX - 1e-6) / CELL);
      const z0 = Math.floor((s.rect.minZ + 1e-6) / CELL);
      const z1 = Math.floor((s.rect.maxZ - 1e-6) / CELL);
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) if (!index.supportsObjects(level, x, z)) return false;
      return true;
    }
    const cx = Math.floor((s.rect.minX + s.rect.maxX) / 2 / CELL);
    const cz = Math.floor((s.rect.minZ + s.rect.maxZ) / 2 / CELL);
    return index.isFloored(level, cx, cz);
  }
  if (s.kind === 'wall-object') {
    return s.edges.every((e) => {
      const p = index.edgeAt(e);
      return !!p && p.shape.kind === 'edge' && EDGE_KINDS[p.shape.edgeKind].mountable;
    });
  }
  return true;
}

/**
 * Adds to a change every piece that loses its support because of it: furniture on a removed
 * floor, a screen on a wall replaced by a door, a lamp under a removed deck. One undo restores all.
 */
export function withCascade(index: LayoutIndex, change: Change): Change {
  if (change.remove.length === 0) return change;
  const next = new LayoutIndex(applyChange(index.layout, change));
  const added = new Set(change.add.map((p) => p.id));
  const extra: Piece[] = [];
  for (const ip of next.pieces.values()) {
    if (added.has(ip.piece.id)) continue;
    const before = index.get(ip.piece.id);
    if (before && hasSupport(index, before) && !hasSupport(next, ip)) extra.push(ip.piece);
  }
  return extra.length ? { add: change.add, remove: [...change.remove, ...extra] } : change;
}

// ── Floors & ceilings ─────────────────────────────────────────────────────

/** Paints floor (or ceiling) tiles over a cell rectangle; 2×2 tiles step by two from the start cell. */
export function planTileRect(index: LayoutIndex, level: number, from: XZ, to: XZ, variantId: string, rot: Rot): Plan {
  const item = resolveItem(variantId);
  const b = new PlanBuilder(index, 'Podłoga');
  if (!item || (item.entry.placement.kind !== 'floor' && item.entry.placement.kind !== 'ceiling')) return b.build();
  const size = item.entry.placement.size;
  const r = normCellRect(from, to);
  const nx = Math.ceil((r.x1 - r.x0 + 1) / size);
  const nz = Math.ceil((r.z1 - r.z0 + 1) / size);
  // Blocks are laid from the cell where the drag began.
  const stepX = from.x <= to.x ? size : -size;
  const stepZ = from.z <= to.z ? size : -size;
  const x0 = from.x <= to.x ? r.x0 : r.x1 - (size - 1);
  const z0 = from.z <= to.z ? r.z0 : r.z1 - (size - 1);
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < nz; j++) {
      const cx = x0 + i * stepX;
      const cz = z0 + j * stepZ;
      const x = (cx + size / 2) * CELL;
      const z = (cz + size / 2) * CELL;
      const existing = item.entry.placement.kind === 'floor' ? index.floorAt(level, cx, cz) : index.ceilingAt(level, cx, cz);
      if (existing && existing.piece.item === variantId && existing.piece.x === x && existing.piece.z === z && existing.piece.rot === rot) continue;
      b.place({ id: b.newId(), item: variantId, level, x, z, rot });
    }
  }
  return b.build();
}

/** Removes every floor tile touching the rectangle (and what stood on it). */
export function planFloorErase(index: LayoutIndex, level: number, from: XZ, to: XZ, ceilings = false): Plan {
  const b = new PlanBuilder(index, ceilings ? 'Usuń sufit' : 'Usuń podłogę');
  const seen = new Set<string>();
  for (const c of cellsOfCellRect(normCellRect(from, to))) {
    const p = ceilings ? index.ceilingAt(level, c.x, c.z) : index.floorAt(level, c.x, c.z);
    if (p && !seen.has(p.piece.id)) {
      seen.add(p.piece.id);
      b.drop(p.piece);
    }
  }
  return b.build();
}

// ── Rooms ─────────────────────────────────────────────────────────────────

/** Sims-style room tool: floor where there is none + walls facing inwards on free perimeter edges. */
export function planRoom(index: LayoutIndex, level: number, from: XZ, to: XZ, floorVariant: string, wallVariant: string): Plan {
  const b = new PlanBuilder(index, 'Pomieszczenie');
  const r = normCellRect(from, to);
  for (const c of cellsOfCellRect(r)) {
    if (index.floorAt(level, c.x, c.z)) continue;
    const center = { x: (c.x + 0.5) * CELL, z: (c.z + 0.5) * CELL };
    b.place({ id: b.newId(), item: floorVariant, level, x: center.x, z: center.z, rot: 0 });
  }
  for (const { edge, inside } of perimeterEdges(level, r)) {
    if (index.edgeAt(edge)) continue;
    const c = edgeCenter(edge);
    b.place({ id: b.newId(), item: wallVariant, level, x: c.x, z: c.z, rot: edgeRot(edge.axis, inside) });
  }
  return b.build();
}

// ── Between decks ─────────────────────────────────────────────────────────

const cellPiece = (level: number, c: XZ, item: string, rot: Rot, id: string): Piece => ({
  id,
  item,
  level,
  x: (c.x + 0.5) * CELL,
  z: (c.z + 0.5) * CELL,
  rot,
});

/**
 * Stairs in one cell: the ramp, an opening in the deck above (its floor tile and the ceiling
 * under it go) and railings round the opening wherever the upper deck has floor — except the
 * side the stairs arrive on.
 */
export function planStairs(index: LayoutIndex, level: number, cell: XZ, rot: Rot, variantId: string, railingVariant = 'railing/std'): Plan {
  const b = new PlanBuilder(index, 'Schody');
  const item = resolveItem(variantId);
  if (!item || connectorOf(item) !== 'stairs') return b.build();
  const existing = index.floorAt(level, cell.x, cell.z)?.piece;
  if (existing?.item === variantId && existing.rot === rot) return b.build();
  if (!b.place(cellPiece(level, cell, variantId, rot, b.newId()))) return b.build();
  const up = level + 1;
  const above = index.floorAt(up, cell.x, cell.z);
  if (above) b.drop(above.piece);
  const ceiling = index.ceilingAt(level, cell.x, cell.z);
  if (ceiling) b.drop(ceiling.piece);
  const top = edgeKey(stairsLink(level, cell.x, cell.z, rot).topEdge);
  for (const { edge, neighbor } of cellSides(up, cell.x, cell.z)) {
    if (edgeKey(edge) === top || index.edgeAt(edge) || !index.isFloored(up, neighbor.x, neighbor.z)) continue;
    const c = edgeCenter(edge);
    b.place({ id: b.newId(), item: railingVariant, level: up, x: c.x, z: c.z, rot: edgeRotTowards(edge, neighbor) });
  }
  return b.build();
}

/**
 * Lift stops in one cell on the given decks. The platform replaces the floor; its front gets a
 * door (an existing door stays), the other sides glass where nothing stands yet, so a stop is a
 * small room of its own. Stops on adjacent decks make one shaft.
 */
export function planLift(
  index: LayoutIndex,
  levels: readonly number[],
  cell: XZ,
  rot: Rot,
  variantId: string,
  glassVariant = 'glass/clear',
  doorVariant = 'door/grey',
): Plan {
  const b = new PlanBuilder(index, levels.length > 1 ? 'Szyb windy' : 'Winda');
  const item = resolveItem(variantId);
  if (!item || connectorOf(item) !== 'lift') return b.build();
  const f = frontOf(rot);
  for (const level of levels) {
    const existing = index.floorAt(level, cell.x, cell.z)?.piece;
    if (existing?.item === variantId && existing.rot === rot) continue;
    if (!b.place(cellPiece(level, cell, variantId, rot, b.newId()))) continue;
    for (const { edge, neighbor } of cellSides(level, cell.x, cell.z)) {
      const front = neighbor.x === cell.x + f.x && neighbor.z === cell.z + f.z;
      const current = index.edgeAt(edge);
      const c = edgeCenter(edge);
      if (front) {
        if (current?.shape.kind === 'edge' && current.shape.edgeKind === 'door') continue;
        b.place({ id: b.newId(), item: doorVariant, level, x: c.x, z: c.z, rot: edgeRotTowards(edge, neighbor) });
      } else if (!current) {
        b.place({ id: b.newId(), item: glassVariant, level, x: c.x, z: c.z, rot: edgeRotTowards(edge, cell) });
      }
    }
  }
  return b.build();
}

// ── Edges ─────────────────────────────────────────────────────────────────

/**
 * Places an edge item along a straight run between two grid vertices. Facing: towards the only
 * floored side if exactly one side has floor, otherwise towards `preferSide`.
 */
export function planEdgeLine(index: LayoutIndex, level: number, from: XZ, to: XZ, variantId: string, preferSide: 1 | -1): Plan {
  const item = resolveItem(variantId);
  const b = new PlanBuilder(index, item?.entry.label ?? 'Ściana');
  if (!item || item.entry.placement.kind !== 'edge') return b.build();
  const span = item.entry.placement.span;
  let edges = edgesOnLine(level, from, to);
  if (edges.length === 0) return b.build();
  // Walk from the start vertex so 8 m pieces line up with where the drag began.
  const reversed = edges[0].axis === 'x' ? to.x < from.x : to.z < from.z;
  if (reversed) edges = [...edges].reverse();
  for (let i = 0; i < edges.length; i += span) {
    const run: EdgeRef[] = [];
    for (let k = 0; k < span; k++) {
      const base = edges[i];
      const step = reversed ? -k : k;
      run.push(base.axis === 'x' ? { ...base, x: base.x + step } : { ...base, z: base.z + step });
    }
    const first = run.reduce((a, e) => (e.axis === 'x' ? (e.x < a.x ? e : a) : e.z < a.z ? e : a));
    const side = facingFor(index, run, preferSide);
    const axis = first.axis;
    const c0 = edgeCenter(first);
    const half = ((span - 1) * CELL) / 2;
    const x = axis === 'x' ? c0.x + half : c0.x;
    const z = axis === 'z' ? c0.z + half : c0.z;
    const rot = edgeRot(axis, side);
    const existing = index.edgeAt(first);
    if (existing && existing.piece.item === variantId && existing.piece.x === x && existing.piece.z === z && existing.piece.rot === rot) continue;
    b.place({ id: b.newId(), item: variantId, level, x, z, rot });
  }
  return b.build();
}

function facingFor(index: LayoutIndex, run: readonly EdgeRef[], preferSide: 1 | -1): 1 | -1 {
  let neg = 0;
  let pos = 0;
  for (const e of run) {
    const [a, c] = edgeCells(e);
    if (index.isFloored(e.level, a.x, a.z)) neg++;
    if (index.isFloored(e.level, c.x, c.z)) pos++;
  }
  if (pos > 0 && neg === 0) return 1;
  if (neg > 0 && pos === 0) return -1;
  return preferSide;
}

/** Removes edge elements along a straight run. */
export function planEdgeErase(index: LayoutIndex, level: number, from: XZ, to: XZ): Plan {
  const b = new PlanBuilder(index, 'Usuń ściany');
  const seen = new Set<string>();
  for (const e of edgesOnLine(level, from, to)) {
    const p = index.edgeAt(e);
    if (p && !seen.has(p.piece.id)) {
      seen.add(p.piece.id);
      b.drop(p.piece);
    }
  }
  return b.build();
}

// ── Objects & selection ───────────────────────────────────────────────────

/** One piece of any kind at an exact position. */
export function planPlace(index: LayoutIndex, piece: Omit<Piece, 'id'>): Plan {
  const item = resolveItem(piece.item);
  const b = new PlanBuilder(index, item?.entry.label ?? 'Obiekt');
  b.place({ ...piece, id: b.newId() });
  return b.build();
}

export function planRemove(index: LayoutIndex, ids: Iterable<string>, label = 'Usuń'): Plan {
  const b = new PlanBuilder(index, label);
  for (const id of ids) {
    const p = index.layout.pieces.get(id);
    if (p) b.drop(p);
  }
  return b.build();
}

/** Moves and/or rotates pieces as one group; checked against everything except the group. */
export function planTransform(
  index: LayoutIndex,
  ids: readonly string[],
  update: (p: Piece) => Piece,
  label: string,
): Plan {
  const b = new PlanBuilder(index, label);
  const group = new Set(ids);
  for (const id of ids) {
    const p = index.layout.pieces.get(id);
    if (!p) continue;
    if (b.place(update(p), group)) b.drop(p);
  }
  return b.build();
}

/** Rotation step for a piece kind: edges flip sides, everything else turns 90°. */
export function rotateStep(piece: Piece): Piece {
  const item = resolveItem(piece.item);
  const step = item?.entry.placement.kind === 'edge' ? 2 : 1;
  return { ...piece, rot: normRot(piece.rot + step) };
}

/** Erase-rectangle: every piece of the level whose origin lies in the cell rectangle. */
export function planEraseRect(index: LayoutIndex, level: number, from: XZ, to: XZ): Plan {
  const r = normCellRect(from, to);
  const rect = { minX: r.x0 * CELL, minZ: r.z0 * CELL, maxX: (r.x1 + 1) * CELL, maxZ: (r.z1 + 1) * CELL };
  const ids: string[] = [];
  for (const ip of index.pieces.values()) {
    if (ip.piece.level === level && rectContains(rect, ip.piece.x, ip.piece.z)) ids.push(ip.piece.id);
  }
  return planRemove(index, ids, 'Usuń obszar');
}
