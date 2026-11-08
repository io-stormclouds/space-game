import { Injectable, inject, signal } from '@angular/core';
import * as THREE from 'three';
import { CameraController } from '../engine/camera-controller';
import { PickHandlers, PickResult, PickingService } from '../engine/picking.service';
import { SceneManager, TileRef } from '../engine/scene-manager';
import { DomainEvent } from '../game/models/domain-event.model';
import { BodyId, RoverId, ShipId } from '../shared/ids';
import { CommandService } from './command.service';
import { GameStateService } from './game-state.service';
import { SimulationService } from './simulation.service';

export interface BodyLabel {
  bodyId: BodyId;
  name: string;
  minerals: number | null;
  x: number;
  y: number;
}

const UI_REFRESH_HZ = 10;

/** requestAnimationFrame loop: simulation → state → engine. Runs outside Angular's change detection. */
@Injectable({ providedIn: 'root' })
export class GameLoopService {
  private readonly state = inject(GameStateService);
  private readonly sim = inject(SimulationService);
  private readonly commands = inject(CommandService);

  /** Screen-space body labels for the HUD, refreshed at UI_REFRESH_HZ. */
  readonly labels = signal<ReadonlyArray<BodyLabel>>([]);
  readonly fps = signal(0);

  private scene: SceneManager | null = null;
  private readonly picking = new PickingService();
  private readonly cameraCtl = new CameraController();
  private rafHandle = 0;
  private running = false;
  private lastNow = 0;
  private uiAccumulator = 0;
  private frameCount = 0;
  private fpsAccumulator = 0;
  private keyAbort: AbortController | null = null;
  private readonly focus = new THREE.Vector3();
  private hover: TileRef | null = null;

  start(canvas: HTMLCanvasElement, handlers: PickHandlers): void {
    if (this.running) return;
    const scene = new SceneManager();
    scene.init(canvas);
    scene.buildWorld(this.state.bodies(), this.state.spacecraft(), {
      grids: this.sim.grids,
      shapes: this.sim.shapes,
      structures: this.state.structures(),
      rovers: this.state.rovers(),
      colonies: this.sim.colonies,
      dockingOffset: (id) => this.sim.dockingOffset(id),
    });
    this.scene = scene;
    void scene.loadModels();

    this.cameraCtl.attach(scene.camera, canvas);
    this.picking.attach(canvas, scene.camera, scene.registry, {
      ...handlers,
      onHover: (r: PickResult) => this.onHover(r),
    });
    this.attachKeyboard();

    this.running = true;
    this.lastNow = performance.now();
    this.rafHandle = requestAnimationFrame(this.frame);
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    cancelAnimationFrame(this.rafHandle);
    this.keyAbort?.abort();
    this.keyAbort = null;
    this.picking.detach();
    this.cameraCtl.detach();
    this.scene?.dispose();
    this.scene = null;
  }

  setHighlighted(shipId: ShipId | null): void {
    this.scene?.setHighlighted(shipId);
  }

  setHighlightedRover(roverId: RoverId | null): void {
    this.scene?.setHighlightedRover(roverId);
  }

  /**
   * Looks at a tile from above and a little to the side (colony switcher): the camera goes out along
   * the tile normal, tilted towards world up, so the base faces the viewer.
   */
  viewTile(bodyId: BodyId, tileIndex: number, distance = 150): void {
    const tile = this.sim.grids.get(bodyId)?.tiles[tileIndex];
    if (!tile) return;
    const n = new THREE.Vector3(tile.normal.x, tile.normal.y, tile.normal.z);
    const side = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y);
    if (side.lengthSq() < 1e-6) side.set(0, 0, 1);
    this.cameraCtl.viewFrom(n.addScaledVector(side.normalize(), 0.3).setLength(distance));
  }

  setSelectedTile(ref: TileRef | null): void {
    this.scene?.setSelectedTile(ref);
  }

  /** Re-evaluates the placement ghost (placement kind or state changed). */
  refreshGhost(): void {
    const scene = this.scene;
    if (!scene) return;
    const kind = this.state.placementKind();
    const h = this.hover;
    if (!kind || !h) return scene.setGhost(null);
    const grid = this.sim.grids.get(h.bodyId);
    const tile = grid?.tiles[h.tileIndex];
    if (!tile) return scene.setGhost(null);
    const check = this.commands.canBuild(kind, h.bodyId, tile.id);
    scene.setGhost({ ...h, kind, ok: check.ok });
  }

  private onHover(r: PickResult): void {
    this.hover = r.kind === 'TILE' ? { bodyId: r.bodyId, tileIndex: r.tileIndex } : null;
    this.scene?.setHoverTile(this.hover);
    this.refreshGhost();
  }

  private readonly frame = (now: number): void => {
    if (!this.running || !this.scene) return;
    const realDt = (now - this.lastNow) / 1000;
    this.lastNow = now;

    const events = [...this.commands.drainStarted(), ...this.sim.step(realDt)];
    this.applyToEngine(events);

    this.scene.sync(this.sim.snapshot);
    this.cameraCtl.follow(this.focusPoint());
    this.scene.render();

    this.refreshUi(realDt);
    this.rafHandle = requestAnimationFrame(this.frame);
  };

  private applyToEngine(events: ReadonlyArray<DomainEvent>): void {
    const scene = this.scene!;
    for (const e of events) {
      if (e.type === 'TRANSFER_STARTED') scene.moveShipToTransit(e.shipId);
      else if (e.type === 'TRANSFER_ARRIVED') scene.moveShipToOrbit(e.shipId, e.bodyId);
      else if (e.type === 'STRUCTURE_BUILT') {
        scene.addStructure(e.structure);
        if (e.structure.kind === 'LANDING_PAD') scene.setDockingOffset(e.structure.bodyId, this.sim.dockingOffset(e.structure.bodyId));
        this.refreshGhost();
      } else if (e.type === 'MINING_TICK') scene.setDepletion(e.bodyId, this.state.body(e.bodyId)?.resources?.[e.resource] ?? 0);
    }
  }

  private focusPoint(): THREE.Vector3 {
    const scene = this.scene!;
    const selected = this.state.selectedShipId();
    if (selected && scene.registry.ships.has(selected)) return scene.worldPositionOfShip(selected, this.focus);
    const rover = this.state.selectedRoverId();
    if (rover && scene.worldPositionOfRover(rover, this.focus)) return this.focus;
    const tile = this.state.selectedTile();
    if (tile && scene.registry.bodies.has(tile.bodyId)) return scene.worldPositionOfBody(tile.bodyId, this.focus);
    return scene.worldPositionOfBody(this.state.homeBase().id, this.focus);
  }

  private refreshUi(realDt: number): void {
    this.frameCount++;
    this.fpsAccumulator += realDt;
    this.uiAccumulator += realDt;
    if (this.uiAccumulator < 1 / UI_REFRESH_HZ) return;
    this.uiAccumulator = 0;

    this.state.gameTime.set(this.sim.clock.time);
    const selected = this.state.selectedShipId();
    this.state.selectedTransitProgress.set(selected ? this.sim.snapshot.transitProgress.get(selected) ?? 0 : 0);

    const scene = this.scene!;
    const labels: BodyLabel[] = [];
    for (const b of this.state.bodies()) {
      if (b.kind === 'STAR') continue;
      const p = scene.projectBody(b.id, b.radius);
      if (p.visible) labels.push({ bodyId: b.id, name: b.name, minerals: b.resources?.FERRITE ?? null, x: p.x, y: p.y });
    }
    this.labels.set(labels);

    if (this.fpsAccumulator >= 1) {
      this.fps.set(Math.round(this.frameCount / this.fpsAccumulator));
      this.frameCount = 0;
      this.fpsAccumulator = 0;
    }
  }

  private attachKeyboard(): void {
    this.keyAbort = new AbortController();
    window.addEventListener(
      'keydown',
      (e) => {
        if (e.target instanceof HTMLInputElement) return;
        switch (e.key) {
          case ' ':
            e.preventDefault();
            this.state.togglePause();
            break;
          case '1':
            this.state.setTimeScale(1);
            break;
          case '2':
            this.state.setTimeScale(3);
            break;
          case '3':
            this.state.setTimeScale(10);
            break;
          case 'Escape':
            if (this.state.placementKind()) this.state.placementKind.set(null);
            else this.state.clearSelection();
            this.refreshGhost();
            break;
        }
      },
      { signal: this.keyAbort.signal },
    );
  }
}
