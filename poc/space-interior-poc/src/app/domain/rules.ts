import { EDGE_KINDS } from './catalog/catalog.types';
import { cellsOfRect, edgeBandRect, edgeKey, rectsOverlap, type XZ } from './grid';
import type { IndexedPiece, LayoutIndex } from './layout-index';
import type { Piece } from './layout';
import { shapeOf } from './placement';
import { resolveItem } from './catalog/catalog';

export interface PlacementCheck {
  readonly ok: boolean;
  /** Why not (Polish, shown in the HUD). */
  readonly reason?: string;
  /** Pieces this one would replace (same floor cell, same edge…). Valid placement. */
  readonly replaces: readonly string[];
}

const ok = (replaces: string[] = []): PlacementCheck => ({ ok: true, replaces });
const no = (reason: string): PlacementCheck => ({ ok: false, reason, replaces: [] });

/**
 * The only place placement rules live.
 * - floor / ceiling / edge pieces replace whatever holds their cells or edges,
 * - floor objects need floor under the whole footprint, keep the clearance band of edge
 *   elements free (so they never sink into a wall or block a door) and may not overlap,
 * - wall objects need a mountable wall over their whole width and may not overlap on the same face,
 * - surface items only need floor; on a table they stand on its top,
 * - ceiling items need floor below and may not overlap each other.
 * `ignore` lets a moved piece be checked against everything but itself.
 */
export function checkPlacement(index: LayoutIndex, piece: Piece, ignore: ReadonlySet<string> = new Set()): PlacementCheck {
  const item = resolveItem(piece.item);
  if (!item) return no('Nieznany element katalogu');
  if (piece.level < 0) return no('Poniżej najniższego pokładu');
  const shape = shapeOf(piece, item);
  const level = piece.level;
  const skip = (id: string | undefined) => !id || ignore.has(id) || id === piece.id;

  switch (shape.kind) {
    case 'floor': {
      const replaces = new Set<string>();
      for (const c of shape.cells) {
        const f = index.floorAt(level, c.x, c.z);
        if (f && !skip(f.piece.id)) replaces.add(f.piece.id);
      }
      if (shape.noObjects) {
        const blocked = objectsInCells(index, level, shape.cells).find((o) => !skip(o.piece.id));
        if (blocked) return no(`Zajęte przez: ${blocked.item.entry.label}`);
      }
      return ok([...replaces]);
    }
    case 'ceiling': {
      const replaces = new Set<string>();
      for (const c of shape.cells) {
        const f = index.ceilingAt(level, c.x, c.z);
        if (f && !skip(f.piece.id)) replaces.add(f.piece.id);
      }
      return ok([...replaces]);
    }
    case 'edge': {
      const replaces = new Set<string>();
      for (const e of shape.edges) {
        const p = index.edgeAt(e);
        if (p && !skip(p.piece.id)) replaces.add(p.piece.id);
        const band = edgeBandRect(e, shape.band);
        for (const o of index.objectsOn(level, 'floor')) {
          if (skip(o.piece.id) || o.shape.kind !== 'object') continue;
          if (rectsOverlap(band, o.shape.rect)) return no(`Blokuje: ${o.item.entry.label}`);
        }
      }
      return ok([...replaces]);
    }
    case 'object': {
      if (shape.layer === 'surface' || shape.layer === 'ceiling') {
        const cx = (shape.rect.minX + shape.rect.maxX) / 2;
        const cz = (shape.rect.minZ + shape.rect.maxZ) / 2;
        const cell = { x: Math.floor(cx / 4), z: Math.floor(cz / 4) };
        if (!index.isFloored(level, cell.x, cell.z)) return no('Poza podłogą');
        if (shape.layer === 'ceiling') {
          for (const o of index.objectsOn(level, 'ceiling')) {
            if (skip(o.piece.id) || o.shape.kind !== 'object') continue;
            if (rectsOverlap(o.shape.rect, shape.rect)) return no(`Koliduje z: ${o.item.entry.label}`);
          }
        }
        return ok();
      }
      // floor layer
      for (const c of cellsOfRect(shape.rect)) {
        if (!index.supportsObjects(level, c.x, c.z)) {
          return index.isFloored(level, c.x, c.z) ? no('Tu nie można stawiać obiektów') : no('Poza podłogą');
        }
      }
      for (const e of index.edgesNear(level, shape.rect)) {
        if (skip(e.piece.id) || e.shape.kind !== 'edge') continue;
        const band = e.shape.band;
        for (const ref of e.shape.edges) {
          if (rectsOverlap(edgeBandRect(ref, band), shape.rect)) {
            return no(e.shape.edgeKind === 'door' ? 'Blokuje przejście drzwi' : `Za blisko: ${e.item.entry.label.toLowerCase()}`);
          }
        }
      }
      for (const o of index.objectsOn(level, 'floor')) {
        if (skip(o.piece.id) || o.shape.kind !== 'object') continue;
        if (rectsOverlap(o.shape.rect, shape.rect)) return no(`Koliduje z: ${o.item.entry.label}`);
      }
      return ok();
    }
    case 'wall-object': {
      for (const e of shape.edges) {
        const p = index.edgeAt(e);
        if (!p || p.shape.kind !== 'edge') return no('Wymaga ściany');
        if (!EDGE_KINDS[p.shape.edgeKind].mountable) return no(`Nie da się zawiesić na: ${p.item.entry.label.toLowerCase()}`);
      }
      for (const o of index.objectsOn(level, 'wall')) {
        if (skip(o.piece.id) || o.shape.kind !== 'wall-object') continue;
        if (o.shape.axis !== shape.axis || o.shape.line !== shape.line || o.shape.side !== shape.side) continue;
        if (o.shape.from < shape.to - 1e-6 && shape.from < o.shape.to - 1e-6) return no(`Koliduje z: ${o.item.entry.label}`);
      }
      return ok();
    }
  }
}

/** Floor, surface and ceiling objects whose centre lies in the given cells. */
export function objectsInCells(index: LayoutIndex, level: number, cells: readonly XZ[]): IndexedPiece[] {
  const set = new Set(cells.map((c) => `${c.x}|${c.z}`));
  const out: IndexedPiece[] = [];
  for (const layer of ['floor', 'surface', 'ceiling'] as const) {
    for (const o of index.objectsOn(level, layer)) {
      if (o.shape.kind !== 'object') continue;
      const cx = (o.shape.rect.minX + o.shape.rect.maxX) / 2;
      const cz = (o.shape.rect.minZ + o.shape.rect.maxZ) / 2;
      if (set.has(`${Math.floor(cx / 4)}|${Math.floor(cz / 4)}`)) out.push(o);
    }
  }
  return out;
}

/** Wall objects hanging on any of the given edges. */
export function wallObjectsOn(index: LayoutIndex, edgeKeys: ReadonlySet<string>): IndexedPiece[] {
  const out: IndexedPiece[] = [];
  for (const level of index.levels) {
    for (const o of index.objectsOn(level, 'wall')) {
      if (o.shape.kind === 'wall-object' && o.shape.edges.some((e) => edgeKeys.has(edgeKey(e)))) out.push(o);
    }
  }
  return out;
}
