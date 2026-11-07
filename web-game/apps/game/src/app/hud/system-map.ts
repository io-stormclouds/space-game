import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { BodyId, CelestialBody, WorldState } from '@space-game/api';
import { GameService } from '../game/game.service';
import { UiState } from '../game/ui-state';
import { TEXT } from '../i18n/pl';

interface Dot {
  id: BodyId;
  x: number;
  y: number;
  r: number;
  label: string;
  unknown: boolean;
}

/** Schematic radius: √ of the orbit so inner and outer planets both fit. */
const schematic = (r: number, outer: number, size: number) => (Math.sqrt(r) / Math.sqrt(outer)) * size * 0.46;

/**
 * Top-down schematic of the system (canvas "MAPA" and the Arrival board): orbits, bodies at their
 * angle ωt + φ, the mothership. Clicking a body selects it, or sends the ship while "Leć do…" is on.
 */
@Component({
  selector: 'wg-system-map',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="'0 0 ' + size() + ' ' + size()" role="img" [attr.aria-label]="t.map.tab" [class.is-targeting]="ui.targeting()">
      @for (o of orbits(); track o.id) {
        <circle [attr.cx]="c()" [attr.cy]="c()" [attr.r]="o.r" class="orbit" [class.belt]="o.belt" />
      }
      <circle [attr.cx]="c()" [attr.cy]="c()" [attr.r]="labels() ? 6 : 3" class="star" />
      @for (d of dots(); track d.id) {
        <g class="body" [class.is-on]="d.id === selectedId()" [class.unknown]="d.unknown" (click)="pick(d.id)" [attr.data-body]="d.id">
          <circle [attr.cx]="d.x" [attr.cy]="d.y" [attr.r]="d.r" />
          <circle [attr.cx]="d.x" [attr.cy]="d.y" r="12" class="hit" />
          @if (labels()) {
            <text [attr.x]="d.x + 10" [attr.y]="d.y + 4">{{ d.label }}</text>
          }
        </g>
      }
      @if (ship(); as s) {
        <rect [attr.x]="s.x - 4" [attr.y]="s.y - 4" width="8" height="8" class="ship" />
        @if (labels()) {
          <text [attr.x]="s.x + 10" [attr.y]="s.y - 8" class="ship-label">{{ s.label }}</text>
        }
      }
    </svg>
  `,
  styles: `
    :host { display: block; width: 100%; height: 100%; }
    svg { width: 100%; height: 100%; display: block; }
    .orbit { fill: none; stroke: var(--hud-color-line); }
    .orbit.belt { stroke-dasharray: 2 4; stroke-width: 3; }
    .star { fill: var(--hud-color-text); }
    .body { cursor: pointer; }
    .body circle:not(.hit) { fill: var(--hud-color-text-dim); }
    .body.unknown circle:not(.hit) { fill: none; stroke: var(--hud-color-text-dim); stroke-dasharray: 2 2; }
    .body.is-on circle:not(.hit), .body:hover circle:not(.hit) { fill: var(--hud-color-signal); stroke: var(--hud-color-signal); }
    .hit { fill: transparent; }
    text { fill: var(--hud-color-text-dim); font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; }
    .ship { fill: var(--hud-color-signal); }
    .ship-label { fill: var(--hud-color-signal); font-weight: 700; }
    .is-targeting .body { cursor: crosshair; }
  `,
})
export class SystemMap {
  protected readonly t = inject(TEXT);
  private readonly game = inject(GameService);
  protected readonly ui = inject(UiState);
  readonly size = input(200);
  readonly labels = input(false);
  protected readonly c = computed(() => this.size() / 2);

  private readonly layout = computed(() => {
    const w = this.game.world();
    if (!w) return { orbits: [], dots: [], positions: new Map<BodyId, { x: number; y: number }>() };
    return layoutSystem(w, this.size(), this.game.time());
  });
  protected readonly orbits = computed(() => this.layout().orbits);
  protected readonly dots = computed(() => this.layout().dots);
  protected readonly selectedId = computed(() => {
    const s = this.ui.selection();
    return s.kind === 'BODY' || s.kind === 'TILE' ? s.bodyId : null;
  });

  protected readonly ship = computed(() => {
    const w = this.game.world();
    const ark = w?.ships.find((s) => s.role === 'MOTHERSHIP') ?? w?.ships[0];
    if (!w || !ark) return null;
    const pos = this.layout().positions;
    if (ark.transfer) {
      const a = pos.get(ark.transfer.fromBodyId);
      const b = pos.get(ark.transfer.toBodyId);
      if (!a || !b) return null;
      const u = Math.max(0, Math.min(1, (w.time - ark.transfer.startTime) / Math.max(ark.transfer.estimatedDuration, 1e-6)));
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, label: ark.name };
    }
    const at = ark.currentBodyId ? pos.get(ark.currentBodyId) : undefined;
    return at ? { x: at.x + 9, y: at.y - 9, label: ark.name } : null;
  });

  protected async pick(bodyId: BodyId): Promise<void> {
    const w = this.game.world();
    if (this.ui.targeting() && w) {
      const ship = w.ships.find((s) => s.role === 'MOTHERSHIP') ?? w.ships[0];
      this.ui.targeting.set(false);
      if (ship) await this.game.command({ type: 'MOVE_SHIP', shipId: ship.id, to: bodyId });
      return;
    }
    this.ui.select({ kind: 'BODY', bodyId });
  }
}

export function layoutSystem(w: WorldState, size: number, time: number) {
  const star = w.bodies.find((b) => b.parentId === null);
  const top = w.bodies.filter((b) => b.parentId === star?.id);
  const outer = Math.max(1, ...top.map((b) => b.orbitRadius));
  const cx = size / 2;
  const positions = new Map<BodyId, { x: number; y: number }>();
  if (star) positions.set(star.id, { x: cx, y: cx });
  const orbits: Array<{ id: BodyId; r: number; belt: boolean }> = [];
  const dots: Dot[] = [];
  const place = (b: CelestialBody, ox: number, oy: number, r: number) => {
    const a = b.initialAngle + b.orbitSpeed * time;
    const p = { x: ox + r * Math.cos(a), y: oy + r * Math.sin(a) };
    positions.set(b.id, p);
    return p;
  };
  for (const b of top) {
    const r = schematic(b.orbitRadius, outer, size);
    orbits.push({ id: b.id, r, belt: b.kind === 'BELT' });
    if (b.kind === 'BELT') {
      place(b, cx, cx, r);
      continue;
    }
    const p = place(b, cx, cx, r);
    dots.push({ id: b.id, ...p, r: b.kind === 'ASTEROID' ? 2.5 : 4, label: b.revealed === false ? (b.unknownName ?? b.name) : b.name, unknown: b.revealed === false });
  }
  for (const b of w.bodies.filter((x) => x.parentId && x.parentId !== star?.id)) {
    const parent = positions.get(b.parentId!);
    if (!parent) continue;
    const p = place(b, parent.x, parent.y, 10);
    dots.push({ id: b.id, ...p, r: 2.5, label: b.name, unknown: b.revealed === false });
  }
  return { orbits, dots, positions };
}
