// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import type { FrameData, GameSnapshot } from '@space-game/api';
import {
  ARK_ID,
  ASTEROID_ID,
  MOON_ID,
  PLANET_ID,
  POC_SCENARIO,
  SHIP_ID,
  Simulation,
  TAU_CETI_SCENARIO,
  TC_C,
  TC_E,
  footprintTiles,
  standingStructure,
  tileIndexOf,
  type Structure,
  type WorldState,
} from '@space-game/domain';
import type { PickResult, Placement, Selection, ViewInput } from '../view';
import type { FetchBytes } from './model-library';
import { MODELS } from './model-registry';
import { DS } from './palette';
import { TRANSITION_SECONDS } from './camera-rig';
import { SystemView } from './system-view';
import { createSystemView } from './index';

const PUBLIC = join(process.cwd(), 'apps', 'game', 'public');
const fromDisk = async (url: string) => {
  const b = readFileSync(join(PUBLIC, url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

const W = 1200;
const H = 800;

function snapshotOf(world: WorldState, scenarioId: GameSnapshot['scenarioId'] = 'planeta-matka'): GameSnapshot {
  return {
    scenarioId,
    world: structuredClone(world),
    colonies: {},
    objectives: [],
    players: [],
    hubs: [],
    tempo: 60,
    paused: false,
    step: 0,
    stats: { meanMs: 0, maxMs: 0, stepsPerSecond: 0, minutesPerSecond: 0 },
  };
}

function frameOf(sim: Simulation): FrameData {
  const rovers: FrameData['rovers'] = {};
  for (const [id, p] of sim.snapshot.roverLocalPos) rovers[id] = [p.x, p.y, p.z];
  const transit: FrameData['transit'] = {};
  for (const [id, u] of sim.snapshot.transitProgress) transit[id] = u;
  return { time: sim.time, rovers, transit };
}

interface Harness {
  view: SystemView;
  container: HTMLDivElement;
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer & { render: ReturnType<typeof vi.fn> };
  /** Listeners currently attached to the canvas. */
  listeners: Set<unknown>;
  input: ViewInput;
  frames(n: number, dt?: number): void;
  pickAt(p: { x: number; y: number } | null): PickResult;
}

/** The host's part: one renderer (stubbed: jsdom has no WebGL), a container, the frame loop. */
function mount(snapshot: GameSnapshot, opts: { loadModels?: boolean; fetchBytes?: FetchBytes } = {}): Harness {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const canvas = document.createElement('canvas');
  container.appendChild(canvas);
  const listeners = new Set<unknown>();
  const add = canvas.addEventListener.bind(canvas);
  const remove = canvas.removeEventListener.bind(canvas);
  canvas.addEventListener = ((type: string, fn: EventListener, o?: AddEventListenerOptions) => {
    listeners.add(fn);
    return add(type, fn, o);
  }) as typeof canvas.addEventListener;
  canvas.removeEventListener = ((type: string, fn: EventListener, o?: EventListenerOptions) => {
    listeners.delete(fn);
    return remove(type, fn, o);
  }) as typeof canvas.removeEventListener;
  const renderer = {
    domElement: canvas,
    autoClear: true,
    info: { render: { calls: 3, triangles: 100 }, memory: { geometries: 0, textures: 0 } },
    render: vi.fn(),
    clearDepth: vi.fn(),
  } as unknown as Harness['renderer'];
  const view = new SystemView({ loadModels: opts.loadModels ?? false, fetchBytes: opts.fetchBytes ?? fromDisk });
  view.mount({ container, three: renderer, assetsBase: 'assets/', width: W, height: H });
  const input: ViewInput = { snapshot, frame: null, focusBodyId: null, selection: { kind: 'NONE' }, hover: null, placement: null };
  const h: Harness = {
    view,
    container,
    canvas,
    renderer,
    listeners,
    input,
    frames(n, dt = 1 / 60) {
      for (let i = 0; i < n; i++) view.update(h.input, dt);
    },
    pickAt(p) {
      expect(p).not.toBeNull();
      return view.pick(p!.x, p!.y, h.input);
    },
  };
  h.frames(1);
  return h;
}

function scene(h: Harness) {
  return h.view.internals!;
}

type Disposable = THREE.EventDispatcher<{ dispose: object }> & { type?: string };

/** Every geometry and material reachable from the scene graph. */
function resources(root: THREE.Object3D): Set<Disposable> {
  const out = new Set<THREE.BufferGeometry | THREE.Material>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) out.add(m.geometry);
    if (m.material) for (const x of Array.isArray(m.material) ? m.material : [m.material]) out.add(x);
  });
  return out as unknown as Set<Disposable>;
}

/** A tile of the body facing the camera, free of structures and away from units. */
function facingTile(h: Harness, bodyId: typeof PLANET_ID, world: WorldState) {
  const s = scene(h);
  const grid = s.gridOf(bodyId)!;
  const parts = s.bodyParts(bodyId)!;
  const cam = s.rig.camera.position.clone().sub(parts.world).normalize();
  const used = new Set(world.structures.filter((x) => x.bodyId === bodyId).flatMap((x) => x.tiles.map(tileIndexOf)));
  const near = new Set<number>();
  for (const i of used) for (const n of grid.tiles[i]!.neighbors) near.add(n);
  const top = grid.tiles.reduce((b, t) => (t.normal.y > b.normal.y ? t : b));
  return grid.tiles
    .filter((t) => !used.has(t.index) && !near.has(t.index) && !t.deposit && t.index !== top.index && !top.neighbors.includes(t.index))
    .reduce((best, t) => (cam.dot(new THREE.Vector3(t.normal.x, t.normal.y, t.normal.z)) > cam.dot(new THREE.Vector3(best.normal.x, best.normal.y, best.normal.z)) ? t : best));
}

describe('SystemView (planet + system kinds, one scene)', () => {
  let h: Harness;
  const sim = new Simulation(POC_SCENARIO);
  afterEach(() => {
    h?.view.dispose();
    h?.container.remove();
  });

  it('is the factory RenderHost expects: one view for planet and system, on the shared renderer', () => {
    const v = createSystemView();
    expect(v.kind).toEqual(['planet', 'system']);
    expect(v.usesThree).toBe(true);
    expect(typeof v.setKind).toBe('function');
    expect(() => v.mount({ container: document.createElement('div'), three: null, assetsBase: '', width: 1, height: 1 })).toThrow();
  });

  it('builds every body with its parent chain, labels and orbit lines, and renders each frame', () => {
    h = mount(snapshotOf(sim.world));
    const s = scene(h);
    for (const id of [PLANET_ID, MOON_ID, ASTEROID_ID]) {
      expect(s.bodyParts(id)!.orbit).not.toBeNull();
    }
    // the moon's group is a child of the planet's group (sphere of influence)
    expect(s.bodyParts(MOON_ID)!.group.parent).toBe(s.bodyParts(PLANET_ID)!.group);
    expect(s.bodyParts(PLANET_ID)!.grid).not.toBeNull();
    expect(s.bodyParts(ASTEROID_ID)!.grid).toBeNull();
    expect([...s.labels.ids()].map((id) => s.labels.textOf(id)).sort()).toEqual(['Asteroida', 'Księżyc', 'Planeta Matka', 'Słońce']);
    h.frames(2);
    expect(h.renderer.render).toHaveBeenCalled();
    expect(h.renderer.autoClear).toBe(true); // the overlay pass restores it
    expect(h.view.stats().drawCalls).toBeGreaterThan(0);
  });

  it('bodies sit at their analytic positions at the frame time', () => {
    h = mount(snapshotOf(sim.world));
    h.input = { ...h.input, frame: { time: 37.5, rovers: {}, transit: {} } };
    h.frames(1);
    const at = sim.solver.worldPosition(MOON_ID, 37.5, { x: 0, y: 0, z: 0 });
    const moon = scene(h).bodyParts(MOON_ID)!.world;
    expect(moon.x).toBeCloseTo(at.x, 6);
    expect(moon.z).toBeCloseTo(at.z, 6);
  });

  it('picks the tile under the cursor, a structure, the docked ship and EMPTY space', () => {
    h = mount(snapshotOf(sim.world));
    h.frames(3);
    const s = scene(h);
    const tile = facingTile(h, PLANET_ID, sim.world);
    expect(h.pickAt(s.screenOfLocal(PLANET_ID, tile.center))).toEqual({ kind: 'TILE', bodyId: PLANET_ID, tileIndex: tile.index });

    const shipAt = s.screenOfUnit(SHIP_ID)!;
    expect(h.pickAt(shipAt)).toEqual({ kind: 'SHIP', shipId: SHIP_ID });

    // a structure far enough from the ship on screen
    const parts = s.bodyParts(PLANET_ID)!.structures!.parts;
    const target = parts
      .map((p) => ({ p, at: s.screenOfLocal(PLANET_ID, p.center)! }))
      .filter(({ at }) => at.visible && Math.hypot(at.x - shipAt.x, at.y - shipAt.y) > 40)[0]!;
    const hit = h.pickAt(target.at);
    expect(hit).toMatchObject({ kind: 'STRUCTURE', bodyId: PLANET_ID, structureId: target.p.structureId });
    expect(target.p.tiles).toContain((hit as { tileIndex: number }).tileIndex);

    expect(h.view.pick(2, 2, h.input)).toEqual({ kind: 'EMPTY' });
  });

  it('picks a rover on the surface (frame position when present, else its tile)', () => {
    const world = structuredClone(sim.world);
    h = mount(snapshotOf(world));
    h.frames(2);
    const tile = facingTile(h, PLANET_ID, world);
    const moved = { ...world, rovers: world.rovers.map((r) => ({ ...r, tileIndex: tile.index })) };
    h.input = { ...h.input, snapshot: snapshotOf(moved) };
    h.frames(2);
    const rover = moved.rovers[0]!;
    expect(h.pickAt(scene(h).screenOfUnit(rover.id))).toEqual({ kind: 'ROVER', roverId: rover.id, bodyId: PLANET_ID });
    // frame data wins over the tile
    const c = tile.center;
    h.input = { ...h.input, frame: { time: world.time, rovers: { [rover.id]: [c.x * 1.005, c.y * 1.005, c.z * 1.005] }, transit: {} } };
    h.frames(1);
    const p = scene(h).units.roverPos.get(rover.id)!;
    const body = scene(h).bodyParts(PLANET_ID)!.world;
    expect(p.x - body.x).toBeCloseTo(c.x * 1.005, 4);
  });

  it('switching to the system kind moves only the camera: same GPU objects, overview of the whole system', () => {
    h = mount(snapshotOf(sim.world));
    h.frames(5);
    const s = scene(h);
    const before = resources(s.scene);
    const planetDistance = s.rig.distance;
    h.view.setKind('system');
    h.frames(Math.ceil(TRANSITION_SECONDS * 60) + 5);
    expect(s.rig.currentMode).toBe('system');
    expect(s.rig.distance).toBeGreaterThan(planetDistance * 5);
    expect(s.rig.target.length()).toBeLessThan(1e-6); // centred on the star
    expect(resources(s.scene)).toEqual(before);
    expect(h.view.internals).toBe(s);
    // in the overview the asteroid is a few pixels wide and still pickable
    expect(h.pickAt(s.screenOf(ASTEROID_ID))).toEqual({ kind: 'BODY', bodyId: ASTEROID_ID });
    h.view.setKind('planet');
    h.frames(Math.ceil(TRANSITION_SECONDS * 60) + 5);
    expect(s.rig.distance).toBeCloseTo(planetDistance, 0);
  });

  it('follows the focus body (planet kind) and centres the system camera on the star', () => {
    h = mount(snapshotOf(sim.world));
    h.input = { ...h.input, focusBodyId: MOON_ID };
    h.frames(Math.ceil(TRANSITION_SECONDS * 60) + 5);
    const s = scene(h);
    expect(s.rig.target.distanceTo(s.bodyParts(MOON_ID)!.world)).toBeLessThan(1e-6);
    h.input = { ...h.input, frame: { time: 5, rovers: {}, transit: {} } };
    h.frames(1);
    expect(s.rig.target.distanceTo(s.bodyParts(MOON_ID)!.world)).toBeLessThan(1e-6);
  });

  it('unrevealed bodies: plain dim sphere, unknown name, no tiles; the scan reveals grid and name', () => {
    const tc = new Simulation(TAU_CETI_SCENARIO);
    h = mount(snapshotOf(tc.world, 'tau-ceti'));
    h.view.setKind('system');
    h.frames(Math.ceil(TRANSITION_SECONDS * 60) + 5);
    const s = scene(h);
    const e = s.bodyParts(TC_E)!;
    expect(e.revealed).toBe(false);
    expect(e.grid).toBeNull();
    expect(e.structures).toBeNull();
    expect((e.surface!.material as THREE.MeshLambertMaterial).color.getHex()).toBe(new THREE.Color(DS.graphiteHi).getHex());
    expect(s.labels.textOf(TC_E)).toBe('Obiekt 4');
    h.input = { ...h.input, focusBodyId: TC_E };
    h.view.setKind('planet');
    h.frames(Math.ceil(TRANSITION_SECONDS * 60) + 5);
    const centre = s.screenOf(TC_E)!;
    expect(h.pickAt(centre)).toEqual({ kind: 'BODY', bodyId: TC_E });

    tc.dispatch({ type: 'SCAN_SYSTEM', shipId: ARK_ID });
    while (tc.world.scan.state !== 'DONE') tc.step(0.5);
    h.input = { ...h.input, snapshot: snapshotOf(tc.world, 'tau-ceti') };
    h.frames(2);
    const revealed = s.bodyParts(TC_E)!;
    expect(revealed.revealed).toBe(true);
    expect(revealed.grid).not.toBeNull();
    expect(s.labels.textOf(TC_E)).toBe('Tau Ceti e');
    expect(h.pickAt(s.screenOf(TC_E))).toMatchObject({ kind: 'TILE', bodyId: TC_E });
  });

  it('draws construction states: planned = outline only, constructing = solid rising with progress', () => {
    const own = new Simulation(POC_SCENARIO);
    const grid = own.grids.get(PLANET_ID)!;
    const used = new Set(own.world.structures.flatMap((x) => x.tiles));
    const dep = grid.tiles.find((t) => t.deposit?.resource === 'FER' && !used.has(t.id))!;
    const ev = own.dispatch({ type: 'BUILD', bodyId: PLANET_ID, tileId: dep.id, kind: 'MIN' });
    expect(ev.some((e) => e.type === 'CONSTRUCTION_ORDERED')).toBe(true);
    h = mount(snapshotOf(own.world));
    const layer = () => scene(h).bodyParts(PLANET_ID)!.structures!;
    const drill = () => layer().group.children.filter((o) => o.name === `${PLANET_ID}_drill_structure`)[0] as THREE.InstancedMesh;
    const sites = () => layer().group.children.filter((o) => o.name === `${PLANET_ID}_drill_structure_Sites`)[0] as THREE.LineSegments;
    expect(own.world.structures.find((s) => s.kind === 'MIN')!.state).toBe('PLANNED');
    expect(drill().count).toBe(0);
    expect(sites().visible).toBe(true);
    expect(sites().geometry.drawRange.count).toBeGreaterThan(0);
    // the tile's deposit rock is gone under the site
    while (own.world.structures.find((s) => s.kind === 'MIN')!.state === 'PLANNED') own.step(0.1);
    const site = own.world.structures.find((s) => s.kind === 'MIN')!;
    own.step(0.5);
    h.input = { ...h.input, snapshot: snapshotOf(own.world), frame: frameOf(own) };
    h.frames(1);
    const s = own.world.structures.find((x) => x.id === site.id)!;
    expect(s.state).toBe('CONSTRUCTING');
    expect(drill().count).toBe(1);
    const m = new THREE.Matrix4();
    drill().getMatrixAt(0, m);
    const full = layer().partsOf(site.id)[0]!.local;
    const sy = new THREE.Vector3().setFromMatrixColumn(m, 1).length();
    const fy = new THREE.Vector3().setFromMatrixColumn(full, 1).length();
    expect(sy / fy).toBeCloseTo(Math.max(0.08, s.progress), 2);
    while (own.world.structures.find((x) => x.id === site.id)!.state !== 'ACTIVE') own.step(0.25);
    h.input = { ...h.input, snapshot: snapshotOf(own.world), frame: frameOf(own) };
    h.frames(1);
    drill().getMatrixAt(0, m);
    expect(new THREE.Vector3().setFromMatrixColumn(m, 1).length()).toBeCloseTo(fy, 6);
    expect(sites().visible).toBe(false);
  });

  it('an upgrade across a level tier moves the structure to that tier\'s model batch (L2 → L3 → L5), and it all disposes', async () => {
    const world = structuredClone(sim.world);
    h = mount(snapshotOf(world), { loadModels: true });
    await h.view.ready;
    h.frames(2);
    const s = scene(h);
    const tile = facingTile(h, PLANET_ID, world);
    const hab = standingStructure('HAB', PLANET_ID, [tile.index], 2);
    const show = (x: Structure) => {
      h.input = { ...h.input, snapshot: snapshotOf({ ...world, structures: [...world.structures, x] }) };
      h.frames(1);
    };
    const layer = () => s.bodyParts(PLANET_ID)!.structures!;
    const batch = (model: string) => layer().group.children.find((o) => o.name === `${PLANET_ID}_${model}`) as THREE.InstancedMesh | undefined;
    const drawn = (model: string) => (batch(model)?.visible ? batch(model)!.count : 0);
    const models = () => layer().partsOf(hab.id).map((p) => p.model);

    show(hab);
    expect(models()).toEqual(['basemodule_A']);
    expect(drawn('basemodule_A')).toBe(1);
    // upgrading to L3: still the L2 look, with the scaffold outline
    show({ ...hab, state: 'UPGRADING', targetLevel: 3, progress: 0.5 });
    expect(models()).toEqual(['basemodule_A']);
    expect(drawn('basemodule_A')).toBe(1);
    expect(drawn('basemodule_B')).toBe(0);
    expect((layer().group.children.find((o) => o.name === `${PLANET_ID}_basemodule_A_Sites`) as THREE.LineSegments).visible).toBe(true);
    // done: the instance moved to the L3 batch, the L2 batch is empty (no draw call)
    show({ ...hab, level: 3, targetLevel: 3 });
    expect(models()).toEqual(['basemodule_B']);
    expect(drawn('basemodule_A')).toBe(0);
    expect(batch('basemodule_A')!.visible).toBe(false);
    expect(drawn('basemodule_B')).toBe(1);
    expect(batch('basemodule_B')!.geometry.index!.count / 3).toBe(MODELS.basemodule_B.triangles);
    // a level change alone (no state change, e.g. a loaded world) re-renders too
    show({ ...hab, level: 5, targetLevel: 5 });
    expect(models()).toEqual(['basemodule_E']);
    expect(drawn('basemodule_B')).toBe(0);
    expect(drawn('basemodule_E')).toBe(1);
    // within a tier nothing is rebuilt: the same part objects
    const parts = layer().partsOf(hab.id);
    show({ ...hab, level: 6, targetLevel: 6 });
    expect(layer().partsOf(hab.id)).toEqual(parts);
    expect(layer().partsOf(hab.id)[0]).toBe(parts[0]);
    // picking and tile ownership follow
    expect(layer().tileOwner.get(tile.index)?.id).toBe(hab.id);
    expect(h.pickAt(s.screenOfLocal(PLANET_ID, parts[0]!.center))).toMatchObject({ kind: 'STRUCTURE', bodyId: PLANET_ID, structureId: hab.id });

    const owned = new Set([...resources(s.scene), ...resources(s.overlay.scene)]);
    const disposed = new Set<unknown>();
    for (const r of owned) r.addEventListener('dispose', () => disposed.add(r));
    h.view.dispose();
    expect([...owned].filter((r) => !disposed.has(r)).map((r) => r.type)).toEqual([]);
  });

  it('a ship in transit flies the plan curve with its flight path drawn; the selected one in signal', () => {
    const own = new Simulation(POC_SCENARIO);
    own.dispatch({ type: 'MOVE_SHIP', shipId: SHIP_ID, to: MOON_ID });
    own.step(0.3);
    h = mount(snapshotOf(own.world));
    h.input = { ...h.input, frame: frameOf(own), selection: { kind: 'SHIP', shipId: SHIP_ID } };
    h.frames(1);
    const p = scene(h).units.shipPos.get(SHIP_ID)!;
    const q = own.snapshot.shipWorldPos.get(SHIP_ID)!;
    expect(p.distanceTo(new THREE.Vector3(q.x, q.y, q.z))).toBeLessThan(1e-6);
    const path = scene(h).units.group.children.find((o) => o.name === `Flight_${SHIP_ID}`) as THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>;
    expect(path.visible).toBe(true);
    expect(path.material.color.getHex()).toBe(new THREE.Color(DS.signal).getHex());
    expect(path.geometry.drawRange.start).toBeGreaterThanOrEqual(0);
    // selection bracket (8 segments) in the pixel overlay
    expect(scene(h).overlayVertices).toBeGreaterThanOrEqual(16);
    while (own.world.ships[0]!.state === 'IN_TRANSIT') own.step(0.5);
    h.input = { ...h.input, snapshot: snapshotOf(own.world), frame: frameOf(own) };
    h.frames(1);
    expect(scene(h).units.group.children.find((o) => o.name === `Flight_${SHIP_ID}`)).toBeUndefined();
  });

  it('highlights selection, hover and the placement ghost with vector outlines (signal / alert)', () => {
    h = mount(snapshotOf(sim.world));
    const s = scene(h);
    const grid = s.gridOf(PLANET_ID)!;
    const tile = facingTile(h, PLANET_ID, sim.world);
    const sel: Selection = { kind: 'TILE', bodyId: PLANET_ID, tileIndex: tile.index };
    h.input = { ...h.input, selection: sel, hover: { kind: 'TILE', bodyId: PLANET_ID, tileIndex: tile.neighbors[0]! } };
    h.frames(1);
    const outline = s.bodyParts(PLANET_ID)!.outline!;
    const corners = tile.vertices.length + grid.tiles[tile.neighbors[0]!]!.vertices.length;
    expect(outline.lines.geometry.drawRange.count).toBe(corners * 2);
    // the selected tile's outline is in the signal colour
    const col = outline.lines.geometry.getAttribute('color');
    const sig = new THREE.Color(DS.signal);
    const last = (corners * 2 - 1);
    expect(col.getX(last)).toBeCloseTo(sig.r, 6);

    const tiles = footprintTiles(grid, tile.index, 3, 0)!;
    const ok: Placement = { kind: 'HQ', tiles, valid: true };
    h.input = { ...h.input, selection: { kind: 'NONE' }, hover: null, placement: ok };
    h.frames(1);
    const ghosts = s.ghostObjects.filter((g) => g.visible);
    expect(ghosts).toHaveLength(2); // tower + pad
    expect((ghosts[0]!.material as THREE.LineBasicMaterial).color.getHex()).toBe(new THREE.Color(DS.signal).getHex());
    h.input = { ...h.input, placement: { ...ok, valid: false } };
    h.frames(1);
    expect((s.ghostObjects[0]!.material as THREE.LineBasicMaterial).color.getHex()).toBe(new THREE.Color(DS.alert).getHex());
    h.input = { ...h.input, placement: null };
    h.frames(1);
    expect(s.ghostObjects.every((g) => !g.visible)).toBe(true);
  });

  it('Tau Ceti c: hex-kit terrain replaces the fan grid near the camera, the fan stays the pick proxy, and it all disposes', async () => {
    const tc = new Simulation(TAU_CETI_SCENARIO);
    tc.dispatch({ type: 'SCAN_SYSTEM', shipId: ARK_ID });
    while (tc.world.scan.state !== 'DONE') tc.step(0.5);
    h = mount(snapshotOf(tc.world, 'tau-ceti'), { loadModels: true });
    h.input = { ...h.input, focusBodyId: TC_C };
    h.view.setKind('planet');
    h.frames(Math.ceil(TRANSITION_SECONDS * 60) + 5);
    const s = scene(h);
    await vi.waitFor(() => expect(s.bodyParts(TC_C)!.terrain?.ready).toBe(true), { timeout: 10000 });
    h.frames(3);
    const c = s.bodyParts(TC_C)!;
    expect(c.terrainDecor!.instances).toBeGreaterThan(50);
    // near: terrain and decor drawn, the fan mesh hidden but still the raycast surface
    expect(c.terrain!.visual.visible).toBe(true);
    expect(c.terrainDecor!.group.visible).toBe(true);
    expect(c.grid!.mesh.visible).toBe(false);
    expect(c.grid!.edges.visible).toBe(false);
    expect(c.surface).toBe(c.grid!.mesh);
    expect(h.pickAt(s.screenOf(TC_C))).toMatchObject({ kind: 'TILE', bodyId: TC_C });
    // every Tau Ceti planet has terrain since T5 (tc-e: mixed)
    expect(s.bodyParts(TC_E)!.terrain).not.toBeNull();
    // far (system overview): the cheap fan grid again
    h.view.setKind('system');
    h.frames(Math.ceil(TRANSITION_SECONDS * 60) + 5);
    expect(c.terrain!.visual.visible).toBe(false);
    expect(c.grid!.mesh.visible).toBe(true);

    const owned = resources(s.scene);
    const disposed = new Set<unknown>();
    for (const r of owned) r.addEventListener('dispose', () => disposed.add(r));
    h.view.dispose();
    expect([...owned].filter((r) => !disposed.has(r)).map((r) => r.type)).toEqual([]);
  });

  it('rebuilds the surface when only the terrain style of a body changes (a save from before T8 has none)', () => {
    const tc = new Simulation(TAU_CETI_SCENARIO);
    tc.dispatch({ type: 'SCAN_SYSTEM', shipId: ARK_ID }); // surfaces are built once the bodies are revealed
    while (tc.world.scan.state !== 'DONE') tc.step(0.5);
    const withTerrain = snapshotOf(tc.world, 'tau-ceti');
    h = mount(withTerrain, { loadModels: true });
    h.frames(2);
    expect(scene(h).bodyParts(TC_C)!.terrain).not.toBeNull();
    const bodies = tc.world.bodies.map((b) => (b.id === TC_C ? { ...b, surfaceGrid: { ...b.surfaceGrid!, terrain: undefined } } : b));
    h.input = { ...h.input, snapshot: snapshotOf({ ...tc.world, bodies }, 'tau-ceti') };
    h.frames(2);
    expect(scene(h).bodyParts(TC_C)!.terrain).toBeNull();
  });

  it('Tau Ceti c (medieval biome): structures use the medieval models, loaded only for that skin; tc-e keeps Space Base Bits; ghost and picking use the kit', async () => {
    const tc = new Simulation(TAU_CETI_SCENARIO);
    const urls: string[] = [];
    h = mount(snapshotOf(tc.world, 'tau-ceti'), {
      loadModels: true,
      fetchBytes: (url) => {
        urls.push(url);
        return fromDisk(url);
      },
    });
    await h.view.ready;
    const s = scene(h);
    // before the scan no body shows a grid: only Space Base Bits are loaded, nothing from the hex kit
    expect(s.kit.isLoaded('basemodule_A')).toBe(true);
    expect(s.kit.isLoaded('house')).toBe(false);
    expect(urls.filter((u) => u.includes('kaykit-hex/'))).toEqual([]);

    tc.dispatch({ type: 'SCAN_SYSTEM', shipId: ARK_ID });
    while (tc.world.scan.state !== 'DONE') tc.step(0.5);
    const world = structuredClone(tc.world);
    h.input = { ...h.input, snapshot: snapshotOf(world, 'tau-ceti'), focusBodyId: TC_C };
    h.view.setKind('planet');
    h.frames(Math.ceil(TRANSITION_SECONDS * 60) + 5);
    await h.view.ready; // now includes the medieval models (tc-c got its structure layer)
    expect(s.kit.isLoaded('house')).toBe(true);
    expect(s.kit.isLoaded('castle')).toBe(true);

    const tileC = facingTile(h, TC_C, world);
    const tileE = s.gridOf(TC_E)!.tiles.find((t) => !t.deposit && t.neighbors.length === 6)!;
    const habC = standingStructure('HAB', TC_C, [tileC.index]);
    const habE = standingStructure('HAB', TC_E, [tileE.index]);
    h.input = { ...h.input, snapshot: snapshotOf({ ...world, structures: [...world.structures, habC, habE] }, 'tau-ceti') };
    h.frames(Math.ceil(TRANSITION_SECONDS * 60) + 5);

    const c = s.bodyParts(TC_C)!.structures!;
    const e = s.bodyParts(TC_E)!.structures!;
    expect(c.skin).toBe('medieval');
    expect(e.skin).toBe('spacebits');
    expect(c.partsOf(habC.id).map((p) => p.model)).toEqual(['house']);
    expect(e.partsOf(habE.id).map((p) => p.model)).toEqual(['basemodule_A']);
    const batch = (layer: typeof c, body: string, model: string) => layer.group.children.find((o) => o.name === `${body}_${model}`) as THREE.InstancedMesh | undefined;
    const house = batch(c, TC_C, 'house')!;
    expect(house.visible).toBe(true);
    expect(house.count).toBe(1);
    // the flattened Medieval Hexagon geometry (non-indexed), the same shared material as every model
    expect(house.geometry).toBe(s.kit.library.get('house')!.geometry);
    expect(house.geometry.getAttribute('position').count / 3).toBe(MODELS.house.triangles);
    expect(house.material).toBe(s.kit.material);
    expect(batch(c, TC_C, 'basemodule_A')).toBeUndefined();
    expect(batch(e, TC_E, 'house')).toBeUndefined();
    expect(batch(e, TC_E, 'basemodule_A')!.count).toBe(1);

    // picking: a ray through the top of the house hits its box (the loaded model's, from the kit)
    const part = c.partsOf(habC.id)[0]!;
    const box = s.kit.box('house');
    expect(box).toBe(s.kit.library.get('house')!.box);
    const top = new THREE.Vector3(0, box.max.y * 0.8, 0).applyMatrix4(part.local);
    expect(h.pickAt(s.screenOfLocal(TC_C, top))).toMatchObject({ kind: 'STRUCTURE', bodyId: TC_C, structureId: habC.id });
    expect(h.pickAt(s.screenOfLocal(TC_C, part.center))).toMatchObject({ kind: 'STRUCTURE', bodyId: TC_C, structureId: habC.id });

    // placement ghost on tc-c: the port as castle + pad, edges of the loaded models
    const grid = s.gridOf(TC_C)!;
    const free = grid.tiles.find((t) => t.neighbors.length === 6 && t.index !== tileC.index && !t.neighbors.includes(tileC.index) && footprintTiles(grid, t.index, 3, 0))!;
    const tiles = footprintTiles(grid, free.index, 3, 0)!;
    h.input = { ...h.input, placement: { kind: 'HQ', tiles, valid: true } };
    h.frames(1);
    const visible = () => s.ghostObjects.filter((g) => g.visible).map((g) => g.geometry);
    expect(visible()).toEqual([s.kit.edges('castle'), s.kit.edges('landingpad_small')]);
    expect(s.kit.edges('castle')).toBe(s.kit.library.edgesOf('castle'));
    // a half-sunk water mill keeps its outline (only pits are left out)
    h.input = { ...h.input, placement: { kind: 'SIR', tiles, valid: true } };
    h.frames(1);
    expect(visible()).toEqual([s.kit.edges('well'), s.kit.edges('watermill')]);
    // the same kind placed on tc-e: Space Base Bits
    h.input = { ...h.input, focusBodyId: TC_E, placement: { kind: 'HAB', tiles: [tileE.neighbors[0]!], valid: true } };
    h.frames(1);
    expect(visible()).toEqual([s.kit.edges('basemodule_A')]);

    const owned = new Set([...resources(s.scene), ...resources(s.overlay.scene)]);
    const disposed = new Set<unknown>();
    for (const r of owned) r.addEventListener('dispose', () => disposed.add(r));
    h.view.dispose();
    expect([...owned].filter((r) => !disposed.has(r)).map((r) => r.type)).toEqual([]);
  });

  it('dispose frees every geometry and material it created and removes its DOM and listeners', async () => {
    h = mount(snapshotOf(sim.world), { loadModels: true });
    await h.view.ready;
    h.input = { ...h.input, selection: { kind: 'SHIP', shipId: SHIP_ID }, placement: { kind: 'SOL', tiles: [facingTile(h, PLANET_ID, sim.world).index], valid: true } };
    h.frames(3);
    const s = scene(h);
    // models arrived: the drill batch uses the flattened KayKit geometry
    const pad = s.bodyParts(PLANET_ID)!.structures!.group.children.find((o) => o.name === `${PLANET_ID}_landingpad_small`) as THREE.InstancedMesh;
    expect(pad.geometry.index!.count / 3).toBe(MODELS.landingpad_small.triangles);
    const owned = new Set([...resources(s.scene), ...resources(s.overlay.scene)]);
    expect(owned.size).toBeGreaterThan(20);
    const disposed = new Set<unknown>();
    for (const r of owned) r.addEventListener('dispose', () => disposed.add(r));
    const before = h.container.children.length;
    expect(h.listeners.size).toBeGreaterThan(0); // OrbitControls: drag rotate, wheel zoom
    h.view.dispose();
    const left = [...owned].filter((r) => !disposed.has(r));
    expect(left.map((r) => r.type)).toEqual([]);
    expect(h.container.children.length).toBe(before - 1); // the label layer
    expect(h.listeners.size).toBe(0);
    expect(h.view.pick(10, 10, h.input)).toEqual({ kind: 'EMPTY' });
    h.view.update(h.input, 0.016); // no-op after dispose
  });

  it('20 mount / dispose cycles leave nothing behind', () => {
    const container = document.createElement('div');
    const canvas = document.createElement('canvas');
    container.appendChild(canvas);
    const renderer = { domElement: canvas, autoClear: true, info: { render: { calls: 0, triangles: 0 } }, render: vi.fn(), clearDepth: vi.fn() } as unknown as THREE.WebGLRenderer;
    const snap = snapshotOf(sim.world);
    for (let i = 0; i < 20; i++) {
      const view = new SystemView({ loadModels: false });
      view.mount({ container, three: renderer, assetsBase: 'assets/', width: W, height: H });
      const input: ViewInput = { snapshot: snap, frame: null, focusBodyId: null, selection: { kind: 'NONE' }, hover: null, placement: null };
      view.update(input, 0.016);
      if (i % 2) view.setKind('system');
      view.update(input, 0.016);
      const owned = resources(view.internals!.scene);
      let n = 0;
      for (const r of owned) r.addEventListener('dispose', () => n++);
      view.dispose();
      expect(n).toBe(owned.size);
      expect(container.children.length).toBe(1);
    }
  });
});
