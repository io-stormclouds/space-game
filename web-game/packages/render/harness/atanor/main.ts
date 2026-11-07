// Visual harness of the Atanor view: `npx vite packages/render/harness/atanor --port 4432`.
// `?level=A_KAT` picks the level. Exposes `window.harness` for Playwright: controls, readout,
// switches galaxy ↔ atanor while counting live WebGL contexts (W13 A).
import { MockServer } from '@space-game/mock-server';
import { RenderHost } from '../../src/render-host';
import type { View, ViewInput, ViewKind } from '../../src/view';
import { createGalaxyView } from '../../src/galaxy';
import { isAtanorControls, loadAtanorView } from '../../src/atanor';

const contexts: WebGLRenderingContext[] = [];
const getContext = HTMLCanvasElement.prototype.getContext as (this: HTMLCanvasElement, id: string, opts?: unknown) => unknown;
Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
  value(this: HTMLCanvasElement, id: string, opts?: unknown) {
    const ctx = getContext.call(this, id, opts);
    if (ctx && (id === 'webgl' || id === 'webgl2') && !contexts.includes(ctx as WebGLRenderingContext)) contexts.push(ctx as WebGLRenderingContext);
    return ctx;
  },
});
const liveContexts = () => contexts.filter((c) => !c.isContextLost()).length;
let maxLive = 0;
const sample = () => (maxLive = Math.max(maxLive, liveContexts()));

const stage = document.getElementById('stage')!;
const readoutEl = document.getElementById('readout')!;
const buttons = document.getElementById('buttons')!;
const params = new URLSearchParams(location.search);
const server = new MockServer();
const host = new RenderHost(stage, { views: { atanor: () => loadAtanorView(), galaxy: () => createGalaxyView() } });
const input: ViewInput = {
  snapshot: server.snapshot(),
  frame: null,
  focusBodyId: null,
  selection: { kind: 'NONE' },
  hover: null,
  placement: null,
  atanorLevel: params.get('level') ?? 'A_NAD',
};

const currentView = () => (host as unknown as { view: View | null }).view;
const controls = () => {
  const v = currentView();
  return isAtanorControls(v) ? v : null;
};

function button(label: string, run: () => void): void {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', run);
  buttons.appendChild(b);
}
button('▶ play', () => controls()?.play());
button('❚❚ pause', () => controls()?.pause());
button('step', () => controls()?.step());
button('reset', () => controls()?.reset());
button('1 t/s', () => controls()?.setTicksPerSecond(1));
button('1.67 t/s', () => controls()?.setTicksPerSecond(1000 / 600));
button('8 t/s', () => controls()?.setTicksPerSecond(8));
button('60 t/s', () => controls()?.setTicksPerSecond(60));
for (const id of ['A_NAD', 'A_KAT', 'L1', 'L2', 'L3', 'L4']) button(id, () => (input.atanorLevel = id));
button('galaktyka', () => void host.setView('galaxy'));
button('atanor', () => void host.setView('atanor'));
window.addEventListener('resize', () => host.resize());

let last = performance.now();
function loop(t: number): void {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  host.update(input, dt);
  sample();
  const c = controls();
  const s = host.stats();
  const stats = `view ${s.view} · draw ${s.drawCalls} · tri ${s.triangles} · tex ${s.textures} · ctx ${s.contexts} (live ${liveContexts()}, max ${maxLive})`;
  if (c) {
    const r = c.readout();
    readoutEl.textContent = [
      stats,
      '',
      `${r.levelName}`,
      `${r.recipeId ?? r.levelId} · ${r.kind}${r.buildingLevel ? ` · budynek L${r.buildingLevel}` : ''}`,
      `${r.playing ? 'PRACA' : 'PAUZA'} · ${r.ticksPerSecond.toFixed(2)} t/s`,
      `CYKLE ${r.ticks} · głowica ${r.timelinePosition}`,
      `DOSTARCZONE ${r.delivered} / ${r.target}${r.completed ? ` · cel w ${r.completedAtTick}` : ''}`,
      `cykle/szt. ${r.cyclesPerOutput ?? '—'} · obszar ${r.area} (${r.areaSoFar}) · ramiona ${r.arms}`,
      `dokument §8.3: ${r.docReference ? `${r.docReference.cycles} / ${r.docReference.area} / ${r.docReference.arms}` : '—'}`,
      `produkty ${JSON.stringify(r.produced)}`,
      `zużycie ${JSON.stringify(r.consumed)}`,
      r.jam ? `JAM ${r.jam.reason}: ${r.jam.message}` : 'JAM —',
    ].join('\n');
  } else {
    readoutEl.textContent = stats;
  }
  requestAnimationFrame(loop);
}

const harness = {
  host,
  input,
  ready: host.setView('atanor').then(() => {
    sample();
    requestAnimationFrame(loop);
  }),
  controls,
  liveContexts,
  maxLive: () => maxLive,
  contextsCreated: () => contexts.length,
  stats: () => ({ ...host.stats(), liveContexts: liveContexts(), maxLive }),
  /** Galaxy ↔ Atanor `n` times, one frame each; returns the most live contexts seen. */
  async switchCycles(n: number, order: ViewKind[] = ['galaxy', 'atanor']) {
    for (let i = 0; i < n; i++) {
      for (const kind of order) {
        await host.setView(kind);
        sample();
        host.update(input, 1 / 60);
        sample();
      }
    }
    return maxLive;
  },
  canvases: () => stage.querySelectorAll('canvas').length,
};

(window as unknown as { harness: typeof harness }).harness = harness;
