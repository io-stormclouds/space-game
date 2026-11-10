import type { Rot } from './grid';

/**
 * The whole design is a flat set of pieces. A piece is ONE placed catalog variant:
 * a floor tile, a wall, a door, a bed, a lamp… Its meaning (what it occupies, how it snaps)
 * comes from the catalog, so the document stays small, uniform and easy to diff, undo,
 * serialise and send to a server.
 *
 * (x, z) is the piece origin on its deck, in metres:
 * - floor / ceiling: centre of the covered cell block,
 * - edge (wall, door, glass, railing): centre of the covered edge run,
 * - floor / surface / ceiling object: centre of its footprint,
 * - wall object: point on the wall's centre line; `rot` is the side it faces.
 */
export interface Piece {
  readonly id: string;
  /** Catalog variant id, e.g. "wall/blue". */
  readonly item: string;
  readonly level: number;
  readonly x: number;
  readonly z: number;
  readonly rot: Rot;
}

export interface Layout {
  readonly name: string;
  readonly pieces: ReadonlyMap<string, Piece>;
  /** Last allocated piece number (ids are "p<n>"); only ever grows. */
  readonly seq: number;
}

/** An edit: pieces removed (full copies, for undo) and pieces added. Same id in both = update. */
export interface Change {
  readonly add: readonly Piece[];
  readonly remove: readonly Piece[];
}

export const EMPTY_CHANGE: Change = { add: [], remove: [] };

export function createLayout(name = 'Nowy projekt'): Layout {
  return { name, pieces: new Map(), seq: 0 };
}

export const isEmptyChange = (c: Change): boolean => c.add.length === 0 && c.remove.length === 0;

export const invertChange = (c: Change): Change => ({ add: c.remove, remove: c.add });

const idNumber = (id: string): number => {
  const n = Number(id.slice(1));
  return Number.isFinite(n) ? n : 0;
};

export function applyChange(layout: Layout, change: Change): Layout {
  if (isEmptyChange(change)) return layout;
  const pieces = new Map(layout.pieces);
  for (const p of change.remove) pieces.delete(p.id);
  let seq = layout.seq;
  for (const p of change.add) {
    pieces.set(p.id, p);
    seq = Math.max(seq, idNumber(p.id));
  }
  return { ...layout, pieces, seq };
}

/** Allocates fresh piece ids for one plan. */
export class IdAllocator {
  private n: number;
  constructor(seq: number) {
    this.n = seq;
  }
  next(): string {
    this.n += 1;
    return `p${this.n}`;
  }
}

/** Merges changes in order into one (later edits win; add-then-remove cancels out). */
export function mergeChanges(...changes: Change[]): Change {
  const before = new Map<string, Piece | null>(); // state before the whole sequence (null = absent)
  const after = new Map<string, Piece | null>();
  for (const c of changes) {
    for (const p of c.remove) {
      if (!before.has(p.id)) before.set(p.id, p);
      after.set(p.id, null);
    }
    for (const p of c.add) {
      if (!before.has(p.id)) before.set(p.id, null);
      after.set(p.id, p);
    }
  }
  const add: Piece[] = [];
  const remove: Piece[] = [];
  for (const [id, b] of before) {
    const a = after.get(id) ?? null;
    if (b && a && samePiece(a, b)) continue;
    if (b) remove.push(b);
    if (a) add.push(a);
  }
  return { add, remove };
}

export const samePiece = (a: Piece, b: Piece): boolean =>
  a.id === b.id && a.item === b.item && a.level === b.level && a.x === b.x && a.z === b.z && a.rot === b.rot;
