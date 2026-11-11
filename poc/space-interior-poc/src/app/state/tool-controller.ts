import { connectorOf, resolveItem } from '../domain/catalog/catalog';
import {
  CELL,
  SNAP,
  cellOf,
  edgeRot,
  frontOf,
  nearestEdge,
  normCellRect,
  rotatedSize,
  snap,
  vertexOf,
  type Rect,
  type XZ,
} from '../domain/grid';
import type { Piece } from '../domain/layout';
import {
  planEdgeErase,
  planEdgeLine,
  planEraseRect,
  planFloorErase,
  planLift,
  planPlace,
  planStairs,
  planRemove,
  planRoom,
  planTileRect,
  planTransform,
  type Plan,
} from '../domain/planners';
import { footprintOf } from '../domain/placement';
import type { EditorEngine } from '../engine/editor-engine';
import type { EditorStore } from './editor-store';
import { cellRectToRect, pieceRects } from './rects';

export interface PointerInput {
  readonly clientX: number;
  readonly clientY: number;
  readonly button: number;
  readonly shift: boolean;
  readonly ctrl: boolean;
}

interface Drag {
  readonly button: number;
  readonly startClient: XZ;
  readonly start: XZ;
  moved: boolean;
  /** Select tool: pieces being moved. */
  readonly moving?: readonly string[];
}

const CLICK_PX = 5;

/**
 * Turns pointer gestures on the viewport into domain plans. Hover and drag produce a plan that is
 * only previewed (ghost); release commits it as one undoable command. Holds only gesture state.
 */
export class ToolController {
  private drag: Drag | null = null;
  private lastGround: XZ | null = null;

  constructor(
    private readonly store: EditorStore,
    private readonly engine: EditorEngine,
  ) {}

  private get level(): number {
    return this.store.level();
  }

  down(e: PointerInput): void {
    const ground = this.engine.pickGround(e.clientX, e.clientY);
    if (!ground) return;
    if (e.button === 2) {
      this.drag = { button: 2, startClient: { x: e.clientX, z: e.clientY }, start: ground, moved: false };
      return;
    }
    if (e.button !== 0) return;
    const tool = this.store.tool();
    let moving: string[] | undefined;
    if (tool === 'select') {
      const hit = this.engine.pickPiece(e.clientX, e.clientY, (id) => this.pickable(id));
      const sel = this.store.selection();
      if (hit && this.movable(hit)) moving = sel.includes(hit) ? sel.filter((id) => this.movable(id)) : [hit];
    }
    this.drag = { button: 0, startClient: { x: e.clientX, z: e.clientY }, start: ground, moved: false, ...(moving ? { moving } : {}) };
    this.preview(e, ground);
  }

  move(e: PointerInput): void {
    const ground = this.engine.pickGround(e.clientX, e.clientY);
    if (!ground) return;
    this.lastGround = ground;
    this.store.cursor.set({ x: ground.x, z: ground.z });
    if (this.drag && !this.drag.moved && Math.hypot(e.clientX - this.drag.startClient.x, e.clientY - this.drag.startClient.z) > CLICK_PX) {
      this.drag.moved = true;
    }
    if (this.drag?.button === 2) return; // camera pan
    this.preview(e, ground);
  }

  up(e: PointerInput): void {
    const drag = this.drag;
    this.drag = null;
    if (!drag) return;
    if (drag.button === 2) {
      if (!drag.moved) this.cancel();
      return;
    }
    const ground = this.engine.pickGround(e.clientX, e.clientY) ?? drag.start;
    const tool = this.store.tool();
    if (tool === 'select') {
      if (drag.moving && drag.moved) this.store.commit(this.store.plan());
      else this.click(e);
      this.store.plan.set(null);
    } else if (tool === 'eyedropper') {
      const hit = this.engine.pickPiece(e.clientX, e.clientY);
      const item = hit ? this.store.index().get(hit)?.piece.item : undefined;
      if (item) this.store.selectItem(item);
    } else {
      this.store.commit(this.store.plan());
    }
    this.engine.setFill([]);
    this.preview(e, ground);
  }

  leave(): void {
    if (this.drag) return;
    this.store.plan.set(null);
    this.store.hoverId.set(null);
    this.store.cursor.set(null);
    this.engine.setHover([]);
    this.engine.setFill([]);
    this.engine.overlay.setSubgrid(null);
  }

  /** RMB click / Escape: drop the gesture, then the tool. */
  cancel(): void {
    if (this.drag) {
      this.drag = null;
      this.store.plan.set(null);
      this.engine.setFill([]);
      return;
    }
    if (this.store.tool() !== 'select') this.store.setTool('select');
    else {
      this.store.selection.set([]);
      this.store.selectedRoomId.set(null);
    }
    this.engine.setFill([]);
    this.engine.overlay.setSubgrid(null);
  }

  /** Re-evaluates the preview at the last cursor position (after R, tool or item change). */
  refresh(): void {
    if (!this.lastGround) return;
    const fake = { clientX: NaN, clientY: NaN, button: 0, shift: false, ctrl: false };
    this.preview(fake, this.lastGround);
  }

  // ── preview per tool ──
  private preview(e: PointerInput, ground: XZ): void {
    const store = this.store;
    const index = store.index();
    const level = this.level;
    const drag = this.drag?.button === 0 ? this.drag : null;
    const cell = cellOf(ground.x, ground.z);
    let plan: Plan | null = null;
    let fill: XZ[] | null = null;
    let fills: Rect[] | null = null;
    let hover: string | null = null;
    this.engine.overlay.setSubgrid(null);

    switch (store.tool()) {
      case 'select': {
        if (drag?.moving && drag.moved) {
          plan = this.planMove(drag, ground);
        } else if (!Number.isNaN(e.clientX)) {
          hover = this.engine.pickPiece(e.clientX, e.clientY, (id) => this.pickable(id));
        }
        break;
      }
      case 'room': {
        const from = drag ? cellOf(drag.start.x, drag.start.z) : cell;
        fill = [from, cell];
        plan = drag ? planRoom(index, level, from, cell, store.roomFloorItem(), store.wallItem()) : null;
        break;
      }
      case 'floor': {
        const picked = resolveItem(store.floorItem());
        const connector = picked ? connectorOf(picked) : undefined;
        if (connector && !e.ctrl) {
          // Stairs and lifts go one cell at a time; R turns them. The entry cell is marked too.
          const rot = store.rot();
          plan =
            connector === 'stairs'
              ? planStairs(index, level, cell, rot, store.floorItem())
              : planLift(index, [level], cell, rot, store.floorItem());
          const f = frontOf(rot);
          fills = [cellRectToRect(normCellRect(cell, cell)), cellRectToRect(normCellRect({ x: cell.x + f.x, z: cell.z + f.z }, { x: cell.x + f.x, z: cell.z + f.z }))];
          break;
        }
        const from = drag ? cellOf(drag.start.x, drag.start.z) : cell;
        fill = [from, cell];
        const ceiling = picked?.entry.placement.kind === 'ceiling';
        plan = e.ctrl
          ? planFloorErase(index, level, from, cell, ceiling)
          : planTileRect(index, level, from, cell, store.floorItem(), store.rot());
        break;
      }
      case 'edge': {
        const preferFlip = store.flip() ? -1 : 1;
        if (drag && drag.moved) {
          const v0 = vertexOf(drag.start.x, drag.start.z);
          const v1 = vertexOf(ground.x, ground.z);
          const cam = this.engine.cameraXZ();
          const horizontal = Math.abs(v1.x - v0.x) >= Math.abs(v1.z - v0.z);
          const camSide: 1 | -1 = horizontal ? (cam.z > v0.z * CELL ? 1 : -1) : cam.x > v0.x * CELL ? 1 : -1;
          plan = e.ctrl
            ? planEdgeErase(index, level, v0, v1)
            : planEdgeLine(index, level, v0, v1, store.edgeItem(), (camSide * preferFlip) as 1 | -1);
        } else {
          const near = nearestEdge(level, ground.x, ground.z);
          const a = { x: near.edge.x, z: near.edge.z };
          const b = near.edge.axis === 'x' ? { x: a.x + 1, z: a.z } : { x: a.x, z: a.z + 1 };
          plan = e.ctrl
            ? planEdgeErase(index, level, a, b)
            : planEdgeLine(index, level, a, b, store.edgeItem(), (near.side * preferFlip) as 1 | -1);
        }
        break;
      }
      case 'object': {
        const piece = this.objectAt(ground);
        if (piece) plan = planPlace(index, piece);
        this.engine.overlay.setSubgrid(ground);
        break;
      }
      case 'erase': {
        if (drag && drag.moved) {
          const from = cellOf(drag.start.x, drag.start.z);
          fill = [from, cell];
          plan = planEraseRect(index, level, from, cell);
        } else if (!Number.isNaN(e.clientX)) {
          hover = this.engine.pickPiece(e.clientX, e.clientY, (id) => this.pickable(id));
          plan = hover ? planRemove(index, [hover]) : null;
        }
        break;
      }
      case 'eyedropper': {
        if (!Number.isNaN(e.clientX)) hover = this.engine.pickPiece(e.clientX, e.clientY, (id) => this.pickable(id));
        break;
      }
    }

    store.plan.set(plan);
    store.hint.set(plan?.rejected.length ? (plan.reason ?? '') : '');
    store.hoverId.set(hover);
    const hip = hover ? index.get(hover) : undefined;
    this.engine.setHover(hip ? pieceRects(hip) : []);
    this.engine.setFill(fills ?? (fill ? [cellRectToRect(normCellRect(fill[0], fill[1]))] : []));
  }

  private click(e: PointerInput): void {
    const store = this.store;
    const hit = this.engine.pickPiece(e.clientX, e.clientY, (id) => this.pickable(id));
    const ip = hit ? store.index().get(hit) : undefined;
    if (!ip) {
      store.selection.set([]);
      store.selectedRoomId.set(null);
      return;
    }
    const roomAt = (x: number, z: number) => {
      const c = cellOf(x, z);
      return store.rooms().find((r) => r.level === ip.piece.level && r.cells.some((k) => k.x === c.x && k.z === c.z))?.id ?? null;
    };
    if (ip.shape.kind === 'floor' && !e.shift) {
      // Clicking bare floor selects the room (inspector shows its function, size, doors).
      const ground = this.engine.pickGround(e.clientX, e.clientY);
      store.selection.set([ip.piece.id]);
      store.selectedRoomId.set(ground ? roomAt(ground.x, ground.z) : null);
      return;
    }
    if (e.shift) {
      const sel = store.selection();
      store.selection.set(sel.includes(hit!) ? sel.filter((id) => id !== hit) : [...sel, hit!]);
    } else {
      store.selection.set([hit!]);
    }
    store.selectedRoomId.set(roomAt(ip.piece.x, ip.piece.z));
  }

  private planMove(drag: Drag, ground: XZ): Plan | null {
    const ids = drag.moving ?? [];
    const index = this.store.index();
    if (ids.length === 1 && index.get(ids[0])?.shape.kind === 'wall-object') {
      const target = this.wallSpot(ground);
      return planTransform(index, ids, (p) => ({ ...p, ...target }), 'Przesuń');
    }
    const dx = snap(ground.x - drag.start.x, SNAP);
    const dz = snap(ground.z - drag.start.z, SNAP);
    if (dx === 0 && dz === 0) return null;
    return planTransform(index, ids, (p) => ({ ...p, x: p.x + dx, z: p.z + dz }), ids.length > 1 ? `Przesuń (${ids.length})` : 'Przesuń');
  }

  /** Candidate piece of the object tool under the cursor, snapped. */
  private objectAt(ground: XZ): Omit<Piece, 'id'> | null {
    const item = resolveItem(this.store.objectItem());
    if (!item || item.entry.placement.kind !== 'object') return null;
    const p = item.entry.placement;
    if (p.layer === 'wall') return { item: item.variant.id, level: this.level, ...this.wallSpot(ground) };
    const rot = this.store.rot();
    const fp = footprintOf(item);
    const [w, d] = rotatedSize(fp.w, fp.d, rot);
    const step = p.layer === 'surface' ? SNAP / 2 : SNAP;
    // Snap the footprint's corner (not its centre) so edges line up with the grid.
    const x = snap(ground.x - w / 2, step) + w / 2;
    const z = snap(ground.z - d / 2, step) + d / 2;
    return { item: item.variant.id, level: this.level, x, z, rot };
  }

  /** Point on the nearest wall line, facing the side the cursor is on. */
  private wallSpot(ground: XZ): { x: number; z: number; rot: Piece['rot'] } {
    const near = nearestEdge(this.level, ground.x, ground.z);
    const rot = edgeRot(near.edge.axis, near.side);
    return near.edge.axis === 'x'
      ? { x: snap(ground.x, SNAP), z: near.edge.z * CELL, rot }
      : { x: near.edge.x * CELL, z: snap(ground.z, SNAP), rot };
  }

  /** Pieces of other decks are not pickable (lower decks show through gaps). */
  private pickable(id: string): boolean {
    return this.store.index().get(id)?.piece.level === this.level;
  }

  private movable(id: string): boolean {
    const s = this.store.index().get(id)?.shape;
    return !!s && (s.kind === 'object' || s.kind === 'wall-object');
  }
}
