// Visual harness of the planet/system view: `npx vite packages/render/harness/system --port 4431`.
// Plays the canvas flow on Tau Ceti in the page (MockServer in-thread), renders it through
// RenderHost and exposes `window.systemHarness` for Playwright (kinds, stats, mount/dispose cycles).
// `?colony=c`: the colony on Tau Ceti c instead of e (medieval skin, next to the settlement ruins).
// `?scenario=planeta-matka`: the PoC planet and moon instead of Tau Ceti (biome shots, `shot-biomes.mjs`).
import { MockServer } from '@space-game/mock-server';
import type { FrameData, GameSnapshot } from '@space-game/api';
import {
  ARK_ID,
  PLANET_ID,
  TC_C,
  TC_E,
  dressTerrain,
  footprintTiles,
  isNatureDecor,
  standingStructure,
  storageOf,
  tileBuildable,
  tileIndexOf,
  type BodyId,
  type Command,
  type PlanetGrid,
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

const query = new URLSearchParams(location.search);
/** `?scenario=planeta-matka`: the PoC home planet and its moon (scanned from the start, no colony played). */
const POC = query.get('scenario') === 'planeta-matka';

const server = new MockServer();
server.start(POC ? 'planeta-matka' : 'tau-ceti', undefined, 60);
const sim = server.simulation;

/** Body of the colony: Tau Ceti e (default) or c (`?colony=c`, terrain with water and ruins). */
const COLONY: BodyId = query.get('colony') === 'c' ? TC_C : TC_E;

/** Sends a command; false (and a warning unless `quiet`) when the domain rejects it. */
function ok(cmd: Command, quiet = false): boolean {
  const r = server.command(cmd);
  const rejected = r.events.find((e) => e.type === 'COMMAND_REJECTED');
  if (rejected && !quiet) console.warn(`${cmd.type} rejected`, rejected);
  return !rejected;
}

/**
 * Tiles worth building on, nearest to `near` first: buildable terrain (no water), and on a body with
 * terrain not under a ruined building, so the colony stands next to the ruins rather than on them.
 */
function siteOrder(grid: PlanetGrid, near: number): number[] {
  const plan = grid.terrain ? dressTerrain(grid) : undefined;
  const ruins = new Set((plan?.decor ?? []).filter((d) => !isNatureDecor(d.model)).map((d) => d.tile));
  const c = grid.tiles[near]!.normal;
  const dot = (t: PlanetGrid['tiles'][number]) => t.normal.x * c.x + t.normal.y * c.y + t.normal.z * c.z;
  return grid.tiles
    .filter((t) => tileBuildable(t) && !ruins.has(t.index))
    .sort((a, b) => dot(b) - dot(a))
    .map((t) => t.index);
}

function runUntil(pred: () => boolean, maxMinutes: number): void {
  const start = sim.time;
  while (!pred() && sim.time - start < maxMinutes) sim.step(0.25);
}

function freeTile(world: WorldState, body: BodyId, material?: string, near?: number): string | null {
  const grid = sim.grids.get(body)!;
  const used = new Set(world.structures.flatMap((s) => s.tiles));
  const order = near === undefined ? grid.tiles.map((t) => t.index) : siteOrder(grid, near);
  const i = order.find((k) => {
    const x = grid.tiles[k]!;
    return !used.has(x.id) && x.neighbors.length === 6 && (material ? x.deposit?.resource === material : !x.deposit);
  });
  return i === undefined ? null : grid.tiles[i]!.id;
}

/** The first session of the canvas (simulation.spec `playFirstSession`), stopped with sites in progress. */
function playColony(): void {
  ok({ type: 'SCAN_SYSTEM', shipId: ARK_ID });
  runUntil(() => sim.world.scan.state === 'DONE', 30);
  ok({ type: 'CHOOSE_COLONY_SITE', bodyId: COLONY });
  ok({ type: 'MOVE_SHIP', shipId: ARK_ID, to: COLONY });
  runUntil(() => sim.world.ships[0]!.state === 'DOCKED', 60);
  const grid = sim.grids.get(COLONY)!;
  const clear = (i: number) => {
    const t = grid.tiles[i]!;
    return t.neighbors.length === 6 && [t.index, ...t.neighbors].every((k) => !grid.tiles[k]!.deposit);
  };
  // on c: the port near the castle on dry land, the ruins left standing (the domain rejects water)
  const centre = grid.terrain?.settlementCenter ?? null;
  const anchors = (centre === null ? grid.tiles.map((t) => t.index) : siteOrder(grid, centre)).filter(clear);
  const anchor = anchors.find((i) => ok({ type: 'PLACE_SPACEPORT', bodyId: COLONY, tileId: grid.tiles[i]!.id }, true));
  if (anchor === undefined) console.warn('no tile accepted the spaceport');
  runUntil(() => sim.world.colony.foundedAt !== null, 60);
  ok({ type: 'CALL_SHUTTLE', bodyId: COLONY, cargo: { FER: 150, SIL: 80, KRI: 20 } });
  runUntil(() => (storageOf(sim.world, COLONY)['FER'] ?? 0) >= 150, 30);
  for (const [kind, material] of [['WND'], ['HAB'], ['MIN', 'FER'], ['ICE', 'KRI'], ['SIT', 'SIL'], ['LAND']] as Array<[string, string?]>) {
    const tile = freeTile(sim.world, COLONY, material, COLONY === TC_E ? undefined : anchor);
    if (tile) ok({ type: 'BUILD', bodyId: COLONY, tileId: tile as never, kind });
  }
  sim.step(1); // rovers on their way: some sites PLANNED, one CONSTRUCTING
  runUntil(() => sim.world.structures.some((s) => s.state === 'CONSTRUCTING'), 10);
}
// ?arrival: the scenario start (unknown objects before the scan); default: a colony being built
const arrival = query.has('arrival') || POC;
if (!arrival) playColony();

/**
 * Optional extra standing buildings, render-only, to measure a larger colony (M) or to show more
 * kinds and levels in a shot: `levels` cycles per building; `near` = around the colony's port, on
 * buildable tiles off the ruins (default: grid order).
 */
let extra: Structure[] = [];
function stress(n: number, opts: { kinds?: string[]; levels?: number[]; near?: boolean } = {}): number {
  const world = sim.world;
  const grid = sim.grids.get(COLONY)!;
  const used = new Set(world.structures.flatMap((s) => s.tiles.map(tileIndexOf)));
  const kinds = opts.kinds ?? ['SOL', 'WND', 'HAB', 'DEP', 'MIN', 'TNK', 'SKL', 'SMT', 'CON', 'FARM', 'LAND', 'GAR'];
  const levels = opts.levels ?? [1];
  const port = world.structures.find((s) => s.bodyId === COLONY && s.kind === 'HQ');
  const order = opts.near && port ? siteOrder(grid, tileIndexOf(port.tiles[0]!)) : grid.tiles.map((t) => t.index);
  const allowed = new Set(order);
  extra = [];
  for (const i of order) {
    if (extra.length >= n) break;
    const kind = kinds[extra.length % kinds.length]!;
    const size = kind === 'SMT' || kind === 'SIR' ? 3 : 1;
    const tiles = footprintTiles(grid, i, size, 0);
    if (!tiles || tiles.some((k) => used.has(k) || !allowed.has(k) || (opts.near && grid.tiles[k]!.deposit))) continue;
    tiles.forEach((k) => used.add(k));
    const level = levels[extra.length % levels.length]!;
    extra.push({ ...standingStructure(kind, COLONY, tiles, level), id: `X${extra.length}:${kind}` });
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
  focusBodyId: POC ? PLANET_ID : arrival ? null : COLONY,
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
