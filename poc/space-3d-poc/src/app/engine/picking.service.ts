import * as THREE from 'three';
import { TileId, tileId } from '../game/models/planet-grid.model';
import { BodyId, RoverId, ShipId } from '../shared/ids';
import { EntityViewRegistry, PickUserData } from './entity-view-registry';

export type PickResult =
  | { kind: 'SHIP'; shipId: ShipId }
  | { kind: 'ROVER'; roverId: RoverId }
  | { kind: 'TILE'; bodyId: BodyId; tileId: TileId; tileIndex: number }
  | { kind: 'BODY'; bodyId: BodyId }
  | { kind: 'EMPTY' };

export interface PickHandlers {
  onPrimary: (r: PickResult) => void;
  onSecondary: (r: PickResult) => void;
  /** Throttled pointer-move pick over tile grids only (TILE or EMPTY). */
  onHover?: (r: PickResult) => void;
}

const CLICK_THRESHOLD_PX = 5;
const HOVER_INTERVAL_MS = 33;

/** Mouse picking: LMB selects, RMB issues orders, hover highlights tiles. A drag (camera orbit) never picks. */
export class PickingService {
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private abort: AbortController | null = null;
  private down: { x: number; y: number; button: number } | null = null;
  private lastHover = 0;

  attach(canvas: HTMLCanvasElement, camera: THREE.Camera, registry: EntityViewRegistry, handlers: PickHandlers): void {
    this.detach();
    this.abort = new AbortController();
    const { signal } = this.abort;

    canvas.addEventListener('contextmenu', (e) => e.preventDefault(), { signal });
    canvas.addEventListener(
      'pointerdown',
      (e) => {
        this.down = { x: e.clientX, y: e.clientY, button: e.button };
      },
      { signal },
    );
    canvas.addEventListener(
      'pointerup',
      (e) => {
        const d = this.down;
        this.down = null;
        if (!d || d.button !== e.button) return;
        if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > CLICK_THRESHOLD_PX) return;
        const result = this.pick(canvas, camera, registry, e.clientX, e.clientY);
        if (e.button === 0) handlers.onPrimary(result);
        else if (e.button === 2) handlers.onSecondary(result);
      },
      { signal },
    );
    if (handlers.onHover) {
      const onHover = handlers.onHover;
      canvas.addEventListener(
        'pointermove',
        (e) => {
          if (this.down) return; // dragging the camera
          const now = performance.now();
          if (now - this.lastHover < HOVER_INTERVAL_MS) return;
          this.lastHover = now;
          onHover(this.pickGrid(canvas, camera, registry, e.clientX, e.clientY));
        },
        { signal },
      );
      canvas.addEventListener('pointerleave', () => onHover({ kind: 'EMPTY' }), { signal });
    }
  }

  detach(): void {
    this.abort?.abort();
    this.abort = null;
    this.down = null;
  }

  /** Full pick: ships, rovers, then body surfaces (a grid surface yields the tile under the cursor). */
  pick(canvas: HTMLCanvasElement, camera: THREE.Camera, registry: EntityViewRegistry, cx: number, cy: number): PickResult {
    this.aim(canvas, camera, cx, cy);
    const ship = this.raycaster.intersectObjects(registry.pickableShips, false)[0];
    if (ship) return { kind: 'SHIP', shipId: (ship.object.userData as PickUserData).entityId as ShipId };
    const rover = this.raycaster.intersectObjects(registry.pickableRovers, false)[0];
    if (rover) return { kind: 'ROVER', roverId: (rover.object.userData as PickUserData).entityId as RoverId };
    const body = this.raycaster.intersectObjects(registry.pickableBodies, false)[0];
    if (body) return this.bodyResult(registry, body);
    return { kind: 'EMPTY' };
  }

  /** Pick limited to tile grids (hover). */
  pickGrid(canvas: HTMLCanvasElement, camera: THREE.Camera, registry: EntityViewRegistry, cx: number, cy: number): PickResult {
    this.aim(canvas, camera, cx, cy);
    const hit = this.raycaster.intersectObjects(registry.pickableGrids, false)[0];
    return hit ? this.bodyResult(registry, hit) : { kind: 'EMPTY' };
  }

  /** Pick along an explicit ray (tests, headless use). */
  pickRay(origin: THREE.Vector3, direction: THREE.Vector3, registry: EntityViewRegistry): PickResult {
    this.raycaster.set(origin, direction);
    const hit = this.raycaster.intersectObjects(registry.pickableBodies, false)[0];
    return hit ? this.bodyResult(registry, hit) : { kind: 'EMPTY' };
  }

  private aim(canvas: HTMLCanvasElement, camera: THREE.Camera, cx: number, cy: number): void {
    const rect = canvas.getBoundingClientRect();
    this.ndc.set(((cx - rect.left) / rect.width) * 2 - 1, -(((cy - rect.top) / rect.height) * 2 - 1));
    this.raycaster.setFromCamera(this.ndc, camera);
  }

  private bodyResult(registry: EntityViewRegistry, hit: THREE.Intersection): PickResult {
    const data = hit.object.userData as PickUserData;
    const bodyId = data.entityId as BodyId;
    const view = registry.bodies.get(bodyId);
    if (view?.grid && hit.faceIndex !== undefined && hit.faceIndex !== null) {
      const index = view.grid.tileAtFace(hit.faceIndex);
      if (index >= 0) return { kind: 'TILE', bodyId, tileId: tileId(bodyId, index), tileIndex: index };
    }
    return { kind: 'BODY', bodyId };
  }
}
