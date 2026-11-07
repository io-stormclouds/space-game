import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { niceTicks, num, timeLabel } from './series';

export interface ChartSeries {
  id: string;
  label: string;
  /** Slot of the validated chart palette (`--wg-chart-1`, `--wg-chart-2`). */
  slot: 1 | 2;
  /** [game time in minutes, value]. */
  points: ReadonlyArray<readonly [number, number]>;
}

const M = { top: 10, right: 12, bottom: 20, left: 44 };

/**
 * Line chart over game time (F6 flows). One y-axis from 0; 2 px lines; an end dot with a surface
 * ring; a crosshair with a tooltip on hover and on arrow keys; a legend for two series; the numbers
 * as a table under "Tabela". Colours: `--wg-chart-*` tokens (validated on the panel surface).
 */
@Component({
  selector: 'wg-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="chart" [attr.data-chart]="name()">
      <figcaption class="head">
        <span class="k">{{ title() }}</span>
        @if (series().length > 1) {
          <span class="legend">
            @for (s of series(); track s.id) {
              <span class="key"><i [class]="'sw sw--' + s.slot"></i>{{ s.label }}</span>
            }
          </span>
        }
      </figcaption>
      @if (empty()) {
        <p class="dim none">{{ emptyText() }}</p>
      } @else {
        <div class="plot" tabindex="0" role="img" [attr.aria-label]="ariaLabel()" (keydown)="key($event)" (blur)="hover.set(null)">
          <svg [attr.viewBox]="'0 0 ' + width() + ' ' + height()" (pointermove)="move($event)" (pointerleave)="hover.set(null)">
            @for (t of yTicks(); track t.v) {
              <line class="grid" [attr.x1]="m.left" [attr.x2]="width() - m.right" [attr.y1]="t.y" [attr.y2]="t.y" />
              <text class="tick" [attr.x]="m.left - 6" [attr.y]="t.y + 3" text-anchor="end">{{ t.label }}</text>
            }
            @for (t of xTicks(); track t.x) {
              <text class="tick" [attr.x]="t.x" [attr.y]="height() - 5" [attr.text-anchor]="t.anchor">{{ t.label }}</text>
            }
            @for (s of paths(); track s.id) {
              <path [class]="'line line--' + s.slot" [attr.d]="s.d" />
              <circle [class]="'dot dot--' + s.slot" [attr.cx]="s.end[0]" [attr.cy]="s.end[1]" r="4" />
            }
            @if (cross(); as c) {
              <line class="cross" [attr.x1]="c.x" [attr.x2]="c.x" [attr.y1]="m.top" [attr.y2]="height() - m.bottom" />
              @for (p of c.points; track p.id) {
                <circle [class]="'dot dot--' + p.slot" [attr.cx]="c.x" [attr.cy]="p.y" r="4" />
              }
            }
          </svg>
          @if (cross(); as c) {
            <div class="tip" [style.left.%]="c.leftPct" [class.tip--left]="c.leftPct > 60">
              <div class="dim">{{ c.time }}</div>
              @for (p of c.points; track p.id) {
                <div class="row">
                  <i [class]="'sw sw--' + p.slot"></i><span>{{ p.label }}</span><b>{{ p.value }}</b>
                </div>
              }
            </div>
          }
        </div>
        <details class="table">
          <summary class="k">Tabela</summary>
          <table>
            <thead>
              <tr>
                <th>Czas</th>
                @for (s of series(); track s.id) {
                  <th>{{ s.label }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.t) {
                <tr>
                  <td>{{ r.time }}</td>
                  @for (v of r.values; track $index) {
                    <td>{{ v }}</td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </details>
      }
    </figure>
  `,
  styles: `
    .chart { margin: 0; display: grid; gap: 4px; min-width: 0; }
    .head { display: flex; justify-content: space-between; gap: var(--hud-space-4); align-items: baseline; font-size: var(--hud-font-size-micro); }
    .legend { display: flex; gap: var(--hud-space-4); color: var(--hud-color-text-dim); }
    .key { display: inline-flex; gap: 6px; align-items: center; }
    .sw { display: inline-block; width: 12px; height: 2px; }
    .sw--1 { background: var(--wg-chart-1); }
    .sw--2 { background: var(--wg-chart-2); }
    .plot { position: relative; }
    .plot:focus-visible { outline: 2px solid var(--hud-color-signal); outline-offset: 2px; }
    svg { display: block; width: 100%; height: auto; overflow: visible; }
    .grid { stroke: var(--hud-color-line-faint); stroke-width: 1; }
    .tick { fill: var(--hud-color-text-faint); font-size: 10px; font-variant-numeric: tabular-nums; }
    .line { fill: none; stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; vector-effect: non-scaling-stroke; }
    .line--1 { stroke: var(--wg-chart-1); }
    .line--2 { stroke: var(--wg-chart-2); }
    .dot { stroke: var(--hud-color-hull); stroke-width: 2; }
    .dot--1 { fill: var(--wg-chart-1); }
    .dot--2 { fill: var(--wg-chart-2); }
    .cross { stroke: var(--hud-color-metal); stroke-width: 1; }
    .tip { position: absolute; top: 0; transform: translateX(8px); min-width: 120px; padding: 6px 8px; background: var(--hud-color-graphite); border: 1px solid var(--hud-color-line); font-size: var(--hud-font-size-micro); pointer-events: none; z-index: 1; }
    .tip--left { transform: translateX(calc(-100% - 8px)); }
    .row { display: grid; grid-template-columns: 12px 1fr auto; gap: 6px; align-items: center; }
    .none { margin: 0; font-size: var(--hud-font-size-label); }
    .table summary { cursor: pointer; font-size: var(--hud-font-size-micro); }
    .table table { width: 100%; border-collapse: collapse; font-size: var(--hud-font-size-micro); font-variant-numeric: tabular-nums; }
    .table th, .table td { text-align: right; padding: 2px 4px; border-bottom: 1px solid var(--hud-color-line-faint); }
    .table th:first-child, .table td:first-child { text-align: left; }
  `,
})
export class LineChart {
  readonly title = input.required<string>();
  readonly series = input.required<ReadonlyArray<ChartSeries>>();
  /** Stable name for tests (`data-chart`). */
  readonly name = input<string>('');
  readonly unit = input<string>('');
  readonly width = input(540);
  readonly height = input(150);
  readonly emptyText = input('Za maÅ‚o prÃ³bek.');

  protected readonly m = M;
  protected readonly hover = signal<number | null>(null);

  protected readonly empty = computed(() => (this.series()[0]?.points.length ?? 0) < 2);
  private readonly xs = computed(() => this.series()[0]?.points.map((p) => p[0]) ?? []);
  private readonly domain = computed(() => {
    const xs = this.xs();
    const max = Math.max(0, ...this.series().flatMap((s) => s.points.map((p) => p[1])));
    const ticks = niceTicks(max);
    return { x0: xs[0] ?? 0, x1: xs[xs.length - 1] ?? 1, y1: ticks[ticks.length - 1]!, ticks };
  });
  private sx(t: number): number {
    const d = this.domain();
    return M.left + ((t - d.x0) / Math.max(1e-9, d.x1 - d.x0)) * (this.width() - M.left - M.right);
  }
  private sy(v: number): number {
    const d = this.domain();
    return this.height() - M.bottom - (v / d.y1) * (this.height() - M.top - M.bottom);
  }

  protected readonly yTicks = computed(() => this.domain().ticks.map((v) => ({ v, y: this.sy(v), label: compact(v) })));
  protected readonly xTicks = computed(() => {
    const d = this.domain();
    return [
      { x: this.sx(d.x0), label: timeLabel(d.x0), anchor: 'start' },
      { x: this.sx(d.x1), label: timeLabel(d.x1), anchor: 'end' },
    ];
  });
  protected readonly paths = computed(() =>
    this.series().map((s) => {
      const pts = s.points.map(([t, v]) => [this.sx(t), this.sy(v)] as const);
      return { id: s.id, slot: s.slot, d: 'M' + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join('L'), end: pts[pts.length - 1] ?? [0, 0] };
    }),
  );
  protected readonly cross = computed(() => {
    const i = this.hover();
    if (i === null) return null;
    const t = this.xs()[i];
    if (t === undefined) return null;
    const x = this.sx(t);
    return {
      x,
      leftPct: (x / this.width()) * 100,
      time: timeLabel(t),
      points: this.series().map((s) => ({ id: s.id, slot: s.slot, label: s.label, y: this.sy(s.points[i]?.[1] ?? 0), value: `${num(s.points[i]?.[1])}${this.unit() ? ' ' + this.unit() : ''}` })),
    };
  });
  protected readonly rows = computed(() => {
    const xs = this.xs();
    const from = Math.max(0, xs.length - 24);
    return xs.slice(from).map((t, k) => ({ t, time: timeLabel(t), values: this.series().map((s) => num(s.points[from + k]?.[1])) }));
  });
  protected readonly ariaLabel = computed(() => {
    const last = this.series().map((s) => `${s.label}: ${num(s.points[s.points.length - 1]?.[1])}${this.unit() ? ' ' + this.unit() : ''}`);
    return `${this.title()}. Ostatnio ${last.join(', ')}. StrzaÅ‚ki przesuwajÄ… odczyt.`;
  });

  protected move(e: PointerEvent): void {
    const svg = e.currentTarget as SVGSVGElement;
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * this.width();
    const xs = this.xs();
    let best = 0;
    for (let i = 1; i < xs.length; i++) if (Math.abs(this.sx(xs[i]!) - x) < Math.abs(this.sx(xs[best]!) - x)) best = i;
    this.hover.set(best);
  }

  protected key(e: KeyboardEvent): void {
    const n = this.xs().length;
    if (!n || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    e.stopPropagation();
    const i = this.hover() ?? n - 1;
    this.hover.set(Math.max(0, Math.min(n - 1, i + (e.key === 'ArrowRight' ? 1 : -1))));
  }
}

/** Axis labels: in full under 10 000, then "12 tys.". */
function compact(v: number): string {
  return v >= 10_000 ? `${num(v / 1000)} tys.` : num(v);
}
