import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  computed,
  effect,
  inject,
  isDevMode,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { RoverId } from '@space-game/api';
import { RenderHost, isAtanorControls, type PickResult, type ViewInput } from '@space-game/render';
import { VIEW_FACTORIES } from './view-factories.token';
import { AtanorSession } from '../game/atanor-session';
import { CommandsService } from '../game/commands';
import { GameService } from '../game/game.service';
import { PerfService } from '../game/perf';
import { UiState } from '../game/ui-state';
import { SystemMap } from '../hud/system-map';
import { TEXT } from '../i18n/pl';

export { VIEW_FACTORIES };

/** Real pixels a pointer may move between down and up and still count as a click (PoC: 5 px). */
const DRAG_PX = 5;

type Point = { x: number; y: number };
type ScenePoint = { x: number; y: number; depth: number; visible: boolean };
/** The planet/system scene as the dev hook reads it (`SystemView.internals`). */
interface SceneProbe {
  screenOf(id: string): ScenePoint | null;
  screenOfUnit(id: string): ScenePoint | null;
  screenOfLocal(id: string, p: { x: number; y: number; z: number }): ScenePoint | null;
  gridOf(id: string): { radius: number; tiles: ReadonlyArray<{ index: number; center: { x: number; y: number; z: number } }> } | undefined;
}
type DevWindow = Window & {
  wgWorld?: {
    screenOf(id: string): Point | null;
    screenOfUnit(id: string): Point | null;
    /** Tiles of the body's near side on the page, nearest to the camera first. */
    frontTiles(bodyId: string): Array<Point & { index: number }>;
    /** Buildings of a kind: id, body and tile indices (for clicking them in e2e tests). */
    structures(kind: string): Array<{ id: string; bodyId: string; tiles: number[] }>;
    /** Centre of an Atanor board hex on the page (while the Atanor view is shown). */
    atanorHex(q: number, r: number): Point | null;
  };
};

/**
 * The world view: hosts the scenes (RenderHost), runs the animation loop, turns clicks into
 * selection, flight orders and placements. Per-frame data never goes through Signals.
 */
@Component({
  selector: 'wg-world-view',
  imports: [SystemMap],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      #host
      class="host"
      [class.is-placing]="!!ui.placement() || atanorTool()"
      (pointerdown)="down($event)"
      (pointerup)="up($event)"
      (pointermove)="move($event)"
      (pointerleave)="ui.hover.set(null); atanorSession.hover(null)"
      (contextmenu)="$event.preventDefault()"
    ></div>
    @if (!hasScene()) {
      <div class="fallback">
        <wg-system-map [size]="760" [labels]="true" />
      </div>
    }
  `,
  styles: `
    :host { position: absolute; inset: 0; display: block; }
    .host { position: absolute; inset: 0; }
    .host.is-placing { cursor: copy; }
    .fallback { position: absolute; inset: 48px 0 240px; display: grid; place-items: center; pointer-events: none; }
    .fallback wg-system-map { width: min(760px, 70vh); height: min(760px, 70vh); pointer-events: auto; }
  `,
})
export class WorldView {
  protected readonly t = inject(TEXT);
  private readonly game = inject(GameService);
  protected readonly ui = inject(UiState);
  private readonly commands = inject(CommandsService);
  protected readonly atanorSession = inject(AtanorSession);
  /** An Atanor tool is active (the board shows its ghost). */
  protected readonly atanorTool = computed(() => this.ui.view() === 'atanor' && (this.atanorSession.state()?.tool ?? 'SELECT') !== 'SELECT');
  private readonly perf = inject(PerfService);
  private readonly factories = inject(VIEW_FACTORIES);
  private readonly hostEl = viewChild.required<ElementRef<HTMLDivElement>>('host');
  private render: RenderHost | null = null;
  private raf = 0;
  private lastFrame = 0;
  private downAt: { x: number; y: number } | null = null;
  private lastHover = 0;
  private readonly ready = signal(false);

  /** Whether the current view has a scene (else the schematic map is shown). */
  protected readonly hasScene = computed(() => this.ready() && !!this.factories[this.ui.view()]);

  constructor() {
    afterNextRender(() => {
      if (Object.keys(this.factories).length) {
        this.render = new RenderHost(this.hostEl().nativeElement, { views: this.factories, assetsBase: 'assets/' });
        this.ready.set(true);
      }
      // dev builds only: where a body is on the page, for the e2e tests (like the harness's screenOf)
      if (isDevMode()) {
        (window as DevWindow).wgWorld = {
          screenOf: (id) => this.page(this.probe()?.screenOf(id)),
          screenOfUnit: (id) => this.page(this.probe()?.screenOfUnit(id)),
          frontTiles: (bodyId) => this.frontTiles(bodyId),
          structures: (kind) =>
            (this.game.world()?.structures ?? [])
              .filter((s) => s.kind === kind)
              .map((s) => ({ id: s.id, bodyId: s.bodyId, tiles: s.tiles.map((t) => Number(t.slice(t.lastIndexOf(':') + 1))) })),
          atanorHex: (q, r) => {
            const layout = (this.render?.currentView as { hexLayout?: { size: number; origin: { x: number; y: number } } } | null)?.hexLayout;
            if (this.ui.view() !== 'atanor' || !layout) return null;
            const box = this.hostEl().nativeElement.getBoundingClientRect();
            // pointy-top axial hexes (domain grid/hex.ts hexToPixel)
            return { x: box.left + layout.origin.x + layout.size * Math.sqrt(3) * (q + r / 2), y: box.top + layout.origin.y + layout.size * 1.5 * r };
          },
        };
      }
      const loop = (now: number) => {
        this.raf = requestAnimationFrame(loop);
        this.frame(now);
      };
      this.raf = requestAnimationFrame(loop);
    });

    effect(() => {
      const view = this.ui.view();
      if (!this.ready() || !this.factories[view]) return;
      untracked(() =>
        void this.render?.setView(view).then(() => {
          const v = this.render?.currentView;
          this.ui.atanor.set(this.render?.current === 'atanor' && isAtanorControls(v) ? v : null);
          if (!this.ui.atanor()) this.ui.atanorReadout.set(null);
        }),
      );
    });

    const onResize = () => this.render?.resize();
    window.addEventListener('resize', onResize);
    inject(DestroyRef).onDestroy(() => {
      cancelAnimationFrame(this.raf);
      window.removeEventListener('resize', onResize);
      delete (window as DevWindow).wgWorld;
      this.render?.dispose();
      this.render = null;
    });
  }

  private input(): ViewInput | null {
    const snapshot = this.game.snapshot();
    if (!snapshot) return null;
    const p = this.ui.placement();
    return {
      snapshot,
      frame: this.game.frame,
      focusBodyId: this.ui.focusBodyId(),
      selection: this.ui.selection(),
      hover: this.ui.hover(),
      placement: p?.preview ? { kind: p.kind, tiles: p.preview.tiles, valid: p.preview.valid } : null,
      atanor: this.atanorSession.viewInput(),
    };
  }

  private frame(now: number): void {
    const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 0;
    this.lastFrame = now;
    const input = this.input();
    if (input && this.render) this.render.update(input, dt);
    this.perf.frame(now, this.render ? () => this.render!.stats() : undefined);
    const atanor = this.ui.atanor();
    if (atanor && now - this.lastReadout > 250) {
      this.lastReadout = now;
      this.ui.atanorReadout.set(atanor.readout());
    }
  }

  private lastReadout = 0;

  protected down(e: PointerEvent): void {
    this.downAt = { x: e.clientX, y: e.clientY };
  }

  protected up(e: PointerEvent): void {
    const start = this.downAt;
    this.downAt = null;
    if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_PX) return; // camera drag
    const pick = this.pickAt(e);
    if (pick) void this.onPick(pick, e.button === 2);
  }

  protected move(e: PointerEvent): void {
    if (performance.now() - this.lastHover < 33) return; // ~30 Hz like the PoC
    this.lastHover = performance.now();
    const pick = this.pickAt(e);
    if (this.ui.view() === 'atanor') {
      this.atanorSession.hover(pick?.kind === 'ATANOR_HEX' ? { q: pick.q, r: pick.r } : null);
      return;
    }
    this.ui.hover.set(pick);
    const p = this.ui.placement();
    const world = this.game.world();
    if (!p || !world || pick?.kind !== 'TILE') return;
    if (p.preview?.tileIndex === pick.tileIndex) return;
    void this.game.previewBuild(pick.bodyId, pick.tileIndex, p.kind, p.rotation).then((r) => {
      const cur = this.ui.placement();
      if (cur && cur.kind === p.kind && cur.rotation === p.rotation) {
        this.ui.placement.set({ ...cur, preview: { kind: p.kind, tiles: r.tiles, valid: r.ok, tileIndex: pick.tileIndex, ...(r.reason ? { reason: r.reason } : {}), ...(r.detail ? { detail: r.detail } : {}) } });
      }
    });
  }

  // dev hook (e2e): positions in the planet/system scene, in page pixels

  private probe(): SceneProbe | null {
    return (this.render?.currentView as { internals?: SceneProbe | null } | null)?.internals ?? null;
  }

  private page(p: ScenePoint | null | undefined): Point | null {
    if (!p?.visible) return null;
    const r = this.hostEl().nativeElement.getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  }

  private frontTiles(bodyId: string): Array<Point & { index: number }> {
    const s = this.probe();
    const grid = s?.gridOf(bodyId);
    const centre = s?.screenOf(bodyId);
    if (!s || !grid || !centre?.visible) return [];
    const out: Array<Point & { index: number; depth: number }> = [];
    for (const t of grid.tiles) {
      const p = s.screenOfLocal(bodyId, t.center);
      // near side: closer to the camera than the body centre by a third of the radius
      if (p?.visible && p.depth < centre.depth - grid.radius / 3) out.push({ ...this.page(p)!, index: t.index, depth: p.depth });
    }
    return out.sort((a, b) => a.depth - b.depth).map(({ depth: _d, ...rest }) => rest);
  }

  private pickAt(e: PointerEvent): PickResult | null {
    const input = this.input();
    if (!this.render || !input) return null;
    const rect = this.hostEl().nativeElement.getBoundingClientRect();
    return this.render.pick(e.clientX - rect.left, e.clientY - rect.top, input);
  }

  private async onPick(pick: PickResult, secondary: boolean): Promise<void> {
    // Atanor editor (AT2): LMB uses the tool on the hex (or selects), RMB puts the tool away
    if (this.ui.view() === 'atanor') {
      if (secondary) this.atanorSession.setTool('SELECT');
      else if (pick.kind === 'ATANOR_HEX') this.atanorSession.apply({ q: pick.q, r: pick.r });
      return;
    }
    const world = this.game.world();
    if (!world) return;
    const placement = this.ui.placement();
    if (placement && pick.kind === 'TILE' && !secondary) {
      await this.commands.place(pick.bodyId, placement.kind, pick.tileIndex, placement.rotation);
      return;
    }
    if (secondary && placement) {
      this.ui.placement.set(null);
      return;
    }
    const sel = this.ui.selection();
    // a rover drives to the tile: "Jedź do" mode, or RMB with the rover selected (3D PoC)
    const rover = this.ui.driveRover() ?? (secondary && sel.kind === 'ROVER' ? sel.roverId : null);
    if (rover && (pick.kind === 'TILE' || pick.kind === 'STRUCTURE')) {
      this.ui.driveRover.set(null);
      await this.game.command({ type: 'MOVE_ROVER', roverId: rover as RoverId, tileIndex: pick.tileIndex });
      return;
    }
    // flight orders go to the selected ship (3D PoC), else to the mothership
    const selectedShip = sel.kind === 'SHIP' ? world.ships.find((s) => s.id === sel.shipId) : undefined;
    const ship = selectedShip ?? world.ships.find((s) => s.role === 'MOTHERSHIP') ?? world.ships[0];
    const bodyOf = (p: PickResult) => (p.kind === 'BODY' || p.kind === 'TILE' || p.kind === 'STRUCTURE' ? p.bodyId : null);
    if ((this.ui.targeting() || secondary) && ship && bodyOf(pick)) {
      this.ui.targeting.set(false);
      // the domain refuses a star (NOT_LANDABLE); the rejection shows in the log
      await this.game.command({ type: 'MOVE_SHIP', shipId: ship.id, to: bodyOf(pick)! });
      return;
    }
    // Układ: choosing a planet or moon (a body with a surface grid) zooms in on it in the planet
    // view, where the colony is built; the star and the belt stay selected in the overview
    const chosen = this.ui.view() === 'system' ? bodyOf(pick) : null;
    if (chosen && world.bodies.find((b) => b.id === chosen)?.surfaceGrid) {
      this.ui.select({ kind: 'BODY', bodyId: chosen });
      this.ui.view.set('planet');
      return;
    }
    switch (pick.kind) {
      case 'STRUCTURE':
        this.ui.select({ kind: 'STRUCTURE', structureId: pick.structureId });
        break;
      case 'ROVER':
        this.ui.select({ kind: 'ROVER', roverId: pick.roverId });
        break;
      case 'SHIP':
        this.ui.select({ kind: 'SHIP', shipId: pick.shipId });
        break;
      case 'TILE':
        this.ui.select({ kind: 'TILE', bodyId: pick.bodyId, tileIndex: pick.tileIndex });
        break;
      case 'BODY':
        this.ui.select({ kind: 'BODY', bodyId: pick.bodyId });
        break;
      case 'STAR':
        this.ui.select({ kind: 'STAR', starName: pick.starName });
        break;
      case 'EMPTY':
        if (!placement) this.ui.select({ kind: 'NONE' });
        break;
    }
  }
}
