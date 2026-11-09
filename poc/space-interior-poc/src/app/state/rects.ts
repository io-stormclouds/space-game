import { CELL, cellKey, cellSides, edgeBandRect, type CellRect, type Rect } from '../domain/grid';
import type { IndexedPiece } from '../domain/layout-index';
import type { Room } from '../domain/rooms';
import type { Issue } from '../domain/validation';

/** Deck rectangles that outline a piece for hover / selection marks. */
export function pieceRects(ip: IndexedPiece): Rect[] {
  const s = ip.shape;
  switch (s.kind) {
    case 'floor':
    case 'ceiling':
      return s.cells.map((c) => ({ minX: c.x * CELL, minZ: c.z * CELL, maxX: (c.x + 1) * CELL, maxZ: (c.z + 1) * CELL }));
    case 'edge':
      return [merge(s.edges.map((e) => edgeBandRect(e, 0.42)))];
    case 'object':
      return [s.rect];
    case 'wall-object': {
      const line = s.line * CELL;
      const a = line + s.side * 0.3;
      const b = line + s.side * 1.0;
      return s.axis === 'x'
        ? [{ minX: s.from, maxX: s.to, minZ: Math.min(a, b), maxZ: Math.max(a, b) }]
        : [{ minX: Math.min(a, b), maxX: Math.max(a, b), minZ: s.from, maxZ: s.to }];
    }
  }
}

function merge(rects: Rect[]): Rect {
  return rects.reduce((a, r) => ({
    minX: Math.min(a.minX, r.minX),
    minZ: Math.min(a.minZ, r.minZ),
    maxX: Math.max(a.maxX, r.maxX),
    maxZ: Math.max(a.maxZ, r.maxZ),
  }));
}

/** Boundary strips of a room (cell sides facing out of it). */
export function roomOutline(room: Room, t = 0.09): Rect[] {
  const inRoom = new Set(room.cells.map((c) => cellKey(room.level, c.x, c.z)));
  const out: Rect[] = [];
  for (const c of room.cells) {
    for (const { edge, neighbor } of cellSides(room.level, c.x, c.z)) {
      if (!inRoom.has(cellKey(room.level, neighbor.x, neighbor.z))) out.push(edgeBandRect(edge, t));
    }
  }
  return out;
}

export function cellRectToRect(r: CellRect): Rect {
  return { minX: r.x0 * CELL, minZ: r.z0 * CELL, maxX: (r.x1 + 1) * CELL, maxZ: (r.z1 + 1) * CELL };
}

/** Issue markers on one deck: edges as strips, pieces as their footprint. */
export function issueRects(issues: readonly Issue[], level: number, pieceOf: (id: string) => IndexedPiece | undefined) {
  const errors: Rect[] = [];
  const warnings: Rect[] = [];
  for (const i of issues) {
    if (i.level !== level || i.severity === 'info') continue;
    const into = i.severity === 'error' ? errors : warnings;
    for (const e of i.edges) into.push(edgeBandRect(e, 0.16));
    if (i.edges.length === 0) {
      for (const id of i.pieces) {
        const ip = pieceOf(id);
        if (ip) into.push(...pieceRects(ip).map((r) => ({ ...r })));
      }
    }
  }
  return { errors, warnings };
}
