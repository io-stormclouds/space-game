import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  afterNextRender,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { allVariants } from '../domain/catalog/catalog';
import { LEVEL_HEIGHT } from '../domain/grid';
import { ROOM_TYPES } from '../domain/rooms';
import { EditorEngine } from '../engine/editor-engine';
import { renderThumbnails } from '../engine/thumbnails';
import { EditorStore, type ToolId } from '../state/editor-store';
import { issueRects, pieceRects, roomOutline } from '../state/rects';
import { ToolController, type PointerInput } from '../state/tool-controller';
import { InspectorComponent } from './inspector';
import { NightPanelComponent } from './night-panel';
import { ViewCompassComponent } from './view-compass';

interface RoomLabel {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly title: string;
  readonly sub: string;
  readonly alert: boolean;
}

const TOOL_KEYS: Record<string, ToolId> = { v: 'select', b: 'room', f: 'floor', o: 'object', x: 'erase', i: 'eyedropper' };

/** The 3D view: owns the engine, forwards pointer and keyboard input to the tools. */
@Component({
  selector: 'app-viewport',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [InspectorComponent, NightPanelComponent, ViewCompassComponent],
  template: `
    <canvas
      #canvas
      class="viewport__canvas"
      [class.is-tool]="store.tool() !== 'select'"
      (pointerdown)="onDown($event)"
      (pointermove)="onMove($event)"
      (pointerup)="onUp($event)"
      (pointerleave)="onLeave()"
      (contextmenu)="$event.preventDefault()"
    ></canvas>

    @if (store.showLabels()) {
      <div class="viewport__labels" aria-hidden="true">
        @for (l of labels(); track l.id) {
          <div class="room-label" [class.room-label--alert]="l.alert" [style.transform]="'translate(' + l.x + 'px,' + l.y + 'px)'">
            <span class="room-label__title">{{ l.title }}</span>
            <span class="room-label__sub">{{ l.sub }}</span>
          </div>
        }
      </div>
    }

    @if (store.hint()) {
      <div class="viewport__hint hud-micro" role="status">{{ store.hint() }}</div>
    }

    @if (loading()) {
      <div class="viewport__loading">
        <div class="hud-label">Ładowanie zestawu Molten Maps</div>
        <div class="progress"><div class="progress__bar" [style.width.%]="loadPct()"></div></div>
        <div class="hud-micro">{{ store.kitProgress().done }} / {{ store.kitProgress().total }} modeli</div>
      </div>
    }

    <app-inspector class="viewport__inspector" />

    @if (store.tuningOpen()) {
      <app-night-panel class="viewport__tuning" />
    }

    <app-view-compass
      class="viewport__compass"
      [heading]="heading()"
      [topDown]="topDown()"
      (turn)="engine?.rig.turnBy($event)"
      (turnTo)="engine?.rig.turnTo($event * DEG)"
      (orbit)="engine?.rig.orbitBy($event * DEG)"
      (toggleTop)="engine?.rig.toggleTopDown()"
      (center)="centerOnDeck()"
    />
  `,
  host: { class: 'viewport' },
})
export class ViewportComponent {
  readonly store = inject(EditorStore);
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  protected engine?: EditorEngine;
  protected readonly DEG = Math.PI / 180;
  /** Camera heading in degrees and top-down state, mirrored per frame for the compass. */
  readonly heading = signal(0);
  readonly topDown = signal(false);
  /** Alt + left drag: the camera orbits, the tools sit this gesture out. */
  private orbiting = false;
  private readonly engineRef = signal<EditorEngine | undefined>(undefined);
  private tools?: ToolController;
  readonly labels = signal<readonly RoomLabel[]>([]);
  readonly loading = signal(true);
  readonly loadPct = () => {
    const p = this.store.kitProgress();
    return p.total ? (100 * p.done) / p.total : 0;
  };
  private lastLabels = 0;
  private lastPerf = 0;

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const engine = new EditorEngine(this.canvas().nativeElement);
      this.engine = engine;
      this.tools = new ToolController(this.store, engine);
      engine.onFrame = () => this.onFrame();
      engine.start();
      this.engineRef.set(engine);
      if (ngDevMode) (window as unknown as Record<string, unknown>)['__interior'] = { engine, store: this.store };
      engine.loadKit((done, total) => this.store.kitProgress.set({ done, total })).then(() => {
        this.loading.set(false);
        engine.setLayout(this.store.index());
        // Default variant of every entry first (what the catalog grid shows), other colours after.
        const all = [...allVariants()];
        const first = all.filter((v) => v.entry.variants[0].id === v.variant.id);
        const rest = all.filter((v) => v.entry.variants[0].id !== v.variant.id);
        const items = [...first, ...rest].map((v) => ({ id: v.variant.id, model: v.variant.model }));
        void renderThumbnails(engine.kit, items, (id, url) =>
          this.store.thumbs.update((m) => new Map(m).set(id, url)),
        );
      });
      destroyRef.onDestroy(() => {
        this.engineRef.set(undefined);
        engine.dispose();
      });
    });

    // State → engine. Each effect reads the engine signal FIRST and returns while it is missing,
    // so it re-runs once the engine exists and then on every change of what it reads.
    const sync = (fn: (engine: EditorEngine) => void) =>
      effect(() => {
        const engine = this.engineRef();
        if (engine) fn(engine);
      });
    sync((e) => e.setLayout(this.store.index()));
    sync((e) => e.setPlan(this.store.plan()));
    sync((e) => e.setLevel(this.store.level()));
    sync((e) => e.setWallMode(this.store.wallMode()));
    sync((e) => e.setLighting(this.store.lighting(), this.store.nightTuning()));
    sync((e) => e.overlay.setGridVisible(this.store.showGrid()));
    sync((e) => e.setCeilings(this.store.showCeilings()));
    sync((e) => {
      const rects = this.store.selectedPieces().flatMap((ip) => pieceRects(ip));
      const room = this.store.selectedRoom();
      if (room) rects.push(...roomOutline(room));
      e.setSelection(rects);
    });
    sync((e) => {
      const index = this.store.index();
      const { errors, warnings } = issueRects(this.store.issues(), this.store.level(), (id) => index.get(id));
      e.overlay.setIssues(errors, warnings);
    });
    sync((e) => {
      const r = this.store.focusRequest();
      if (r) untracked(() => e.focus(r.x, r.z));
    });
    // Tool, item or rotation changed: re-run the preview under the cursor.
    effect(() => {
      this.store.tool();
      this.store.rot();
      this.store.flip();
      this.store.objectItem();
      this.store.edgeItem();
      this.store.floorItem();
      this.store.roomFloorItem();
      this.store.layout();
      untracked(() => this.tools?.refresh());
    });
  }

  private pointer(e: PointerEvent): PointerInput {
    return { clientX: e.clientX, clientY: e.clientY, button: e.button, shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey };
  }

  onDown(e: PointerEvent): void {
    if (e.button === 0 && e.altKey) {
      this.orbiting = true; // CameraRig switched the left button to rotate for this gesture
      return;
    }
    if (e.button === 0) this.canvas().nativeElement.setPointerCapture(e.pointerId);
    this.tools?.down(this.pointer(e));
  }

  onMove(e: PointerEvent): void {
    if (this.orbiting) return;
    this.tools?.move(this.pointer(e));
  }

  onUp(e: PointerEvent): void {
    if (this.orbiting) {
      if (e.button === 0) this.orbiting = false;
      return;
    }
    this.tools?.up(this.pointer(e));
  }

  onLeave(): void {
    this.tools?.leave();
  }

  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
    const s = this.store;
    const key = e.key.toLowerCase();
    const ctrl = e.ctrlKey || e.metaKey;
    if (ctrl && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) s.redo();
      else s.undo();
      return;
    }
    if (ctrl && key === 'y') {
      e.preventDefault();
      s.redo();
      return;
    }
    if (e.key === 'Alt') {
      e.preventDefault(); // Alt is the orbit modifier; keep the browser menu out of it
      return;
    }
    if (ctrl || e.altKey) return;
    if (TOOL_KEYS[key]) {
      s.setTool(TOOL_KEYS[key]);
      return;
    }
    switch (key) {
      case 'w':
        s.selectItem(s.wallItem());
        s.setTool('edge');
        break;
      case 'd':
        s.selectItem(s.edgeItem().startsWith('door/') ? s.edgeItem() : 'door/grey');
        break;
      case 'r':
        if (s.tool() === 'select') s.rotateSelection();
        else s.rotateTool();
        break;
      case 'delete':
      case 'backspace':
        s.deleteSelection();
        break;
      case 'escape':
        this.tools?.cancel();
        break;
      case 'q':
        this.engine?.rig.turnBy(-45);
        break;
      case 'e':
        this.engine?.rig.turnBy(45);
        break;
      case 't':
        this.engine?.rig.toggleTopDown();
        break;
      case 'c':
        s.wallMode.update((m) => (m === 'up' ? 'cutaway' : m === 'cutaway' ? 'down' : 'up'));
        break;
      case 'l':
        s.lighting.update((l) => (l === 'day' ? 'night' : 'day'));
        break;
      case 'n':
        s.toggleTuning();
        break;
      case 'g':
        s.showGrid.update((v) => !v);
        break;
      case 'pageup':
        s.setLevel(s.level() + 1);
        break;
      case 'pagedown':
        s.setLevel(s.level() - 1);
        break;
      case 'home':
        this.centerOnDeck();
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  @HostListener('window:keyup', ['$event'])
  onKeyUp(e: KeyboardEvent): void {
    if (e.key === 'Alt') e.preventDefault();
  }

  /** Glides the camera to the middle of the active deck's rooms. */
  centerOnDeck(): void {
    const rooms = this.store.rooms().filter((r) => r.level === this.store.level());
    if (!rooms.length) return;
    const xs = rooms.map((r) => r.center.x);
    const zs = rooms.map((r) => r.center.z);
    this.engine?.focus((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2);
  }

  private onFrame(): void {
    const now = performance.now();
    const engine = this.engine;
    if (!engine) return;
    const heading = engine.rig.heading / this.DEG;
    if (Math.abs(heading - this.heading()) > 0.25) this.heading.set(heading);
    if (engine.rig.topDown !== this.topDown()) this.topDown.set(engine.rig.topDown);
    if (now - this.lastPerf > 500) {
      this.lastPerf = now;
      this.store.perf.set(engine.stats());
      engine.refreshLights(); // re-aim the light pool as the view moves
    }
    if (now - this.lastLabels < 66 || !this.store.showLabels()) return;
    this.lastLabels = now;
    const level = this.store.level();
    const issuesByRoom = new Set(this.store.issues().filter((i) => i.severity !== 'info').map((i) => i.roomId));
    const out: RoomLabel[] = [];
    for (const r of this.store.rooms()) {
      if (r.level !== level) continue;
      const p = engine.project(r.center.x, level * LEVEL_HEIGHT + 0.2, r.center.z);
      if (!p.visible) continue;
      out.push({
        id: r.id,
        x: Math.round(p.x),
        y: Math.round(p.y),
        title: ROOM_TYPES[r.type].label,
        sub: `${r.area} m²`,
        alert: r.breaches.length > 0 || issuesByRoom.has(r.id),
      });
    }
    this.labels.set(out);
  }
}
