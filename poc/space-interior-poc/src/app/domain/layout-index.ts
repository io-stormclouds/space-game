import { resolveItem, type ResolvedItem } from './catalog/catalog';
import { EDGE_KINDS } from './catalog/catalog.types';
import { CELL, cellKey, cellOf, edgeKey, rectContains, stairsLink, type Axis, type EdgeRef, type Rect, type StairsLink } from './grid';
import type { Layout, Piece } from './layout';
import { shapeOf, transformOf, wallFaceOf, type PieceShape, type PieceTransform, type TransformContext } from './placement';

export interface IndexedPiece {
  readonly piece: Piece;
  readonly item: ResolvedItem;
  readonly shape: PieceShape;
}

/**
 * Derived occupancy of a layout: which piece holds each cell, edge and footprint.
 * Rebuilt from scratch after every edit (O(pieces)); every rule, room and issue query reads it.
 */
export class LayoutIndex implements TransformContext {
  readonly pieces = new Map<string, IndexedPiece>();
  /** Pieces whose catalog item is unknown (old file, removed model). */
  readonly unknown: Piece[] = [];
  /** cellKey → floor piece id. */
  readonly floors = new Map<string, string>();
  /** cellKey → ceiling piece id. */
  readonly ceilings = new Map<string, string>();
  /** edgeKey → edge piece id. */
  readonly edges = new Map<string, string>();
  /** cellKeys of the level ABOVE a deck block: walkable without a floor piece. */
  readonly raised = new Set<string>();
  /** Stairs (ramps) with the cells they join. */
  readonly stairs: { readonly id: string; readonly link: StairsLink }[] = [];
  /** edgeKeys where stairs arrive on the deck above (open on purpose: not a drop). */
  readonly stairTops = new Set<string>();
  /** cellKeys of the openings above stairs (deck above the ramp). */
  readonly openings = new Set<string>();
  /** cellKey → lift stop piece id. */
  readonly lifts = new Map<string, string>();
  /** Objects by level and layer. */
  private readonly objects = new Map<string, IndexedPiece[]>();
  readonly levels = new Set<number>();

  constructor(readonly layout: Layout) {
    for (const piece of layout.pieces.values()) {
      const item = resolveItem(piece.item);
      if (!item) {
        this.unknown.push(piece);
        continue;
      }
      const shape = shapeOf(piece, item);
      const ip: IndexedPiece = { piece, item, shape };
      this.pieces.set(piece.id, ip);
      this.levels.add(piece.level);
      switch (shape.kind) {
        case 'floor':
          for (const c of shape.cells) {
            this.floors.set(cellKey(piece.level, c.x, c.z), piece.id);
            if (shape.raisesDeck) this.raised.add(cellKey(piece.level + 1, c.x, c.z));
          }
          if (shape.connector === 'stairs') {
            const c = shape.cells[0];
            const link = stairsLink(piece.level, c.x, c.z, piece.rot);
            this.stairs.push({ id: piece.id, link });
            this.stairTops.add(edgeKey(link.topEdge));
            this.openings.add(cellKey(piece.level + 1, c.x, c.z));
          } else if (shape.connector === 'lift') {
            for (const c of shape.cells) this.lifts.set(cellKey(piece.level, c.x, c.z), piece.id);
          }
          break;
        case 'ceiling':
          for (const c of shape.cells) this.ceilings.set(cellKey(piece.level, c.x, c.z), piece.id);
          break;
        case 'edge':
          for (const e of shape.edges) this.edges.set(edgeKey(e), piece.id);
          break;
        case 'object':
          this.objectList(piece.level, shape.layer).push(ip);
          break;
        case 'wall-object':
          this.objectList(piece.level, 'wall').push(ip);
          break;
      }
    }
  }

  private objectList(level: number, layer: string): IndexedPiece[] {
    const key = `${level}|${layer}`;
    let list = this.objects.get(key);
    if (!list) {
      list = [];
      this.objects.set(key, list);
    }
    return list;
  }

  objectsOn(level: number, layer: 'floor' | 'surface' | 'ceiling' | 'wall'): readonly IndexedPiece[] {
    return this.objects.get(`${level}|${layer}`) ?? [];
  }

  get(id: string): IndexedPiece | undefined {
    return this.pieces.get(id);
  }

  floorAt(level: number, x: number, z: number): IndexedPiece | undefined {
    const id = this.floors.get(cellKey(level, x, z));
    return id ? this.pieces.get(id) : undefined;
  }

  edgeAt(e: EdgeRef): IndexedPiece | undefined {
    const id = this.edges.get(edgeKey(e));
    return id ? this.pieces.get(id) : undefined;
  }

  ceilingAt(level: number, x: number, z: number): IndexedPiece | undefined {
    const id = this.ceilings.get(cellKey(level, x, z));
    return id ? this.pieces.get(id) : undefined;
  }

  /** A deck block: solid volume at its own level. */
  isSolid(level: number, x: number, z: number): boolean {
    const f = this.floorAt(level, x, z);
    return !!f && f.shape.kind === 'floor' && f.shape.raisesDeck;
  }

  /** Crew can stand here: a floor piece (not a deck block) or the top of a deck block below. */
  isFloored(level: number, x: number, z: number): boolean {
    if (this.raised.has(cellKey(level, x, z))) return true;
    const f = this.floorAt(level, x, z);
    return !!f && !(f.shape.kind === 'floor' && f.shape.raisesDeck);
  }

  /** Objects may stand here (not on ramps, catwalks or inside deck blocks). */
  supportsObjects(level: number, x: number, z: number): boolean {
    const f = this.floorAt(level, x, z);
    if (f && f.shape.kind === 'floor' && !f.shape.noObjects) return true;
    return this.raised.has(cellKey(level, x, z)) && !f;
  }

  edgeKindAt(e: EdgeRef) {
    const p = this.edgeAt(e);
    return p && p.shape.kind === 'edge' ? p.shape.edgeKind : undefined;
  }

  isAirtight(e: EdgeRef): boolean {
    const k = this.edgeKindAt(e);
    return !!k && EDGE_KINDS[k].airtight;
  }

  isBoundary(e: EdgeRef): boolean {
    const k = this.edgeKindAt(e);
    return !!k && EDGE_KINDS[k].boundary;
  }

  /** Crew can cross this edge: nothing on it, or a door. */
  isPassable(e: EdgeRef): boolean {
    const k = this.edgeKindAt(e);
    return !k || EDGE_KINDS[k].passable;
  }

  liftAt(level: number, x: number, z: number): IndexedPiece | undefined {
    const id = this.lifts.get(cellKey(level, x, z));
    return id ? this.pieces.get(id) : undefined;
  }

  /** Decks a lift stop's shaft serves: the unbroken run of stops in its cell. */
  liftShaft(level: number, x: number, z: number): number[] {
    if (!this.lifts.has(cellKey(level, x, z))) return [];
    let lo = level;
    let hi = level;
    while (this.lifts.has(cellKey(lo - 1, x, z))) lo--;
    while (this.lifts.has(cellKey(hi + 1, x, z))) hi++;
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  }

  /** Edge pieces whose clearance band overlaps a rectangle. */
  edgesNear(level: number, r: Rect): IndexedPiece[] {
    const out = new Set<IndexedPiece>();
    const x0 = Math.floor(r.minX / CELL) - 1;
    const x1 = Math.floor(r.maxX / CELL) + 1;
    const z0 = Math.floor(r.minZ / CELL) - 1;
    const z1 = Math.floor(r.maxZ / CELL) + 1;
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        for (const axis of ['x', 'z'] as const) {
          const p = this.edgeAt({ level, axis, x, z });
          if (p) out.add(p);
        }
      }
    }
    return [...out];
  }

  // ── TransformContext ──────────────────────────────────────────────────
  surfaceHeightAt(level: number, x: number, z: number, exceptId?: string): number {
    let h = 0;
    for (const o of this.objectsOn(level, 'floor')) {
      if (o.piece.id === exceptId || o.shape.kind !== 'object') continue;
      const p = o.item.entry.placement;
      if (p.kind === 'object' && p.surfaceHeight && rectContains(o.shape.rect, x, z)) h = Math.max(h, p.surfaceHeight);
    }
    return h;
  }

  wallFaceAt(level: number, axis: Axis, line: number, along: number): number | undefined {
    const i = Math.floor(along / CELL);
    const candidates = [i, Math.abs(along / CELL - Math.round(along / CELL)) < 1e-6 ? i - 1 : i];
    for (const k of candidates) {
      const e: EdgeRef = axis === 'x' ? { level, axis, x: k, z: line } : { level, axis, x: line, z: k };
      const p = this.edgeAt(e);
      if (p) return wallFaceOf(p.item);
    }
    return undefined;
  }

  transform(id: string): PieceTransform | undefined {
    const ip = this.pieces.get(id);
    return ip ? transformOf(ip.piece, ip.item, this) : undefined;
  }

  /** Cell under a world point. */
  static cellAt(x: number, z: number) {
    return cellOf(x, z);
  }
}
