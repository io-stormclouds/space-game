import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import type { NominalFlows } from '@space-game/api';
import { GameService } from '../game/game.service';
import { TEXT } from '../i18n/pl';
import { LineChart, type ChartSeries } from './line-chart';
import { diffPct, num, pct } from './series';
import { Telemetry } from './telemetry';

/** Colony codes in the order of the top bar, then the rest. */
const ORDER = ['FER', 'SIL', 'KRI', 'KAR', 'STA', 'BET'];
const MAX_STOCK_CHARTS = 6;
const KINDS = ['extraction', 'production', 'consumption'] as const;

/** Storage, power and crew over game time, and document vs measured rates per material. */
@Component({
  selector: 'wg-designer-flows',
  imports: [LineChart],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!hasColony()) {
      <p class="note">{{ t.noColony }}</p>
    } @else {
      <p class="note" data-flows-window>{{ t.window(tm.measured().window, tm.interval()) }} · {{ efficiency() }}</p>
      <wg-line-chart name="power" [title]="t.power" unit="MW" [series]="power()" />
      <wg-line-chart name="crew" [title]="t.crew" [series]="crew()" [height]="120" />
      <div class="k">{{ t.storage }}</div>
      <div class="multiples">
        @for (s of stock(); track s.id) {
          <wg-line-chart [name]="'stock-' + s.id" [title]="s.label" [series]="[s]" [width]="260" [height]="110" />
        }
      </div>
      <div class="k">{{ t.rates }}</div>
      <p class="note">{{ t.ratesNote }}</p>
      <table class="dtable" data-table="rates">
        <thead>
          <tr><th class="l">{{ h.material }}</th><th class="l">{{ h.kind }}</th><th>{{ h.doc }}</th><th>{{ h.measured }}</th><th>{{ h.diff }}</th></tr>
        </thead>
        <tbody>
          @for (r of rates(); track r.key) {
            <tr>
              <td class="l">{{ r.material }}</td><td class="l name">{{ t.kinds[r.kind] }}</td><td>{{ fmt(r.doc) }}</td><td>{{ fmt(r.measured) }}</td><td [class]="r.cls">{{ r.diff }}</td>
            </tr>
          } @empty {
            <tr><td class="l" colspan="5">{{ t.noRates }}</td></tr>
          }
        </tbody>
      </table>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: var(--hud-space-4); }
    .multiples { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--hud-space-4) var(--hud-space-5); }
    .k { font-size: var(--hud-font-size-micro); }
  `,
})
export class DesignerFlows {
  protected readonly t = inject(TEXT).designer.flows;
  protected readonly h = this.t.head;
  private readonly game = inject(GameService);
  protected readonly tm = inject(Telemetry);
  protected readonly fmt = num;
  private readonly nominal = signal<NominalFlows | null>(null);
  private lastFetch = 0;

  protected readonly hasColony = computed(() => !!this.game.colonyBodyId() && this.tm.samples().length > 0);

  constructor() {
    // document rates of the current buildings, refreshed with the samples but at most once a second
    let alive = true;
    inject(DestroyRef).onDestroy(() => (alive = false));
    effect(() => {
      this.tm.measured();
      const body = this.game.colonyBodyId();
      if (!body) return;
      untracked(() => {
        const now = performance.now();
        if (now - this.lastFetch < 1000 && this.nominal()) return;
        this.lastFetch = now;
        void this.game.nominalFlows(body).then((n) => alive && this.nominal.set(n));
      });
    });
  }

  protected readonly power = computed<ChartSeries[]>(() => {
    const s = this.tm.samples();
    return [
      { id: 'produced', label: this.t.produced, slot: 1, points: s.map((x) => [x.t, x.powerProduced] as const) },
      { id: 'consumed', label: this.t.consumed, slot: 2, points: s.map((x) => [x.t, x.powerConsumed] as const) },
    ];
  });

  protected readonly crew = computed<ChartSeries[]>(() => {
    const s = this.tm.samples();
    return [
      { id: 'capacity', label: this.t.capacity, slot: 1, points: s.map((x) => [x.t, x.crewCapacity] as const) },
      { id: 'demand', label: this.t.demand, slot: 2, points: s.map((x) => [x.t, x.crewDemand] as const) },
    ];
  });

  protected readonly stock = computed<ChartSeries[]>(() => {
    const s = this.tm.samples();
    const last = s[s.length - 1]?.stock ?? {};
    const codes = [...ORDER.filter((c) => c in last), ...Object.keys(last).filter((c) => !ORDER.includes(c)).sort()].slice(0, MAX_STOCK_CHARTS);
    const names = new Map((this.game.catalog()?.materials ?? []).map((m) => [m.id, m.name]));
    return codes.map((code) => ({ id: code, label: `${code} · ${names.get(code) ?? ''}`, slot: 1, points: s.map((x) => [x.t, x.stock[code] ?? 0] as const) }));
  });

  protected readonly efficiency = computed(() => {
    const e = this.nominal()?.efficiency;
    const p = (v: number | undefined) => (v === undefined ? '—' : `${Math.round(v * 100)}%`);
    return this.t.efficiency(p(e?.[1]), p(e?.[2]), p(e?.[3]));
  });

  protected readonly rates = computed(() => {
    const n = this.nominal();
    const m = this.tm.measured();
    if (!n) return [];
    const rows = [];
    for (const kind of KINDS) {
      const ids = new Set([...Object.keys(n[kind]), ...Object.keys(m[kind])]);
      for (const material of [...ids].sort()) {
        const doc = n[kind][material] ?? 0;
        const measured = m[kind][material] ?? 0;
        const p = diffPct(doc, measured);
        rows.push({ key: `${kind}-${material}`, kind, material, doc, measured, diff: pct(p), cls: p === null || Math.abs(p) < 2 ? '' : p > 0 ? 'up' : 'down' });
      }
    }
    return rows;
  });
}
