import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import type { ResourceReadout } from '@space-game/ui';
import { ResourcePanel } from '@space-game/ui';
import type { ViewKind } from '@space-game/render';
import { TEMPO_PRESETS } from '@space-game/api';
import { bodyName, clockText } from '../game/format';
import { GameService } from '../game/game.service';
import { UiState } from '../game/ui-state';
import { TEXT } from '../i18n/pl';

/** Codes always shown for a colony (canvas board "Kolonia"), then whatever else is stored. */
const COLONY_CODES = ['FER', 'SIL', 'KRI', 'KAR', 'STA', 'BET'];
const MAX_STOCKS = 7;

/** Top bar: clock and designation, resources, tempo, view switch (canvas boards 3–8). */
@Component({
  selector: 'wg-top-bar',
  imports: [ResourcePanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header hudResourcePanel [readouts]="readouts()" [designation]="designation()" [subline]="subline()">
      <div hudResbarTrail class="hud-resbar__trail trail">
        <div class="seg" role="group" [attr.aria-label]="t.hud.tempoGroup" [title]="t.hud.tempoHint">
          <button type="button" [attr.aria-pressed]="paused()" [attr.aria-label]="paused() ? t.hud.resume : t.hud.pause" (click)="game.togglePause()">II</button>
          @for (p of tempos; track p) {
            <button type="button" [attr.aria-pressed]="!paused() && tempo() === p" (click)="game.setTempo(p)">{{ t.hud.tempo(p) }}</button>
          }
        </div>
        <nav class="seg" [attr.aria-label]="t.hud.viewSwitch">
          @for (v of views; track v; let i = $index) {
            <button
              type="button"
              [attr.aria-current]="ui.view() === v ? 'page' : null"
              [disabled]="v === 'planet' && !planetReady()"
              [attr.aria-keyshortcuts]="i + 1"
              (click)="ui.view.set(v)"
            >
              {{ t.hud.views[v] }}
            </button>
          }
        </nav>
      </div>
    </header>
  `,
  styles: `
    .trail { display: flex; gap: var(--hud-space-5); padding: 0 var(--hud-space-5); align-items: center; }
  `,
})
export class TopBar {
  protected readonly t = inject(TEXT);
  protected readonly game = inject(GameService);
  protected readonly ui = inject(UiState);
  protected readonly tempos = TEMPO_PRESETS.filter((p) => p !== 10);
  protected readonly views: ViewKind[] = ['planet', 'system', 'galaxy', 'atanor'];
  protected readonly tempo = computed(() => this.game.snapshot()?.tempo ?? 60);
  protected readonly paused = computed(() => this.game.snapshot()?.paused ?? false);
  protected readonly planetReady = computed(() => !!this.game.world()?.colony.siteBodyId || this.game.snapshot()?.scenarioId === 'planeta-matka');

  /** Per-minute rates from consecutive snapshots (exponential smoothing). */
  private readonly rates = signal<Record<string, number>>({});
  private last: { time: number; stock: Readonly<Record<string, number>> } | null = null;

  constructor() {
    effect(() => {
      const snap = this.game.snapshot();
      const body = this.game.colonyBodyId();
      if (!snap || !body) return;
      const stock = snap.colonies[body]?.storage ?? {};
      const t = snap.world.time;
      if (this.last && t > this.last.time + 0.5) {
        const dt = t - this.last.time;
        const prev = this.rates();
        const next: Record<string, number> = {};
        for (const code of new Set([...Object.keys(stock), ...Object.keys(this.last.stock)])) {
          const r = ((stock[code] ?? 0) - (this.last.stock[code] ?? 0)) / dt;
          next[code] = 0.6 * r + 0.4 * (prev[code] ?? r);
        }
        this.rates.set(next);
        this.last = { time: t, stock };
      } else if (!this.last || t < this.last.time) {
        this.last = { time: t, stock };
      }
    });
  }

  protected readonly designation = computed(() => {
    const w = this.game.world();
    if (!w) return '—';
    const founded = w.colony.foundedAt !== null;
    if (founded || this.game.snapshot()?.scenarioId === 'planeta-matka') return this.t.hud.colonyOf(bodyName(w, this.game.colonyBodyId()));
    const star = w.bodies.find((b) => b.kind === 'STAR');
    return this.t.hud.systemOf(star?.name ?? '—');
  });

  protected readonly subline = computed(() => `${clockText(this.t, this.game.time())} · ${this.t.hud.perMin}`);

  protected readonly readouts = computed<ResourceReadout[]>(() => {
    const snap = this.game.snapshot();
    const cat = this.game.catalog();
    if (!snap) return [];
    const w = snap.world;
    // Short names like the canvas bar ("Beton regolitowy" → "Beton").
    const name = (code: string) => (cat?.materials.find((m) => m.id === code)?.name ?? code).split(' ')[0]!;
    const body = this.game.colonyBodyId();
    const colony = body ? snap.colonies[body] : undefined;
    const ark = w.ships.find((s) => s.role === 'MOTHERSHIP');
    if (!colony && ark) {
      return Object.entries(ark.cargo)
        .slice(0, MAX_STOCKS)
        .map(([code, value]) => ({ id: code, code, label: name(code), value }));
    }
    if (!colony) return [];
    const rates = this.rates();
    const codes = [...COLONY_CODES, ...Object.keys(colony.storage).filter((c) => !COLONY_CODES.includes(c))].slice(0, MAX_STOCKS);
    const stocks: ResourceReadout[] = codes.map((code) => ({
      id: code,
      code,
      label: name(code),
      value: Math.floor(colony.storage[code] ?? 0),
      ...(rates[code] !== undefined ? { rate: Math.round(rates[code]! * 10) / 10 } : {}),
      lowBelow: 20,
    }));
    return [
      ...stocks,
      { id: 'ENE', code: 'ENE', label: this.t.hud.energy, kind: 'load', value: round1(colony.power.consumed), max: round1(colony.power.produced), unit: 'MW' },
      { id: 'POP', code: 'POP', label: this.t.hud.crew, kind: 'load', value: round1(colony.crew.demand), max: round1(colony.crew.capacity) },
    ];
  });
}

const round1 = (n: number) => Math.round(n * 10) / 10;
