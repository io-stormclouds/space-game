import * as THREE from 'three';
import type { GameSnapshot } from '@space-game/api';
import {
  OrbitSolver,
  asteroidShape,
  buildWorldGrids,
  dressTerrain,
  isWorking,
  tileIndexOf,
  vec3,
  type BodyId,
  type CelestialBody,
  type PlanetGrid,
  type TerrainPlan,
  type Structure,
  type TileId,
  type Vec3,
  type WorldState,
} from '@space-game/domain';
import type { PickResult, Placement, Selection, ViewInput } from '../view';
import { AsteroidView } from './asteroid-view';
import { BeltView, mulberry32 } from './belt-view';
import { LineBuffer } from './buffers';
import { CameraRig, type CameraGoal, type CameraMode } from './camera-rig';
import { HexKit, type KitModel } from './hex-kit';
import { LabelLayer } from './labels';
import { ModelKit } from './model-kit';
import type { FetchBytes } from './model-library';
import { BASE_MODEL_IDS, partTop, partsFor, skinFor, skinModels, type ModelId, type Skin } from './model-registry';
import { SCENE, muteBodyColor, muteStarColor } from './palette';
import { createFrame, defaultFocus, dockingOffsetOf, fitDistance, nearestTile, rootBody, systemExtent } from './placement';
import { PlanetGridView } from './planet-grid-view';
import { ScreenOverlay, pixelRadius, projectPoint, ringHit, type ScreenPoint } from './screen-overlay';
import { StructureLayer, partFrame, partMatrix } from './structure-layer';
import { TerrainDecor } from './terrain-decor';
import { TerrainView } from './terrain-view';
import { UnitsLayer, type UnitContext } from './units-layer';

export interface SystemSceneOptions {
  container: HTMLElement;
  renderer: THREE.WebGLRenderer;
  assetsBase: string;
  width: number;
  height: number;
  /** Reads model files (tests read them from disk); default fetch. */
  fetchBytes?: FetchBytes;
  /** false = placeholders only (no network). */
  loadModels?: boolean;
}

interface BodyView {
  id: BodyId;
  body: CelestialBody;
  /** Positioned in the parent's frame (spheres of influence = scene graph, PoC). */
  group: THREE.Group;
  /** World position this frame. */
  world: THREE.Vector3;
  /** The pickable surface: grid, rock or sphere; null for a belt. */
  surface: THREE.Mesh | null;
  /** Material owned by this body (spheres); grid/rock views own theirs. */
  ownMaterial: THREE.Material | null;
  grid: PlanetGridView | null;
  /** Hex-kit terrain and decor of a body with a terrain plan; drawn near, the fan grid far and for picking. */
  terrain: TerrainView | null;
  terrainDecor: TerrainDecor | null;
  asteroid: AsteroidView | null;
  belt: BeltView | null;
  structures: StructureLayer | null;
  /** Tile outlines (selection, hover, placement) with vertex colours. */
  outline: LineBuffer | null;
  orbit: THREE.LineLoop | null;
  revealed: boolean;
  docking: Vec3;
  minerals0: number;
  planetKey: string;
}

const EMPTY: PickResult = { kind: 'EMPTY' };
const NONE: Selection = { kind: 'NONE' };
const STAR_COUNT = 1400;
const STAR_RADIUS = 40000;
/** Screen-space pick radius for ships and rovers [px] (they are tiny at system scale). */
export const UNIT_PICK_PX = 12;
/** Bodies smaller than this on screen are picked within this radius [px]. */
export const SMALL_BODY_PX = 9;
/** Below this apparent radius a body is picked as a whole (no tiles, no buildings) [px]. */
export const TILE_PICK_MIN_PX = 40;
/** Tile edges show from this apparent radius on, buildings from the next one [px]. */
const EDGES_MIN_PX = 80;
const STRUCTURES_MIN_PX = 24;
/** Ships drawn smaller than this get a vector diamond marker [px]. */
const MARKER_BELOW_PX = 6;
const FOV = 50;
/** Parts whose top is lower than this above the surface [frame widths] are pits: no ghost outline. */
const GHOST_MIN_TOP = 0.05;

/**
 * The continuous planet/system scene (W12 A): every body at its analytic position, gridded bodies
 * with their Goldberg tiles and structures, ships and rovers, vector overlays and DOM labels.
 * Built once per mount; the planet/system switch only changes the camera preset.
 */
export class SystemScene {
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly kit: ModelKit;
  readonly labels: LabelLayer;
  readonly overlay = new ScreenOverlay();
  readonly units: UnitsLayer;
  /** Draw calls and triangles of the last frame (both passes). */
  readonly frameStats = { drawCalls: 0, triangles: 0 };

  private readonly renderer: THREE.WebGLRenderer;
  private width: number;
  private height: number;
  private mode: CameraMode = 'planet';
  private readonly bodies = new Map<BodyId, BodyView>();
  private order: BodyView[] = [];
  private bodySig = '';
  private grids: ReadonlyMap<BodyId, PlanetGrid> = new Map();
  private terrainPlans: ReadonlyMap<BodyId, TerrainPlan> = new Map();
  private hexKit: HexKit;
  private hexModels: Promise<ReadonlyMap<string, KitModel>> | null = null;
  private readonly loadModels: boolean;
  /** Space Base Bits models (loaded at mount) and the extra models of each skin a body uses. */
  private readonly baseLoad: Promise<void>;
  private readonly skinLoads = new Map<Skin, Promise<void>>();
  private solver: OrbitSolver | null = null;
  private extent = 1;
  private root: BodyView | null = null;
  private snapshot: GameSnapshot | null = null;
  private world: WorldState | null = null;
  private readonly structureById = new Map<string, Structure>();
  private readonly surfaceOwner = new Map<THREE.Object3D, BodyView>();
  private pickables: THREE.Object3D[] = [];
  private focusId: BodyId | null = null;
  private defaultFocusId: BodyId | null = null;
  private orbitFocus: BodyId | null = null;
  private disposed = false;

  private readonly ambient = new THREE.AmbientLight(SCENE.ambient, 0.85);
  private readonly sun = new THREE.PointLight(0xffffff, 3.0, 0, 0);
  private readonly starfield: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly sphereGeos = new Map<number, THREE.BufferGeometry>();
  private readonly ringGeos = new Map<number, THREE.BufferGeometry>();
  private readonly orbitMat = new THREE.LineBasicMaterial({ color: SCENE.orbit });
  private readonly orbitFocusMat = new THREE.LineBasicMaterial({ color: SCENE.orbitFocus });
  private readonly siteMat = new THREE.LineBasicMaterial({ color: SCENE.site, transparent: true, opacity: 0.85 });
  private readonly outlineMat = new THREE.LineBasicMaterial({ vertexColors: true });
  private readonly unknownMat = new THREE.MeshLambertMaterial({ color: SCENE.unknownBody, flatShading: true });
  private readonly ghostOk = new THREE.LineBasicMaterial({ color: SCENE.placementValid, depthTest: false, transparent: true });
  private readonly ghostBad = new THREE.LineBasicMaterial({ color: SCENE.placementInvalid, depthTest: false, transparent: true });
  private readonly ghosts: THREE.LineSegments[] = [];

  // overlay state (compared by value: inputs may be fresh objects every frame)
  private sel: Selection = NONE;
  private hov: PickResult | null = null;
  private place: Placement | null = null;
  private placeFocus: BodyId | null = null;
  private overlaysDirty = true;

  // per-frame scratch
  private readonly v: Vec3 = vec3();
  private readonly orbitTmp: Vec3 = vec3();
  private readonly tmp = new THREE.Vector3();
  private readonly tmp2 = new THREE.Vector3();
  private readonly color = new THREE.Color();
  private readonly sp: ScreenPoint = { x: 0, y: 0, depth: 0, visible: false };
  private readonly ndc = new THREE.Vector2();
  private readonly raycaster = new THREE.Raycaster();
  private readonly hits: THREE.Intersection[] = [];
  private readonly inv = new THREE.Matrix4();
  private readonly localRay = new THREE.Ray();
  private readonly tmpRay = new THREE.Ray();
  private readonly frame = createFrame();
  private readonly basis = { x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3() };
  private readonly goal: CameraGoal = { target: new THREE.Vector3(), key: '', distance: 1, phi: 1, theta: 0, minDistance: 1, maxDistance: 10 };
  private readonly unitCtx: UnitContext;
  private readonly unloadModels: () => void;

  constructor(opts: SystemSceneOptions) {
    this.renderer = opts.renderer;
    this.width = Math.max(1, opts.width);
    this.height = Math.max(1, opts.height);
    this.scene.name = 'SystemScene';
    this.scene.background = new THREE.Color(SCENE.background);
    this.scene.add(this.ambient, this.sun);
    this.starfield = buildStarfield();
    this.scene.add(this.starfield);

    this.kit = new ModelKit(opts.assetsBase, opts.fetchBytes);
    this.hexKit = new HexKit(opts.assetsBase, opts.fetchBytes);
    this.loadModels = opts.loadModels !== false;
    this.units = new UnitsLayer(this.kit);
    this.scene.add(this.units.group);
    for (let i = 0; i < 2; i++) this.ghost(i);

    this.rig = new CameraRig(opts.renderer.domElement ?? null);
    this.rig.setAspect(this.width / this.height);
    this.labels = new LabelLayer(opts.container);
    this.overlay.resize(this.width, this.height);

    this.unitCtx = {
      world: null as unknown as WorldState,
      frame: null,
      time: 0,
      grids: this.grids,
      bodyWorld: (id) => this.bodies.get(id)?.world,
      docking: (id) => this.bodies.get(id)?.docking ?? this.v,
      orbit: (id) => {
        const b = this.bodies.get(id)?.body;
        this.orbitTmp.x = 0;
        this.orbitTmp.y = b ? b.radius * b.orbitalAltitudeFactor : 0;
        this.orbitTmp.z = 0;
        return this.orbitTmp;
      },
      selectedShip: null,
    };

    this.unloadModels = this.kit.onLoaded((id) => this.onModel(id));
    this.baseLoad = opts.loadModels === false ? Promise.resolve() : this.kit.loadAll(BASE_MODEL_IDS);
  }

  /**
   * Resolves when the models requested so far have settled: the Space Base Bits set, plus the
   * models of every skin a body of the current world uses (requested when its surface is built).
   */
  get ready(): Promise<void> {
    return Promise.all([this.baseLoad, ...this.skinLoads.values()]).then(() => undefined);
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
    this.rig.setMode(mode);
  }

  get cameraMode(): CameraMode {
    return this.mode;
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.rig.setAspect(this.width / this.height);
    this.overlay.resize(this.width, this.height);
  }

  update(input: ViewInput, dt: number): void {
    if (this.disposed) return;
    if (input.snapshot !== this.snapshot) this.sync(input.snapshot);
    const world = this.world;
    if (!world || !this.solver) {
      this.render(false);
      return;
    }
    const t = input.frame?.time ?? world.time;

    // bodies at their analytic positions; the scene graph composes parent chains
    for (const bv of this.order) {
      this.solver.localPosition(bv.id, t, this.v);
      bv.group.position.set(this.v.x, this.v.y, this.v.z);
      bv.belt?.update(t);
    }
    this.scene.updateMatrixWorld();
    for (const bv of this.order) bv.world.setFromMatrixPosition(bv.group.matrixWorld);

    const focus = this.focusOf(input);
    this.focusId = focus?.id ?? null;
    this.updateOrbitFocus();

    const ctx = this.unitCtx;
    ctx.world = world;
    ctx.frame = input.frame;
    ctx.time = t;
    ctx.grids = this.grids;
    ctx.selectedShip = input.selection.kind === 'SHIP' ? input.selection.shipId : null;
    this.units.update(ctx);

    this.updateSelection(input);

    this.updateCamera(dt, focus);
    this.rig.camera.updateMatrixWorld();
    this.updateDetail();
    this.drawScreenOverlay();
    this.placeLabels();
    this.render(true);
  }

  pick(x: number, y: number, input: ViewInput): PickResult {
    if (this.disposed) return EMPTY;
    if (input.snapshot !== this.snapshot) this.sync(input.snapshot);
    if (!this.world) return EMPTY;
    const cam = this.rig.camera;
    this.ndc.set((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, cam);
    const ray = this.raycaster.ray;

    let bestD = Infinity;
    let result: PickResult = EMPTY;

    // 1. surfaces: grids (tile under the cursor), rocks, spheres
    this.hits.length = 0;
    this.raycaster.intersectObjects(this.pickables, false, this.hits);
    const surf = this.hits[0];
    if (surf) {
      const bv = this.surfaceOwner.get(surf.object);
      if (bv) {
        bestD = surf.distance;
        result = { kind: 'BODY', bodyId: bv.id };
        if (bv.grid && surf.faceIndex != null && this.apparentRadius(bv) >= TILE_PICK_MIN_PX) {
          const tile = bv.grid.tileAtFace(surf.faceIndex);
          if (tile >= 0) {
            const owner = bv.structures?.tileOwner.get(tile);
            result = owner ? { kind: 'STRUCTURE', bodyId: bv.id, structureId: owner.id, tileIndex: tile } : { kind: 'TILE', bodyId: bv.id, tileIndex: tile };
          }
        }
      }
    }

    // 2. structure models standing above the surface (box per part, in the body's frame)
    for (const bv of this.order) {
      const layer = bv.structures;
      if (!layer || layer.parts.length === 0 || this.apparentRadius(bv) < TILE_PICK_MIN_PX) continue;
      const reach = bv.body.radius * 1.6;
      if (ray.distanceSqToPoint(bv.world) > reach * reach) continue;
      this.inv.copy(bv.group.matrixWorld).invert();
      this.localRay.copy(ray).applyMatrix4(this.inv);
      const hit = layer.pick(this.localRay, this.tmpRay, this.tmp);
      if (hit && hit.distance < bestD) {
        bestD = hit.distance;
        this.localRay.at(hit.distance, this.tmp);
        const tile = nearestTile(layer.grid, hit.part.tiles, this.tmp);
        result = { kind: 'STRUCTURE', bodyId: bv.id, structureId: hit.part.structureId, tileIndex: tile };
      }
    }

    // 3. belts: the ring plane
    for (const bv of this.order) {
      if (!bv.belt) continue;
      const parent = bv.body.parentId ? this.bodies.get(bv.body.parentId) : undefined;
      const d = ringHit(ray, parent?.world ?? this.tmp2.set(0, 0, 0), bv.belt.innerRadius, bv.belt.outerRadius);
      if (d !== null && d < bestD) {
        bestD = d;
        result = { kind: 'BODY', bodyId: bv.id };
      }
    }

    // 4. ships and rovers in screen space, unless something solid is in front of them
    const ship = this.nearestUnit(this.units.shipPos, this.units.shipSize, x, y, bestD);
    if (ship) return { kind: 'SHIP', shipId: ship };
    const rover = this.nearestUnit(this.units.roverPos, this.units.roverSize, x, y, bestD);
    if (rover) return { kind: 'ROVER', roverId: rover, bodyId: this.units.roverBody.get(rover)! };
    if (result.kind !== 'EMPTY') return result;

    // 5. bodies too small to hit precisely (system view)
    let bestPx = SMALL_BODY_PX;
    for (const bv of this.order) {
      projectPoint(bv.world, cam, this.width, this.height, this.tmp, this.sp);
      if (!this.sp.visible) continue;
      if (pixelRadius(bv.body.radius, this.sp.depth, cam, this.height) >= SMALL_BODY_PX) continue;
      const d = Math.hypot(this.sp.x - x, this.sp.y - y);
      if (d <= bestPx) {
        bestPx = d;
        result = { kind: 'BODY', bodyId: bv.id };
      }
    }
    return result;
  }

  /** Screen position of a body centre (tests, harness). */
  screenOf(id: BodyId): ScreenPoint | null {
    const bv = this.bodies.get(id);
    if (!bv) return null;
    return { ...projectPoint(bv.world, this.rig.camera, this.width, this.height, this.tmp, this.sp) };
  }

  /** Screen position of a point in a body's local frame (tests, harness). */
  screenOfLocal(id: BodyId, p: Vec3): ScreenPoint | null {
    const bv = this.bodies.get(id);
    if (!bv) return null;
    this.tmp2.set(p.x, p.y, p.z).applyMatrix4(bv.group.matrixWorld);
    return { ...projectPoint(this.tmp2, this.rig.camera, this.width, this.height, this.tmp, this.sp) };
  }

  /** Screen position of a ship / rover (tests, harness). */
  screenOfUnit(id: string): ScreenPoint | null {
    const p = this.units.shipPos.get(id) ?? this.units.roverPos.get(id);
    return p ? { ...projectPoint(p, this.rig.camera, this.width, this.height, this.tmp, this.sp) } : null;
  }

  gridOf(id: BodyId): PlanetGrid | undefined {
    return this.grids.get(id);
  }

  /** Scene parts of a body, read-only (tests, harness). */
  bodyParts(id: BodyId) {
    const bv = this.bodies.get(id);
    if (!bv) return null;
    const { group, surface, grid, terrain, terrainDecor, structures, outline, belt, orbit, revealed, world, docking } = bv;
    return { group, surface, grid, terrain, terrainDecor, structures, outline, belt, orbit, revealed, world, docking } as const;
  }

  /** Placement ghost objects (tests). */
  get ghostObjects(): ReadonlyArray<THREE.LineSegments> {
    return this.ghosts;
  }

  /** Vertices in the pixel overlay this frame (tests). */
  get overlayVertices(): number {
    return this.overlay.vertexCount;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unloadModels();
    this.clearWorld();
    this.hexKit.dispose();
    this.units.dispose();
    for (const g of this.ghosts) g.removeFromParent();
    this.starfield.geometry.dispose();
    this.starfield.material.dispose();
    for (const m of [this.orbitMat, this.orbitFocusMat, this.siteMat, this.outlineMat, this.unknownMat, this.ghostOk, this.ghostBad]) m.dispose();
    this.overlay.dispose();
    this.kit.dispose();
    this.labels.dispose();
    this.rig.dispose();
    this.sun.dispose();
    this.ambient.dispose();
    this.scene.clear();
  }

  // ---------------------------------------------------------------- snapshot → scene

  private sync(snapshot: GameSnapshot): void {
    this.snapshot = snapshot;
    const world = snapshot.world;
    this.world = world;
    // the terrain style is part of the identity: a save from before T8 (no terrain) must rebuild the grids,
    // so the scene draws the same surface the simulation builds on
    const terrainOf = (b: CelestialBody): string => (b.surfaceGrid?.terrain ? `~${b.surfaceGrid.terrain.biome}/${b.surfaceGrid.terrain.seed}` : '');
    const sig = world.bodies.map((b) => `${b.id}<${b.parentId ?? ''}:${b.kind}${terrainOf(b)}`).join('|');
    if (sig !== this.bodySig) this.buildWorld(world.bodies, sig);

    this.structureById.clear();
    const byBody = new Map<BodyId, Structure[]>();
    for (const s of world.structures) {
      this.structureById.set(s.id, s);
      let list = byBody.get(s.bodyId);
      if (!list) byBody.set(s.bodyId, (list = []));
      list.push(s);
    }
    const exhausted = new Map<BodyId, Set<number>>();
    for (const key in world.deposits) {
      if ((world.deposits[key as TileId] ?? 1) > 0) continue;
      const body = key.slice(0, key.lastIndexOf(':')) as BodyId;
      let set = exhausted.get(body);
      if (!set) exhausted.set(body, (set = new Set()));
      set.add(tileIndexOf(key));
    }
    const working = world.structures.filter(isWorking);

    for (const body of world.bodies) {
      const bv = this.bodies.get(body.id);
      if (!bv) continue;
      bv.body = body;
      const revealed = body.revealed !== false;
      if (revealed !== bv.revealed) {
        this.disposeSurface(bv);
        bv.revealed = revealed;
        this.buildSurface(bv);
        this.overlaysDirty = true;
      }
      this.labels.set(bv.id, revealed ? body.name : body.unknownName ?? body.name);
      dockingOffsetOf(body, this.grids, working, bv.docking);
      if (bv.asteroid) bv.asteroid.setDepletion(minerals(body));
      const ex = exhausted.get(body.id) ?? EMPTY_SET;
      if (bv.grid && bv.revealed) {
        for (const t of this.grids.get(body.id)!.tiles) {
          if (!t.deposit) continue;
          bv.grid.setExhausted(t.index, ex.has(t.index));
          bv.terrain?.setExhausted(t.index, ex.has(t.index));
        }
      }
      if (bv.structures?.sync(byBody.get(body.id) ?? NO_STRUCTURES, ex)) this.overlaysDirty = true;
      if (bv.structures && bv.terrainDecor) bv.terrainDecor.setHidden(bv.structures.tileOwner.keys());
    }
    this.defaultFocusId = defaultFocus(world);
  }

  private buildWorld(bodies: ReadonlyArray<CelestialBody>, sig: string): void {
    this.clearWorld();
    this.bodySig = sig;
    this.grids = buildWorldGrids(bodies);
    // hex-kit dressing of every grid that carries terrain (its classes come from the domain, T8)
    this.terrainPlans = new Map([...this.grids].filter(([, g]) => g.terrain).map(([id, g]) => [id, dressTerrain(g)]));
    this.hexModels = null;
    this.solver = new OrbitSolver(bodies);
    this.extent = systemExtent(bodies);
    const pending = [...bodies];
    // parents first (PoC buildWorld)
    while (pending.length) {
      const idx = pending.findIndex((b) => b.parentId === null || this.bodies.has(b.parentId));
      if (idx < 0) break; // orphaned bodies are not drawn
      const body = pending.splice(idx, 1)[0]!;
      this.addBody(body);
    }
    const root = rootBody(bodies);
    this.root = root ? this.bodies.get(root.id) ?? null : null;
    this.rebuildPickables();
    this.overlaysDirty = true;
  }

  private addBody(body: CelestialBody): void {
    const group = new THREE.Group();
    group.name = `${body.name}_Group`;
    const parent = body.parentId ? this.bodies.get(body.parentId)?.group ?? this.scene : this.scene;
    parent.add(group);
    const bv: BodyView = {
      id: body.id,
      body,
      group,
      world: new THREE.Vector3(),
      surface: null,
      ownMaterial: null,
      grid: null,
      asteroid: null,
      belt: null,
      structures: null,
      outline: null,
      orbit: null,
      terrain: null,
      terrainDecor: null,
      revealed: body.revealed !== false,
      docking: vec3(0, body.radius * body.orbitalAltitudeFactor, 0),
      minerals0: minerals(body),
      planetKey: `planet:${body.id}`,
    };
    if (body.orbitRadius > 0 && body.kind !== 'BELT') {
      bv.orbit = new THREE.LineLoop(this.ring(body.orbitRadius), this.orbitMat);
      bv.orbit.name = `${body.name}_Orbit`;
      parent.add(bv.orbit);
    }
    this.bodies.set(body.id, bv);
    this.order.push(bv);
    this.buildSurface(bv);
    this.labels.set(bv.id, bv.revealed ? body.name : body.unknownName ?? body.name);
  }

  /** Surface by kind and reveal state; unrevealed bodies show nothing of their grid or deposits. */
  private buildSurface(bv: BodyView): void {
    const body = bv.body;
    const grid = this.grids.get(body.id);
    if (body.kind === 'BELT') {
      bv.belt = new BeltView(body, this.kit);
      const parent = body.parentId ? this.bodies.get(body.parentId)?.group ?? this.scene : this.scene;
      parent.add(bv.belt.group);
      return;
    }
    let mesh: THREE.Mesh;
    if (body.kind === 'STAR') {
      const m = new THREE.MeshBasicMaterial({ color: muteStarColor(body.color) });
      mesh = new THREE.Mesh(this.sphere(body.radius), m);
      bv.ownMaterial = m;
    } else if (!bv.revealed) {
      mesh = new THREE.Mesh(this.sphere(body.radius), this.unknownMat);
    } else if (grid) {
      bv.grid = new PlanetGridView(grid, body.color);
      mesh = bv.grid.mesh;
      bv.group.add(bv.grid.edges);
      const skin = skinFor(body);
      this.loadSkin(skin);
      bv.structures = new StructureLayer(grid, this.kit, this.siteMat, true, skin);
      bv.group.add(bv.structures.group);
      this.attachTerrain(bv);
    } else if (body.shape) {
      bv.asteroid = new AsteroidView(asteroidShape(body), body.color, bv.minerals0);
      bv.asteroid.setDepletion(minerals(body));
      mesh = bv.asteroid.mesh;
    } else {
      const m = new THREE.MeshLambertMaterial({ color: muteBodyColor(body.color), flatShading: true });
      mesh = new THREE.Mesh(this.sphere(body.radius), m);
      bv.ownMaterial = m;
    }
    mesh.name = body.name;
    bv.group.add(mesh);
    bv.surface = mesh;
    this.rebuildPickables();
  }

  /** Terrain of a body with a plan: built from the hex kit once its files have loaded (fan grid until then). */
  private attachTerrain(bv: BodyView): void {
    const plan = this.terrainPlans.get(bv.id);
    const grid = bv.grid?.grid;
    if (!plan || !grid || !this.loadModels) return;
    const terrain = new TerrainView(grid, plan);
    bv.terrain = terrain;
    bv.group.add(terrain.visual);
    if (!this.hexModels) {
      const ids = new Set<string>();
      for (const p of this.terrainPlans.values()) {
        for (const v of p.variants) if (v) ids.add(v.id);
        for (const d of p.decor) ids.add(d.model);
      }
      this.hexModels = this.hexKit.loadAll(ids);
    }
    this.hexModels.then(
      (models) => {
        if (this.disposed || bv.terrain !== terrain) return;
        terrain.applyKit(models);
        const decor = new TerrainDecor(grid, plan, terrain.frames, models);
        bv.terrainDecor = decor;
        bv.group.add(decor.group);
        decor.group.visible = false;
        if (bv.structures) decor.setHidden(bv.structures.tileOwner.keys());
        this.overlaysDirty = true;
      },
      (err) => console.warn('Hex kit unavailable, keeping the flat grid', err),
    );
  }

  /** Starts loading a skin's models beyond the base set, once, when the first body with it is built. */
  private loadSkin(skin: Skin): void {
    if (!this.loadModels || skin === 'spacebits' || this.skinLoads.has(skin)) return;
    const extra = skinModels(skin).filter((id) => !BASE_MODEL_IDS.includes(id));
    this.skinLoads.set(skin, this.kit.loadAll(extra));
  }

  private disposeSurface(bv: BodyView): void {
    if (bv.surface) {
      bv.surface.removeFromParent();
      this.surfaceOwner.delete(bv.surface);
    }
    bv.surface = null;
    bv.ownMaterial?.dispose();
    bv.ownMaterial = null;
    bv.grid?.edges.removeFromParent();
    bv.grid?.dispose();
    bv.grid = null;
    bv.terrain?.visual.removeFromParent();
    bv.terrain?.dispose();
    bv.terrain = null;
    bv.terrainDecor?.group.removeFromParent();
    bv.terrainDecor?.dispose();
    bv.terrainDecor = null;
    bv.asteroid?.dispose();
    bv.asteroid = null;
    bv.belt?.dispose();
    bv.belt = null;
    bv.structures?.dispose();
    bv.structures = null;
    bv.outline?.dispose();
    bv.outline = null;
    for (const g of this.ghosts) if (g.parent === bv.group) g.removeFromParent();
    this.rebuildPickables();
  }

  private clearWorld(): void {
    for (const bv of this.order) {
      this.disposeSurface(bv);
      bv.orbit?.removeFromParent();
      bv.group.removeFromParent();
      this.labels.remove(bv.id);
    }
    for (const g of this.sphereGeos.values()) g.dispose();
    for (const g of this.ringGeos.values()) g.dispose();
    this.sphereGeos.clear();
    this.ringGeos.clear();
    this.bodies.clear();
    this.order = [];
    this.surfaceOwner.clear();
    this.pickables = [];
    this.root = null;
    this.bodySig = '';
  }

  private rebuildPickables(): void {
    this.surfaceOwner.clear();
    for (const bv of this.bodies.values()) if (bv.surface) this.surfaceOwner.set(bv.surface, bv);
    this.pickables = [...this.surfaceOwner.keys()];
  }

  private onModel(id: ModelId): void {
    if (this.disposed) return;
    this.units.useModel(id);
    for (const bv of this.order) {
      bv.structures?.useModel(id);
      bv.belt?.useModel(id);
    }
    this.overlaysDirty = true; // the placement ghost may use it
  }

  // ---------------------------------------------------------------- overlays

  private updateSelection(input: ViewInput): void {
    const focus = this.focusId;
    if (!sameSelection(input.selection, this.sel) || !samePick(input.hover, this.hov) || !samePlacement(input.placement, this.place) || focus !== this.placeFocus) {
      this.sel = copySelection(input.selection);
      this.hov = input.hover ? { ...input.hover } : null;
      this.place = input.placement ? { ...input.placement, tiles: [...input.placement.tiles] } : null;
      this.placeFocus = focus;
      this.overlaysDirty = true;
    }
    if (!this.overlaysDirty) return;
    this.overlaysDirty = false;

    const sel = this.sel;
    const hov = this.hov;
    for (const bv of this.order) {
      if (!bv.grid) continue;
      const selTile = sel.kind === 'TILE' && sel.bodyId === bv.id ? sel.tileIndex : null;
      const hovTile = hov?.kind === 'TILE' && hov.bodyId === bv.id ? hov.tileIndex : null;
      bv.grid.setSelected(selTile);
      bv.grid.setHover(hovTile);
      bv.terrain?.setSelected(selTile);
      bv.terrain?.setHover(hovTile);
      const out = bv.outline ?? this.makeOutline(bv);
      let n = 0;
      const add = (tiles: ReadonlyArray<number>, hex: number) => {
        out.ensure(n + tiles.length * 12, true);
        const from = n * 3;
        const to = bv.grid!.writeOutline(tiles, out.positions, from);
        this.color.setHex(hex);
        for (let o = from; o < to; o += 3) {
          out.colors![o] = this.color.r;
          out.colors![o + 1] = this.color.g;
          out.colors![o + 2] = this.color.b;
        }
        n = to / 3;
      };
      if (hov?.kind === 'TILE' && hov.bodyId === bv.id) add([hov.tileIndex], SCENE.hover);
      if (hov?.kind === 'STRUCTURE' && hov.bodyId === bv.id) add(this.tilesOf(hov.structureId), SCENE.hover);
      if (sel.kind === 'TILE' && sel.bodyId === bv.id) add([sel.tileIndex], SCENE.selection);
      if (sel.kind === 'STRUCTURE' && this.structureById.get(sel.structureId)?.bodyId === bv.id) add(this.tilesOf(sel.structureId), SCENE.selection);
      if (this.place && focus === bv.id && this.place.tiles.length) add(this.place.tiles, this.place.valid ? SCENE.placementValid : SCENE.placementInvalid);
      out.commit(n);
    }
    this.updateGhost();
  }

  private makeOutline(bv: BodyView): LineBuffer {
    const out = new LineBuffer(this.outlineMat, 256, true, `${bv.body.name}_Outline`);
    out.lines.renderOrder = 10;
    bv.group.add(out.lines);
    bv.outline = out;
    return out;
  }

  private updateGhost(): void {
    for (const g of this.ghosts) g.visible = false;
    const p = this.place;
    const bv = this.placeFocus ? this.bodies.get(this.placeFocus) : undefined;
    const grid = bv?.grid?.grid;
    if (!p || !bv || !grid || p.tiles.length === 0) return;
    // a new building: the L1 look in the body's skin; parts sunk into the ground (a pit) stay out, the
    // ghost draws through it (a part only partly sunk, like the water wheel of a mill, stays in)
    const parts = partsFor(p.kind, 1, bv.structures?.skin ?? skinFor(bv.body));
    const above = parts.filter((part) => partTop(part) > GHOST_MIN_TOP);
    (above.length ? above : parts).forEach((part, i) => {
      const g = this.ghost(i);
      partMatrix(partFrame(grid, p.tiles, part, this.frame), part, g.matrix, this.basis);
      g.geometry = this.kit.edges(part.model);
      g.material = p.valid ? this.ghostOk : this.ghostBad;
      if (g.parent !== bv.group) bv.group.add(g);
      g.matrixWorldNeedsUpdate = true;
      g.visible = true;
    });
  }

  /** Placement ghost line object `i` (one per part of the placed kind), made on first use. */
  private ghost(i: number): THREE.LineSegments {
    let g = this.ghosts[i];
    if (!g) {
      g = new THREE.LineSegments(this.kit.edges('structure_tall'), this.ghostOk);
      g.name = `PlacementGhost${i}`;
      g.matrixAutoUpdate = false;
      g.visible = false;
      g.renderOrder = 20;
      this.ghosts[i] = g;
    }
    return g;
  }

  private tilesOf(structureId: string): number[] {
    return this.structureById.get(structureId)?.tiles.map(tileIndexOf) ?? [];
  }

  private drawScreenOverlay(): void {
    const o = this.overlay;
    o.begin();
    const cam = this.rig.camera;
    // unit markers for ships too small to see
    for (const [id, pos] of this.units.shipPos) {
      projectPoint(pos, cam, this.width, this.height, this.tmp, this.sp);
      if (!this.sp.visible) continue;
      const len = this.units.shipSize.get(id) ?? 8;
      if (pixelRadius(len, this.sp.depth, cam, this.height) < MARKER_BELOW_PX) o.diamond(this.sp.x, this.sp.y, len > 8 ? 6 : 4, SCENE.marker);
    }
    this.bracketFor(this.sel, SCENE.selection);
    if (this.hov && !sameTarget(this.hov, this.sel)) this.bracketFor(this.hov, SCENE.hover);
    o.end();
  }

  /** Corner brackets around the target of a selection or hover (tiles use outlines instead). */
  private bracketFor(target: Selection | PickResult, hex: number): void {
    let radius = 0;
    let min = 10;
    switch (target.kind) {
      case 'BODY': {
        const bv = this.bodies.get(target.bodyId);
        if (!bv) return;
        this.tmp2.copy(bv.world);
        radius = bv.body.kind === 'BELT' ? bv.body.radius * 1.5 : bv.body.radius;
        break;
      }
      case 'SHIP': {
        const p = this.units.shipPos.get(target.shipId);
        if (!p) return;
        this.tmp2.copy(p);
        radius = (this.units.shipSize.get(target.shipId) ?? 8) * 0.6;
        min = 9;
        break;
      }
      case 'ROVER': {
        const p = this.units.roverPos.get(target.roverId);
        if (!p) return;
        this.tmp2.copy(p);
        radius = (this.units.roverSize.get(target.roverId) ?? 2) * 0.7;
        min = 8;
        break;
      }
      case 'STRUCTURE': {
        const s = this.structureById.get(target.structureId);
        const bv = s ? this.bodies.get(s.bodyId) : undefined;
        const part = bv?.structures?.partsOf(target.structureId)[0];
        if (!bv || !part) return;
        this.tmp2.copy(part.center).applyMatrix4(bv.group.matrixWorld);
        radius = part.width * 0.6;
        break;
      }
      default:
        return;
    }
    const cam = this.rig.camera;
    projectPoint(this.tmp2, cam, this.width, this.height, this.tmp, this.sp);
    if (!this.sp.visible) return;
    const half = Math.max(min, pixelRadius(radius, this.sp.depth, cam, this.height) * 1.15);
    if (half > Math.max(this.width, this.height)) return; // the camera is inside it
    this.overlay.bracket(this.sp.x, this.sp.y, half, hex);
  }

  /** Apparent radius of a body on screen [px]. */
  private apparentRadius(bv: BodyView): number {
    return pixelRadius(bv.body.radius, this.rig.camera.position.distanceTo(bv.world), this.rig.camera, this.height);
  }

  /** Tile edges and buildings only where they can be seen: saves draw calls and noise in the overview. */
  private updateDetail(): void {
    for (const bv of this.order) {
      if (!bv.grid) continue;
      const pr = this.apparentRadius(bv);
      // near: hex-kit terrain (when built) instead of the fan grid, whose mesh stays the raycast proxy
      const terrain = bv.terrain?.ready === true && pr >= EDGES_MIN_PX;
      bv.grid.mesh.visible = !terrain;
      bv.grid.edges.visible = pr >= EDGES_MIN_PX && !bv.terrain;
      if (bv.terrain) bv.terrain.visual.visible = terrain;
      if (bv.terrainDecor) bv.terrainDecor.group.visible = terrain;
      if (bv.structures) bv.structures.group.visible = pr >= STRUCTURES_MIN_PX;
      if (bv.outline) bv.outline.lines.visible = pr >= STRUCTURES_MIN_PX && bv.outline.lines.geometry.drawRange.count > 0;
    }
  }

  private placeLabels(): void {
    const cam = this.rig.camera;
    for (const bv of this.order) {
      projectPoint(bv.world, cam, this.width, this.height, this.tmp, this.sp);
      const pr = Math.min(pixelRadius(bv.body.kind === 'BELT' ? 0 : bv.body.radius, this.sp.depth, cam, this.height), this.height);
      const y = this.sp.y - pr - 4;
      const on = this.sp.visible && this.sp.x > -40 && this.sp.x < this.width + 40 && y > 8 && y < this.height + 20;
      this.labels.place(bv.id, on ? this.sp.x : null, y, bv.id === this.focusId);
    }
  }

  private updateOrbitFocus(): void {
    if (this.focusId === this.orbitFocus) return;
    if (this.orbitFocus) {
      const prev = this.bodies.get(this.orbitFocus)?.orbit;
      if (prev) prev.material = this.orbitMat;
    }
    this.orbitFocus = this.focusId;
    const cur = this.focusId ? this.bodies.get(this.focusId)?.orbit : null;
    if (cur) cur.material = this.orbitFocusMat;
  }

  // ---------------------------------------------------------------- camera

  private focusOf(input: ViewInput): BodyView | null {
    const id = input.focusBodyId ?? this.defaultFocusId;
    return (id && this.bodies.get(id)) || this.root;
  }

  private updateCamera(dt: number, focus: BodyView | null): void {
    const g = this.goal;
    if (this.mode === 'system' || !focus) {
      const centre = this.root?.world ?? this.tmp.set(0, 0, 0);
      const d = fitDistance(this.extent, FOV, this.width / this.height, 1.05);
      g.target.copy(centre);
      g.key = 'system';
      g.distance = d;
      g.phi = 0.78;
      g.theta = 0.35;
      g.minDistance = this.extent * 0.05;
      g.maxDistance = d * 3;
    } else {
      const r = focus.body.kind === 'BELT' ? focus.body.radius * 3 : focus.body.radius;
      g.target.copy(focus.world);
      g.key = focus.planetKey;
      g.distance = r * (focus.body.kind === 'STAR' ? 6 : 3.4);
      const colony = focus.structures && focus.structures.parts.length ? focus.structures.centroid : null;
      if (colony) {
        // look at the colony, from a little higher up so the buildings stand out against the ground
        g.phi = Math.min(Math.PI - 0.3, Math.max(0.3, Math.acos(Math.max(-1, Math.min(1, colony.y))) - 0.35));
        g.theta = Math.atan2(colony.x, colony.z);
      } else {
        // look at the lit side, a little off the star direction so the terminator shows
        const centre = this.root?.world;
        g.phi = 1.05;
        g.theta = centre && focus !== this.root ? Math.atan2(centre.x - focus.world.x, centre.z - focus.world.z) + 0.6 : 0.4;
      }
      // never inside the tallest decor (the castle reaches ~1.31 R on Tau Ceti c): the near view would cut it open
      g.minDistance = Math.max(r * 1.3, (focus.terrainDecor?.topRadius ?? 0) + r * 0.1);
      g.maxDistance = r * 18;
    }
    this.rig.update(dt, g);
  }

  // ---------------------------------------------------------------- rendering

  private render(withOverlay: boolean): void {
    const r = this.renderer;
    r.render(this.scene, this.rig.camera);
    let calls = r.info?.render.calls ?? 0;
    let tris = r.info?.render.triangles ?? 0;
    if (withOverlay && !this.overlay.empty) {
      const auto = r.autoClear;
      r.autoClear = false;
      r.clearDepth();
      r.render(this.overlay.scene, this.overlay.camera);
      r.autoClear = auto;
      calls += r.info?.render.calls ?? 0;
      tris += r.info?.render.triangles ?? 0;
    }
    this.frameStats.drawCalls = calls;
    this.frameStats.triangles = tris;
  }

  private nearestUnit(positions: Map<string, THREE.Vector3>, sizes: Map<string, number>, x: number, y: number, occluder: number): string | null {
    const cam = this.rig.camera;
    let best: string | null = null;
    let bestPx = Infinity;
    for (const [id, pos] of positions) {
      projectPoint(pos, cam, this.width, this.height, this.tmp, this.sp);
      if (!this.sp.visible) continue;
      const size = sizes.get(id) ?? 1;
      if (this.sp.depth > occluder + size) continue;
      const r = Math.max(UNIT_PICK_PX, pixelRadius(size / 2, this.sp.depth, cam, this.height));
      const d = Math.hypot(this.sp.x - x, this.sp.y - y);
      if (d <= r && d < bestPx) {
        bestPx = d;
        best = id;
      }
    }
    return best;
  }

  /** Plain bodies: an icosphere, whose even flat facets read better than UV-sphere bands. */
  private sphere(radius: number): THREE.BufferGeometry {
    let g = this.sphereGeos.get(radius);
    if (!g) {
      g = new THREE.IcosahedronGeometry(radius, 5);
      this.sphereGeos.set(radius, g);
    }
    return g;
  }

  private ring(radius: number): THREE.BufferGeometry {
    let g = this.ringGeos.get(radius);
    if (!g) {
      const pts: THREE.Vector3[] = [];
      const segments = 160;
      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        pts.push(new THREE.Vector3(radius * Math.cos(a), 0, radius * Math.sin(a)));
      }
      g = new THREE.BufferGeometry().setFromPoints(pts);
      this.ringGeos.set(radius, g);
    }
    return g;
  }
}

const EMPTY_SET: ReadonlySet<number> = new Set();
const NO_STRUCTURES: Structure[] = [];

function minerals(body: CelestialBody): number {
  let n = 0;
  for (const k in body.resources ?? {}) n += body.resources![k] ?? 0;
  return n;
}

function buildStarfield(): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
  const rnd = mulberry32(0x5eed);
  const positions = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    const z = rnd() * 2 - 1;
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z) * STAR_RADIUS;
    positions[i * 3] = r * Math.cos(a);
    positions[i * 3 + 1] = z * STAR_RADIUS;
    positions[i * 3 + 2] = r * Math.sin(a);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(g, new THREE.PointsMaterial({ color: SCENE.starfield, size: 1.5, sizeAttenuation: false }));
  points.name = 'Starfield';
  points.frustumCulled = false;
  return points;
}

export function sameSelection(a: Selection, b: Selection): boolean {
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'NONE':
      return true;
    case 'BODY':
      return a.bodyId === (b as typeof a).bodyId;
    case 'TILE':
      return a.bodyId === (b as typeof a).bodyId && a.tileIndex === (b as typeof a).tileIndex;
    case 'STRUCTURE':
      return a.structureId === (b as typeof a).structureId;
    case 'SHIP':
      return a.shipId === (b as typeof a).shipId;
    case 'ROVER':
      return a.roverId === (b as typeof a).roverId;
    case 'STAR':
      return a.starName === (b as typeof a).starName;
  }
}

export function samePick(a: PickResult | null, b: PickResult | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'EMPTY':
      return true;
    case 'BODY':
      return a.bodyId === (b as typeof a).bodyId;
    case 'TILE':
      return a.bodyId === (b as typeof a).bodyId && a.tileIndex === (b as typeof a).tileIndex;
    case 'STRUCTURE':
      return a.structureId === (b as typeof a).structureId && a.tileIndex === (b as typeof a).tileIndex;
    case 'SHIP':
      return a.shipId === (b as typeof a).shipId;
    case 'ROVER':
      return a.roverId === (b as typeof a).roverId;
    case 'STAR':
      return a.starName === (b as typeof a).starName;
    case 'ATANOR_HEX':
      return a.q === (b as typeof a).q && a.r === (b as typeof a).r;
  }
}

export function samePlacement(a: Placement | null, b: Placement | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.kind !== b.kind || a.valid !== b.valid || a.tiles.length !== b.tiles.length) return false;
  for (let i = 0; i < a.tiles.length; i++) if (a.tiles[i] !== b.tiles[i]) return false;
  return true;
}

/** Whether a hover points at the same thing as the selection (then only the selection bracket shows). */
function sameTarget(h: PickResult, s: Selection): boolean {
  if (h.kind === 'BODY' && s.kind === 'BODY') return h.bodyId === s.bodyId;
  if (h.kind === 'SHIP' && s.kind === 'SHIP') return h.shipId === s.shipId;
  if (h.kind === 'ROVER' && s.kind === 'ROVER') return h.roverId === s.roverId;
  if (h.kind === 'STRUCTURE' && s.kind === 'STRUCTURE') return h.structureId === s.structureId;
  return false;
}

function copySelection(s: Selection): Selection {
  return { ...s };
}
