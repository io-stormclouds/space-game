// Visual harness of the galaxy view: `npx vite packages/render/harness/galaxy --port 4432`.
// Exposes `window.harness` for Playwright (selection, stats, mount/dispose cycles).
import { MockServer } from '@space-game/mock-server';
import type { ScenarioId } from '@space-game/api';
import { PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { RenderHost } from '../../src/render-host';
import type { View, ViewContext, ViewInput } from '../../src/view';
import { STARS } from '@space-game/domain';
import { GalaxyView, createGalaxyView, starScenePosition } from '../../src/galaxy';

// Live WebGL contexts (W13 A: never more than one).
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

/** Stand-in for another Three.js view: renders an empty scene (for switch cycles). */
function emptyView(): View {
  let renderer: WebGLRenderer | null = null;
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  return {
    kind: 'planet',
    usesThree: true,
    mount(ctx: ViewContext) {
      renderer = ctx.three;
    },
    update() {
      renderer?.render(scene, camera);
    },
    pick: () => ({ kind: 'EMPTY' }),
    resize() {},
    dispose() {
      renderer = null;
    },
  };
}

const stage = document.getElementById('stage')!;
const hud = document.getElementById('hud')!;
const server = new MockServer();
const host = new RenderHost(stage, { views: { galaxy: () => createGalaxyView(), planet: emptyView } });
const input: ViewInput = {
  snapshot: server.snapshot(),
  frame: null,
  focusBodyId: null,
  selection: { kind: 'NONE' },
  hover: null,
  placement: null,
};

const three = () => (host as unknown as { three: WebGLRenderer | null }).three;
const currentView = () => (host as unknown as { view: View | null }).view;
const galaxy = () => {
  const v = currentView();
  return v instanceof GalaxyView ? v : null;
};

function frame(): void {
  host.update(input, 1 / 60);
}

// Pointer: hover and click-to-select (a drag of more than 4 px rotates instead).
let down: { x: number; y: number } | null = null;
stage.addEventListener('pointerdown', (e) => (down = { x: e.offsetX, y: e.offsetY }));
stage.addEventListener('pointermove', (e) => {
  const r = stage.getBoundingClientRect();
  const hit = host.pick(e.clientX - r.left, e.clientY - r.top, input);
  input.hover = hit.kind === 'STAR' ? hit : null;
});
stage.addEventListener('pointerup', (e) => {
  const r = stage.getBoundingClientRect();
  const x = e.clientX - r.left;
  const y = e.clientY - r.top;
  if (down && Math.hypot(x - down.x, y - down.y) <= 4) {
    const hit = host.pick(x, y, input);
    input.selection = hit.kind === 'STAR' ? { kind: 'STAR', starName: hit.starName } : { kind: 'NONE' };
  }
  down = null;
});
window.addEventListener('resize', () => host.resize());

let last = performance.now();
let fps = 0;
function loop(t: number): void {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  fps = fps * 0.95 + (dt > 0 ? 1 / dt : 0) * 0.05;
  host.update(input, dt);
  const s = host.stats();
  const sel = input.selection.kind === 'STAR' ? input.selection.starName : '—';
  hud.textContent = `view ${s.view} · draw ${s.drawCalls} · tri ${s.triangles} · geo ${s.geometries} · tex ${s.textures} · ctx ${liveContexts()} · ${fps.toFixed(0)} fps\nselection ${sel}`;
  requestAnimationFrame(loop);
}

const harness = {
  host,
  input,
  ready: host.setView('galaxy').then(() => requestAnimationFrame(loop)),
  frame,
  galaxy,
  liveContexts,
  select(name: string | null) {
    input.selection = name ? { kind: 'STAR', starName: name } : { kind: 'NONE' };
  },
  hover(name: string | null) {
    input.hover = name ? { kind: 'STAR', starName: name } : null;
  },
  /** Scene position [ly] of a catalogue star. */
  positionOf(name: string) {
    const s = STARS.find((x) => x.name === name);
    return s ? starScenePosition(s) : null;
  },
  scenario(id: ScenarioId) {
    input.snapshot = server.start(id);
  },
  stats() {
    const r = three();
    return { ...host.stats(), programs: r?.info.programs?.length ?? 0, memory: r ? { ...r.info.memory } : null, liveContexts: liveContexts() };
  },
  /** Switches galaxy → empty view → galaxy `n` times, rendering a frame in each. */
  async cycle(n: number) {
    for (let i = 0; i < n; i++) {
      await host.setView('planet');
      frame();
      await host.setView('galaxy');
      frame();
    }
  },
  /** Mount/dispose of fresh galaxy views directly on the shared renderer. */
  async directCycles(n: number) {
    const r = three();
    if (!r) throw new Error('no renderer');
    for (let i = 0; i < n; i++) {
      const v = createGalaxyView();
      await v.mount({ container: stage, three: r, assetsBase: 'assets/', width: stage.clientWidth, height: stage.clientHeight });
      v.update(input, 1 / 60);
      v.dispose();
    }
  },
};

(window as unknown as { harness: typeof harness }).harness = harness;
