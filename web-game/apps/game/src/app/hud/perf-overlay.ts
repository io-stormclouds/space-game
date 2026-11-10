import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { HudFrame } from '@space-game/ui';
import { GameService } from '../game/game.service';
import { PerfService } from '../game/perf';
import { TEXT } from '../i18n/pl';

const f1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString('pl-PL');
const int = (n: number) => Math.round(n).toLocaleString('pl-PL');

/**
 * Performance overlay (F2: simulation step time; F3/F4: frame time, draw calls, triangles, GPU; T4: triangles of
 * terrain, decor and structures, instances drawn — planet/system view only). Toggle: `.
 */
@Component({
  selector: 'wg-perf-overlay',
  imports: [HudFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section hudFrame class="perf" [label]="t.perf.tab" [ticks]="false" data-testid="perf-overlay">
      <dl>
        <div><dt>{{ t.perf.fps }}</dt><dd data-perf="fps">{{ f1(frames().fps) }}</dd></div>
        <div><dt>{{ t.perf.frame }}</dt><dd>{{ f1(frames().p50) }} / {{ f1(frames().p95) }} ms</dd></div>
        <div><dt>{{ t.perf.step }}</dt><dd data-perf="step">{{ step().mean }} / {{ step().max }} ms</dd></div>
        <div><dt>{{ t.perf.steps }}</dt><dd>{{ step().sps }}</dd></div>
        <div><dt>{{ t.perf.minutes }}</dt><dd>{{ step().mps }}</dd></div>
        @if (render(); as r) {
          <div><dt>{{ t.perf.view }}</dt><dd data-perf="view">{{ r.view ?? '—' }}</dd></div>
          <div><dt>{{ t.perf.calls }}</dt><dd data-perf="calls">{{ int(r.drawCalls) }}</dd></div>
          <div><dt>{{ t.perf.triangles }}</dt><dd data-perf="triangles">{{ int(r.triangles) }}</dd></div>
          <div><dt>{{ t.perf.gpu }}</dt><dd data-perf="gpu">{{ r.geometries }} / {{ r.textures }}</dd></div>
          <div><dt>{{ t.perf.contexts }}</dt><dd data-perf="contexts">{{ r.contexts }}</dd></div>
          @if (r.detail; as d) {
            <div><dt>{{ t.perf.terrain }}</dt><dd data-perf="terrain">{{ int(d.terrainTriangles) }}</dd></div>
            <div><dt>{{ t.perf.decor }}</dt><dd data-perf="decor">{{ int(d.decorTriangles) }}</dd></div>
            <div><dt>{{ t.perf.structures }}</dt><dd data-perf="structures">{{ int(d.structureTriangles) }}</dd></div>
            <div><dt>{{ t.perf.units }}</dt><dd data-perf="units">{{ int(d.unitTriangles) }}</dd></div>
            <div><dt>{{ t.perf.instances }}</dt><dd data-perf="instances">{{ int(d.instances) }}</dd></div>
          }
        }
      </dl>
    </section>
  `,
  styles: `
    .perf { position: absolute; left: var(--hud-space-6); bottom: var(--hud-space-6); width: 250px; padding: var(--hud-space-5); background: color-mix(in srgb, var(--hud-color-hull) 92%, transparent); }
    dl { margin: 0; display: grid; gap: 2px; }
    dl div { display: flex; justify-content: space-between; font-size: var(--hud-font-size-micro); letter-spacing: var(--hud-tracking-label); }
    dt { color: var(--hud-color-text-dim); text-transform: uppercase; }
    dd { margin: 0; font-weight: var(--hud-font-weight-bold); }
  `,
})
export class PerfOverlay {
  protected readonly t = inject(TEXT);
  private readonly game = inject(GameService);
  private readonly perf = inject(PerfService);
  protected readonly frames = this.perf.frames;
  protected readonly render = this.perf.render;
  protected readonly f1 = f1;
  protected readonly int = int;
  protected readonly step = computed(() => {
    const s = this.game.snapshot()?.stats;
    return { mean: f1(s?.meanMs ?? 0), max: f1(s?.maxMs ?? 0), sps: int(s?.stepsPerSecond ?? 0), mps: f1(s?.minutesPerSecond ?? 0) };
  });
}
