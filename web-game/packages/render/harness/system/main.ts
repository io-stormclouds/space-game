// Visual harness of the planet/system view: `npx vite packages/render/harness/system --port 4431`.
// Plays the canvas flow on Tau Ceti in the page (MockServer in-thread), renders it through
// RenderHost and exposes `window.systemHarness` for Playwright (kinds, stats, mount/dispose cycles).
import { MockServer } from '@space-game/mock-server';
import type { FrameData, GameSnapshot } from '@space-game/api';
import {
  ARK_ID,
  TC_E,
  footprintTiles,
  standingStructure,
  storageOf,
  tileIndexOf,
  type BodyId,
  type Command,
  type Structure,
  type WorldState,
} from '@space-game/domain';
import { PerspectiveCamera, Scene, type WebGLRenderer } from 'three';
import { RenderHost } from '../../src/render-host';
import type { PickResult, View, ViewContext, ViewInput, ViewKind } from '../../src/view';
import { CLICK_THRESHOLD_PX, HOVER_INTERVAL_MS, SystemView, createSystemView } from '../../src/system';

const stage = document.getElementById('stage')!;
const hud = document.getElementById('hud')!;

// ---------------------------------------------------------------- the game: canvas flow on Tau Ceti

const server = new MockServer();
server.start('tau-ceti', undefined, 60);
const sim = server.simulation;

function ok(cmd: Command): void {
  const r = server.command(cmd);
  const rejected = r.events.find((e) => e.type === 'COMMAND_REJECTED');
  if (rejected) console.warn(`${cmd.type} rejected`, rejected);
}

function runUntil(pred: () => boolean, maxMinutes: number): void {
  const start = sim.time;
  while (!pred() && sim.time - start < maxMinutes) sim.step(0.25);
}

function freeTile(world: WorldState, body: BodyId, material?: string): string | null {
  const grid = sim.grids.get(body)!;
  const used = new Set(world.structures.flatMap((s) => s.tiles));
  const t = grid.tiles.find((x) => !used.has(x.id) && x.neighbors.length === 6 && (material ? x.deposit?.resource === material : !x.deposit));
  return t?.id ?? null;
}

/** The first session of the canvas (simulation.spec `playFirstSession`), stopped with sites in progress. */
function playColony(): void {
  ok({ type: 'SCAN_SYSTEM', shipId: ARK_ID });
  runUntil(() => sim.world.scan.state === 'DONE', 30);
  ok({ type: 'CHOOSE_COLONY_SITE', bodyId: TC_E });
  ok({ type: 'MOVE_SHIP', shipId: ARK_ID, to: TC_E });
  runUntil(() => sim.world.ships[0]!.state === 'DOCKED', 60);
  const grid = sim.grids.get(TC_E)!;
  const anchor = grid.tiles.find((t) => t.neighbors.length === 6 && [t.index, ...t.neighbors].every((i) => !grid.tiles[i]!.deposit))!;
  ok({ type: 'PLACE_SPACEPORT', bodyId: TC_E, tileId: anchor.id });
  runUntil(() => sim.world.colony.foundedAt !== null, 60);
  ok({ type: 'CALL_SHUTTLE', bodyId: TC_E, cargo: { FER: 150, SIL: 80, KRI: 20 } });
  runUntil(() => (storageOf(sim.world, TC_E)['FER'] ?? 0) >= 150, 30);
  for (const [kind, material] of [['WND'], ['HAB'], ['MIN', 'FER'], ['ICE', 'KRI'], ['SIT', 'SIL'], ['LAND']] as Array<[string, string?]>) {
    const tile = freeTile(sim.world, TC_E, material);
    if (tile) ok({ type: 'BUILD', bodyId: TC_E, tileId: tile as never, kind });
  }
  sim.step(1); // rovers on their way: some sites PLANNED, one CONSTRUCTING
  runUntil(() => sim.world.structures.some((s) => s.state === 'CONSTRUCTING'), 10);
}
// ?arrival: the scenario start (unknown objects before the scan); default: a colony being built
const arrival = new URLSearchParams(location.search).has('arrival');
if (!arrival) playColony();

/** Optional extra standing buildings, render-only, to measure a larger colony (M). */
let extra: Structure[] = [];
function stress(n: number): number {
  const world = sim.world;
  const grid = sim.grids.get(TC_E)!;
  const used = new Set(world.structures.flatMap((s) => s.tiles.map(tileIndexOf)));
  const kinds = ['SOL', 'WND', 'HAB', 'DEP', 'MIN', 'TNK', 'SKL', 'SMT', 'CON', 'FARM', 'LAND', 'GAR'];
  extra = [];
  for (const t of grid.tiles) {
    if (extra.length >= n) break;
    const kind = kinds[extra.length % kinds.length]!;
    const size = kind === 'SMT' ? 3 : 1;
    const tiles = footprintTiles(grid, t.index, size, 0);
    if (!tiles || tiles.some((i) => used.has(i))) continue;
    tiles.forEach((i) => used.add(i));
    extra.push({ ...standingStructure(kind, TC_E, tiles), id: `X${extra.length}:${kind}` });
  }
  pushSnapshot();
  return extra.length;
}

// ---------------------------------------------------------------- view input

let snapshot: GameSnapshot = server.snapshot();
let frame: FrameData = server.frame();
function pushSnapshot(): void {
  const s = server.snapshot();
  snapshot = extra.length ? { ...s, world: { ...s.world, structures: [...s.world.structures, ...extra] } } : s;
  input.snapshot = snapshot;
}

const input: ViewInput = {
  snapshot,
  frame,
  focusBodyId: arrival ? null : TC_E,
  selection: { kind: 'NONE' },
  hover: null,
  placement: null,
};

// ---------------------------------------------------------------- host

/** Stand-in for another Three.js view (the galaxy), to cycle mount / dispose through the host. */
function emptyView(): View {
  let renderer: WebGLRenderer | null = null;
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  return {
    kind: 'galaxy',
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

let systemView: SystemView | null = null;
const host = new RenderHost(stage, {
  assetsBase: '/assets/',
  views: {
    planet: () => (systemView = createSystemView() as SystemView),
    system: () => (systemView = createSystemView() as SystemView),
    galaxy: emptyView,
  },
});
const ready = host.setView('planet').then(() => systemView!.ready);

// ---------------------------------------------------------------- loop

let paused = false;
let last = performance.now();
let lastSnap = 0;
let fps = 0;
function tick(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  fps = fps * 0.95 + (dt > 0 ? 1 / dt : 0) * 0.05;
  if (!paused) {
    server.advance(dt);
    frame = server.frame();
    input.frame = frame;
    if (now - lastSnap > 100) {
      lastSnap = now;
      pushSnapshot();
    }
  }
  host.update(input, dt);
  const st = host.stats();
  hud.textContent =
    `WIDOK ${st.view ?? '—'}   DRAW ${st.drawCalls}   TRÓJKĄTY ${st.triangles}   GEOM ${st.geometries}   TEKST ${st.textures}   KONTEKSTY ${st.contexts}   ${fps.toFixed(0)} FPS\n` +
    `CZAS ${frame.time.toFixed(1)} min   ZAZNACZENIE ${describe(input.selection)}   KURSOR ${input.hover ? describe(input.hover) : '—'}`;
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

function describe(p: PickResult | ViewInput['selection']): string {
  switch (p.kind) {
    case 'TILE':
      return `TILE ${p.bodyId}:${p.tileIndex}`;
    case 'STRUCTURE':
      return `STRUCTURE ${p.structureId}`;
    case 'SHIP':
      return `SHIP ${p.shipId}`;
    case 'ROVER':
      return `ROVER ${p.roverId}`;
    case 'BODY':
      return `BODY ${p.bodyId}`;
    default:
      return p.kind;
  }
}

// ---------------------------------------------------------------- pointer (app's job; shown here as an example)

let down: { x: number; y: number } | null = null;
let lastHover = 0;
let placing = false;
const local = (e: PointerEvent) => {
  const r = stage.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};
stage.addEventListener('pointerdown', (e) => (down = local(e)));
stage.addEventListener('pointerup', (e) => {
  const p = local(e);
  const d = down;
  down = null;
  if (!d || Math.hypot(p.x - d.x, p.y - d.y) > CLICK_THRESHOLD_PX || e.button !== 0) return;
  const r = host.pick(p.x, p.y, input);
  input.selection = toSelection(r);
});
stage.addEventListener('pointermove', (e) => {
  if (down) return; // dragging the camera
  const now = performance.now();
  if (now - lastHover < HOVER_INTERVAL_MS) return;
  lastHover = now;
  const p = local(e);
  const r = host.pick(p.x, p.y, input);
  input.hover = r.kind === 'EMPTY' ? null : r;
  updatePlacement();
});
window.addEventListener('keydown', (e) => {
  if (e.key === '1') void host.setView('planet');
  if (e.key === '2') void host.setView('system');
  if (e.key === 'f' && input.selection.kind === 'BODY') input.focusBodyId = input.selection.bodyId;
  if (e.key === 'p') {
    placing = !placing;
    updatePlacement();
  }
  if (e.key === 'Escape') {
    input.selection = { kind: 'NONE' };
    placing = false;
    updatePlacement();
  }
  if (e.key === ' ') paused = !paused;
});

function updatePlacement(): void {
  const h = input.hover;
  if (!placing || !h || (h.kind !== 'TILE' && h.kind !== 'STRUCTURE') || h.bodyId !== input.focusBodyId) {
    input.placement = null;
    return;
  }
  const grid = sim.grids.get(h.bodyId)!;
  const tiles = footprintTiles(grid, h.tileIndex, 3, 0) ?? [];
  const used = new Set(snapshot.world.structures.filter((s) => s.bodyId === h.bodyId).flatMap((s) => s.tiles.map(tileIndexOf)));
  input.placement = { kind: 'HQ', tiles, valid: tiles.length === 3 && tiles.every((i) => !used.has(i)) };
}

function toSelection(r: PickResult): ViewInput['selection'] {
  switch (r.kind) {
    case 'TILE':
      return { kind: 'TILE', bodyId: r.bodyId, tileIndex: r.tileIndex };
    case 'STRUCTURE':
      return { kind: 'STRUCTURE', structureId: r.structureId };
    case 'SHIP':
      return { kind: 'SHIP', shipId: r.shipId };
    case 'ROVER':
      return { kind: 'ROVER', roverId: r.roverId };
    case 'BODY':
      return { kind: 'BODY', bodyId: r.bodyId };
    default:
      return { kind: 'NONE' };
  }
}

window.addEventListener('resize', () => host.resize());

// ---------------------------------------------------------------- Playwright hooks

const systemHarness = {
  host,
  input,
  ready,
  sim,
  view: () => systemView,
  setKind: (k: ViewKind) => host.setView(k),
  stats: () => host.stats(),
  pause: (p: boolean) => {
    paused = p;
  },
  stress,
  /** Sends a ship of the colony somewhere (flight path overlay). */
  fly: (to: string) => ok({ type: 'MOVE_SHIP', shipId: ARK_ID, to: to as BodyId }),
  select: (s: ViewInput['selection']) => {
    input.selection = s;
  },
  focus: (id: string | null) => {
    input.focusBodyId = id as BodyId | null;
  },
  placement: (p: ViewInput['placement']) => {
    input.placement = p;
  },
  pick: (x: number, y: number) => host.pick(x, y, input),
  /** Screen position of a body / unit / structure part of the live scene. */
  screenOf: (id: string) => systemView?.internals?.screenOf(id as BodyId) ?? systemView?.internals?.screenOfUnit(id) ?? null,
  structureScreen: (structureId: string) => {
    const s = snapshot.world.structures.find((x) => x.id === structureId);
    const scene = systemView?.internals;
    const part = s && scene?.bodyParts(s.bodyId)?.structures?.partsOf(structureId)[0];
    return part && s ? scene!.screenOfLocal(s.bodyId, part.center) : null;
  },
  /** Mount / dispose `n` times through the host (system ↔ stand-in view); returns GPU counters. */
  async cycles(n: number) {
    const counters: Array<{ geometries: number; textures: number }> = [];
    for (let i = 0; i < n; i++) {
      await host.setView('galaxy');
      host.update(input, 1 / 60);
      const a = host.stats();
      await host.setView(i % 2 ? 'system' : 'planet');
      await systemView!.ready;
      host.update(input, 1 / 60);
      host.update(input, 1 / 60);
      const b = host.stats();
      counters.push({ geometries: a.geometries, textures: a.textures }, { geometries: b.geometries, textures: b.textures });
    }
    return counters;
  },
};

declare global {
  interface Window {
    systemHarness: typeof systemHarness;
  }
}
window.systemHarness = systemHarness;
