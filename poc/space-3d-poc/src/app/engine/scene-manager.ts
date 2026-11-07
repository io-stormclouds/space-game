import * as THREE from 'three';
import { FrameSnapshot, TRAJECTORY_SAMPLES } from '../game/frame-snapshot';
import { AsteroidShape } from '../game/math/asteroid-shape';
import { CelestialBody } from '../game/models/celestial-body.model';
import { PlanetGrid, Tile } from '../game/models/planet-grid.model';
import { Rover } from '../game/models/rover.model';
import { Spacecraft } from '../game/models/spacecraft.model';
import { Structure, StructureKind } from '../game/models/structure.model';
import { BodyId, RoverId, ShipId } from '../shared/ids';
import { AssetCache } from './asset-cache';
import { AsteroidView } from './asteroid-view';
import { BodyView, EntityViewRegistry } from './entity-view-registry';
import { ModelAsset, ModelLibrary } from './model-library';
import { ROCK_MODEL, ROVER_MODEL, SHIP_MODEL, STRUCTURE_MODELS, baseLift, fitScale } from './model-registry';
import { PlanetGridView } from './planet-grid-view';
import { StructureView } from './structure-view';

const FORWARD = new THREE.Vector3(0, 0, 1);
const UP = new THREE.Vector3(0, 1, 0);
const HIGHLIGHT = new THREE.Color(0x22d3ee);
const SHIP_COLOR = 0xe5e7eb;
const ROVER_COLOR = 0xfbbf24;
/** World length of the ship; the cone and the loaded model are both fitted to it. */
const SHIP_LENGTH = 8;
const GHOST_OK = 0x22c55e;
const GHOST_BAD = 0xef4444;

export interface TileRef {
  bodyId: BodyId;
  tileIndex: number;
}

export interface GhostRef extends TileRef {
  kind: StructureKind;
  ok: boolean;
}

export interface ScreenPoint {
  x: number; // percent of viewport width
  y: number; // percent of viewport height
  visible: boolean;
}

export interface WorldViews {
  grids: ReadonlyMap<BodyId, PlanetGrid>;
  shapes: ReadonlyMap<BodyId, AsteroidShape>;
  structures: ReadonlyArray<Structure>;
  rovers: ReadonlyArray<Rover>;
  /** Docking point per body in its local frame. */
  dockingOffset: (bodyId: BodyId) => { x: number; y: number; z: number };
}

/** Owns the renderer and the scene graph. Draws a FrameSnapshot; holds no game state. */
export class SceneManager {
  readonly registry = new EntityViewRegistry();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.5, 20000);

  private renderer!: THREE.WebGLRenderer;
  private canvas!: HTMLCanvasElement;
  private readonly scene = new THREE.Scene();
  private readonly transitGroup = new THREE.Group();
  private readonly assets = new AssetCache();
  private readonly models = new ModelLibrary();
  private readonly loaded = new Map<string, ModelAsset>();
  private resizeObserver: ResizeObserver | null = null;

  private trajectory!: THREE.Line;
  private trajectoryPositions!: Float32Array;
  private highlighted: ShipId | null = null;
  private highlightedRover: RoverId | null = null;
  private hoverTile: TileRef | null = null;
  private selectedTile: TileRef | null = null;
  private ghost: THREE.Mesh | null = null;
  private ghostRef: GhostRef | null = null;
  private readonly ghostMaterial = new THREE.MeshStandardMaterial({ color: GHOST_OK, transparent: true, opacity: 0.55, depthWrite: false });
  private grids: ReadonlyMap<BodyId, PlanetGrid> = new Map();

  private readonly tmpV = new THREE.Vector3();
  private readonly tmpV2 = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpM = new THREE.Matrix4();

  init(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.scene.background = new THREE.Color(0x02040a);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.25));
    const sun = new THREE.PointLight(0xfff4d6, 2.5, 0, 0);
    sun.position.set(0, 0, 0);
    this.scene.add(sun);
    this.scene.add(this.buildStars());

    this.transitGroup.name = 'InterplanetaryTransitGroup';
    this.scene.add(this.transitGroup);

    this.trajectoryPositions = new Float32Array(TRAJECTORY_SAMPLES * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.trajectoryPositions, 3));
    this.trajectory = new THREE.Line(
      geo,
      new THREE.LineDashedMaterial({ color: 0x22d3ee, dashSize: 12, gapSize: 8, transparent: true, opacity: 0.9, depthTest: false }),
    );
    this.trajectory.renderOrder = 10;
    this.trajectory.visible = false;
    this.scene.add(this.trajectory);

    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
  }

  /** Builds the SOI hierarchy: each body's group is a child of its parent's group. */
  buildWorld(bodies: ReadonlyArray<CelestialBody>, ships: ReadonlyArray<Spacecraft>, views: WorldViews): void {
    this.grids = views.grids;
    const pending = [...bodies];
    // parents first
    while (pending.length) {
      const idx = pending.findIndex((b) => b.parentId === null || this.registry.bodies.has(b.parentId));
      if (idx < 0) throw new Error('Cyclic or orphaned body hierarchy');
      const body = pending.splice(idx, 1)[0];
      const off = views.dockingOffset(body.id);
      this.addBody(body, views.grids.get(body.id) ?? null, views.shapes.get(body.id) ?? null, new THREE.Vector3(off.x, off.y, off.z));
    }
    for (const ship of ships) this.addShip(ship);
    for (const s of views.structures) this.addStructure(s);
    for (const r of views.rovers) this.addRover(r);
  }

  /**
   * Kicks off loading of the KayKit models and swaps them in when they arrive.
   * Until then ships are cones and structures are boxes; nothing else waits for the network.
   */
  loadModels(): Promise<void> {
    const ship = this.models.load(SHIP_MODEL).then((asset) => {
      const s = fitScale(SHIP_MODEL, SHIP_LENGTH);
      for (const view of this.registry.ships.values()) {
        view.mesh.geometry = asset.geometry;
        const material = (asset.material as THREE.MeshStandardMaterial).clone();
        view.mesh.material = material;
        view.material = material;
        view.mesh.scale.setScalar(s);
        view.hitProxy.scale.setScalar(1 / s);
        if (this.highlighted === view.id) material.emissive.copy(HIGHLIGHT);
      }
    });
    const rover = this.models.load(ROVER_MODEL).then((asset) => {
      for (const view of this.registry.rovers.values()) {
        const grid = this.grids.get(view.bodyId);
        const width = grid ? grid.tileEdge * Math.sqrt(3) : 6;
        const s = fitScale(ROVER_MODEL, width);
        view.mesh.geometry = asset.geometry;
        const material = (asset.material as THREE.MeshStandardMaterial).clone();
        view.mesh.material = material;
        view.material = material;
        view.mesh.scale.setScalar(s);
        view.hitProxy.scale.setScalar(1 / s);
        if (this.highlightedRover === view.id) material.emissive.copy(HIGHLIGHT);
      }
    });
    const structures = (Object.keys(STRUCTURE_MODELS) as StructureKind[]).map((kind) =>
      this.models.load(STRUCTURE_MODELS[kind]).then((asset) => {
        this.loaded.set(kind, asset);
        for (const view of this.registry.bodies.values()) view.structures.get(kind)?.useModel(asset, STRUCTURE_MODELS[kind]);
      }),
    );
    const rocks = this.models.load(ROCK_MODEL).then((asset) => {
      this.loaded.set('ROCK', asset);
      for (const view of this.registry.bodies.values()) view.decor?.useModel(asset, ROCK_MODEL);
    });
    return Promise.all([ship, rover, rocks, ...structures]).then(
      () => undefined,
      (err) => console.warn('KayKit models unavailable, keeping placeholder meshes', err),
    );
  }

  /** Hover highlight on a tile grid (engine-only state, not a Signal). */
  setHoverTile(ref: TileRef | null): void {
    if (sameTile(ref, this.hoverTile)) return;
    if (this.hoverTile) this.registry.bodies.get(this.hoverTile.bodyId)?.grid?.setHover(null);
    this.hoverTile = ref;
    if (ref) this.registry.bodies.get(ref.bodyId)?.grid?.setHover(ref.tileIndex);
  }

  setSelectedTile(ref: TileRef | null): void {
    if (sameTile(ref, this.selectedTile)) return;
    if (this.selectedTile) this.registry.bodies.get(this.selectedTile.bodyId)?.grid?.setSelected(null);
    this.selectedTile = ref;
    if (ref) this.registry.bodies.get(ref.bodyId)?.grid?.setSelected(ref.tileIndex);
  }

  /** Translucent preview of a structure on the hovered tile while placing; null hides it. */
  setGhost(ref: GhostRef | null): void {
    if (!ref) {
      if (this.ghost) this.ghost.visible = false;
      this.ghostRef = null;
      return;
    }
    const view = this.registry.bodies.get(ref.bodyId);
    const tile = this.grids.get(ref.bodyId)?.tiles[ref.tileIndex];
    if (!view || !tile) return this.setGhost(null);
    if (!this.ghost) {
      this.ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.ghostMaterial);
      this.ghost.name = 'Ghost';
    }
    if (this.ghost.parent !== view.group) view.group.add(this.ghost);
    const spec = STRUCTURE_MODELS[ref.kind];
    const asset = this.loaded.get(ref.kind);
    const width = this.grids.get(ref.bodyId)!.tileEdge * Math.sqrt(3);
    if (asset && this.ghost.geometry !== asset.geometry) this.ghost.geometry = asset.geometry;
    const s = asset ? fitScale(spec, width) : width * 0.35;
    const lift = asset ? baseLift(spec, s) : s / 2;
    this.placeOnTile(this.ghost, tile, lift, s);
    this.ghostMaterial.color.setHex(ref.ok ? GHOST_OK : GHOST_BAD);
    this.ghost.visible = true;
    this.ghostRef = ref;
  }

  /** Places a structure on its tile; one instanced mesh per kind per body. */
  addStructure(structure: Structure): void {
    const view = this.registry.body(structure.bodyId);
    const tile = this.tileOf(structure.bodyId, structure.tileId);
    if (!view.grid || !tile) return;
    let sv = view.structures.get(structure.kind);
    if (!sv) {
      sv = new StructureView(view.grid.tileEdge * Math.sqrt(3));
      const asset = this.loaded.get(structure.kind);
      if (asset) sv.useModel(asset, STRUCTURE_MODELS[structure.kind]);
      sv.mesh.name = `Structures_${structure.kind}`;
      view.group.add(sv.mesh);
      view.structures.set(structure.kind, sv);
    }
    sv.add(tile);
    view.decor?.remove(tile.index);
  }

  /** Moves the docking point of a body (a landing pad was built). */
  setDockingOffset(bodyId: BodyId, local: { x: number; y: number; z: number }): void {
    this.registry.bodies.get(bodyId)?.dockingOffset.set(local.x, local.y, local.z);
  }

  /** Copies continuous values from the snapshot into the scene graph. */
  sync(snap: FrameSnapshot): void {
    for (const [id, pos] of snap.bodyLocalPos) {
      const view = this.registry.bodies.get(id);
      if (view) view.group.position.set(pos.x, pos.y, pos.z);
    }
    for (const [id, pos] of snap.shipWorldPos) {
      const view = this.registry.ships.get(id);
      if (!view || view.mesh.parent !== this.transitGroup) continue;
      view.mesh.position.set(pos.x, pos.y, pos.z);
      const f = snap.shipForward.get(id);
      if (f) {
        this.tmpV.set(f.x, f.y, f.z);
        view.mesh.quaternion.setFromUnitVectors(FORWARD, this.tmpV);
      }
    }
    for (const [id, pos] of snap.roverLocalPos) {
      const view = this.registry.rovers.get(id);
      if (!view) continue;
      view.mesh.position.set(pos.x, pos.y, pos.z);
      const f = snap.roverForward.get(id);
      if (f) {
        // up = outward normal (position direction), forward = tangent
        this.tmpV.copy(view.mesh.position).normalize(); // up
        this.tmpV2.set(f.x, f.y, f.z);
        this.tmpM.lookAt(this.tmpV2, new THREE.Vector3(0, 0, 0), this.tmpV);
        view.mesh.quaternion.setFromRotationMatrix(this.tmpM);
      }
    }
    if (snap.trajectory) {
      const pts = snap.trajectory.points;
      for (let i = 0; i < pts.length; i++) {
        this.trajectoryPositions[i * 3] = pts[i].x;
        this.trajectoryPositions[i * 3 + 1] = pts[i].y;
        this.trajectoryPositions[i * 3 + 2] = pts[i].z;
      }
      const attr = this.trajectory.geometry.getAttribute('position') as THREE.BufferAttribute;
      attr.needsUpdate = true;
      this.trajectory.geometry.computeBoundingSphere();
      this.trajectory.computeLineDistances();
      this.trajectory.visible = true;
    } else {
      this.trajectory.visible = false;
    }
    this.scene.updateMatrixWorld(true);
  }

  /** Detaches the ship from its body and parents it to the world transit group, keeping its world transform. */
  moveShipToTransit(shipId: ShipId): void {
    const view = this.registry.ship(shipId);
    this.scene.updateMatrixWorld(true);
    this.transitGroup.attach(view.mesh);
  }

  /** Parents the ship to the target's orbital group at its docking offset, upright on the surface normal. */
  moveShipToOrbit(shipId: ShipId, bodyId: BodyId): void {
    const ship = this.registry.ship(shipId);
    const body = this.registry.body(bodyId);
    body.orbitalUnits.attach(ship.mesh);
    this.dockShip(ship.mesh, body);
  }

  /** Shrinks a mined body according to its remaining minerals. */
  setDepletion(bodyId: BodyId, minerals: number): void {
    this.registry.bodies.get(bodyId)?.asteroid?.setDepletion(minerals);
  }

  setHighlighted(shipId: ShipId | null): void {
    if (this.highlighted) {
      const prev = this.registry.ships.get(this.highlighted);
      if (prev) prev.material.emissive.setHex(0x000000);
    }
    this.highlighted = shipId;
    if (shipId) {
      const cur = this.registry.ships.get(shipId);
      if (cur) cur.material.emissive.copy(HIGHLIGHT);
    }
  }

  setHighlightedRover(roverId: RoverId | null): void {
    if (this.highlightedRover) {
      const prev = this.registry.rovers.get(this.highlightedRover);
      if (prev) prev.material.emissive.setHex(0x000000);
    }
    this.highlightedRover = roverId;
    if (roverId) {
      const cur = this.registry.rovers.get(roverId);
      if (cur) cur.material.emissive.copy(HIGHLIGHT);
    }
  }

  structureCount(bodyId: BodyId, kind?: StructureKind): number {
    const view = this.registry.bodies.get(bodyId);
    if (!view) return 0;
    if (kind) return view.structures.get(kind)?.count ?? 0;
    let n = 0;
    for (const sv of view.structures.values()) n += sv.count;
    return n;
  }

  worldPositionOfShip(shipId: ShipId, out: THREE.Vector3): THREE.Vector3 {
    return this.registry.ship(shipId).mesh.getWorldPosition(out);
  }

  worldPositionOfRover(roverId: RoverId, out: THREE.Vector3): THREE.Vector3 | null {
    const v = this.registry.rovers.get(roverId);
    return v ? v.mesh.getWorldPosition(out) : null;
  }

  worldPositionOfBody(bodyId: BodyId, out: THREE.Vector3): THREE.Vector3 {
    return this.registry.body(bodyId).group.getWorldPosition(out);
  }

  /** Projects a body's centre (lifted by its radius) to viewport percentages. */
  projectBody(bodyId: BodyId, radius: number): ScreenPoint {
    this.worldPositionOfBody(bodyId, this.tmpV);
    this.tmpV.y += radius * 1.6;
    this.tmpV.project(this.camera);
    const visible = this.tmpV.z < 1 && Math.abs(this.tmpV.x) <= 1.1 && Math.abs(this.tmpV.y) <= 1.1;
    return { x: ((this.tmpV.x + 1) / 2) * 100, y: ((1 - this.tmpV.y) / 2) * 100, visible };
  }

  render(): void {
    this.renderer.render(this.scene, this.camera);
  }

  get domElement(): HTMLCanvasElement {
    return this.canvas;
  }

  get info(): THREE.WebGLInfo {
    return this.renderer.info;
  }

  dispose(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    for (const v of this.registry.bodies.values()) {
      for (const sv of v.structures.values()) sv.dispose();
      v.decor?.dispose();
    }
    this.ghostMaterial.dispose();
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line || obj instanceof THREE.Points) {
        obj.geometry.dispose();
        const m = obj.material as THREE.Material | THREE.Material[];
        if (Array.isArray(m)) m.forEach((x) => x.dispose());
        else m.dispose();
      }
    });
    this.scene.clear();
    this.registry.clear();
    this.assets.disposeAll();
    this.models.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  private addBody(body: CelestialBody, grid: PlanetGrid | null, shape: AsteroidShape | null, dockingOffset: THREE.Vector3): void {
    const group = new THREE.Group();
    group.name = `${body.name}_Group`;

    let mesh: THREE.Mesh;
    let gridView: PlanetGridView | null = null;
    let asteroidView: AsteroidView | null = null;
    let decor: StructureView | null = null;
    if (grid) {
      gridView = new PlanetGridView(grid, body.color);
      mesh = gridView.mesh;
      group.add(gridView.edges);
      decor = new StructureView(grid.tileEdge * Math.sqrt(3), 0x78716c);
      decor.mesh.name = 'Deposits';
      const rocks = this.loaded.get('ROCK');
      if (rocks) decor.useModel(rocks, ROCK_MODEL);
      for (const t of grid.tiles) if (t.deposit) decor.add(t);
      group.add(decor.mesh);
    } else if (shape) {
      asteroidView = new AsteroidView(shape, body.color, body.resources?.FERRITE ?? 0);
      mesh = asteroidView.mesh;
      asteroidView.setDepletion(body.resources?.FERRITE ?? 0);
    } else {
      const material =
        body.kind === 'STAR'
          ? new THREE.MeshBasicMaterial({ color: body.color })
          : new THREE.MeshStandardMaterial({ color: body.color, roughness: 0.85, metalness: 0.05 });
      mesh = new THREE.Mesh(this.assets.sphere(body.radius), material);
    }
    mesh.name = body.name;
    group.add(mesh);

    const orbitalUnits = new THREE.Group();
    orbitalUnits.name = 'OrbitalUnitsGroup';
    group.add(orbitalUnits);

    const parent = body.parentId ? this.registry.body(body.parentId).group : this.scene;
    parent.add(group);

    let orbitLine: THREE.LineLoop | null = null;
    if (body.orbitRadius > 0) {
      orbitLine = new THREE.LineLoop(this.assets.orbitRing(body.orbitRadius), this.assets.orbitLine());
      orbitLine.name = `${body.name}_Orbit`;
      parent.add(orbitLine);
    }

    this.registry.addBody({
      id: body.id,
      group,
      mesh,
      orbitalUnits,
      orbitLine,
      dockingOffset,
      grid: gridView,
      asteroid: asteroidView,
      structures: new Map(),
      decor,
    });
  }

  private addShip(ship: Spacecraft): void {
    const material = new THREE.MeshStandardMaterial({ color: SHIP_COLOR, roughness: 0.4, metalness: 0.6 });
    const mesh = new THREE.Mesh(this.assets.shipCone(), material);
    mesh.name = ship.name;
    const hitProxy = new THREE.Mesh(this.assets.sphere(12, 8), this.assets.hitProxy());
    mesh.add(hitProxy);

    if (ship.currentBodyId) {
      const body = this.registry.body(ship.currentBodyId);
      body.orbitalUnits.add(mesh);
      this.dockShip(mesh, body);
    } else {
      this.transitGroup.add(mesh);
    }
    this.registry.addShip({ id: ship.id, mesh, material, hitProxy });
  }

  private addRover(rover: Rover): void {
    const body = this.registry.body(rover.bodyId);
    const grid = this.grids.get(rover.bodyId);
    const width = grid ? grid.tileEdge * Math.sqrt(3) : 6;
    const side = width * 0.3;
    const material = new THREE.MeshStandardMaterial({ color: ROVER_COLOR, roughness: 0.6, metalness: 0.3 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(side, side * 0.6, side * 1.4), material);
    mesh.name = rover.name;
    const hitProxy = new THREE.Mesh(this.assets.sphere(width * 0.6, 8), this.assets.hitProxy());
    mesh.add(hitProxy);
    body.group.add(mesh);
    const tile = grid?.tiles[rover.tileIndex];
    if (tile) this.placeOnTile(mesh, tile, side * 0.3, 1);
    this.registry.addRover({ id: rover.id, bodyId: rover.bodyId, mesh, material, hitProxy });
  }

  private dockShip(mesh: THREE.Object3D, body: BodyView): void {
    mesh.position.copy(body.dockingOffset);
    this.tmpV.copy(body.dockingOffset).normalize();
    mesh.quaternion.setFromUnitVectors(UP, this.tmpV);
  }

  private placeOnTile(obj: THREE.Object3D, tile: Tile, lift: number, scale: number): void {
    this.tmpV.set(tile.normal.x, tile.normal.y, tile.normal.z);
    obj.position.set(tile.center.x, tile.center.y, tile.center.z).addScaledVector(this.tmpV, lift);
    obj.quaternion.setFromUnitVectors(UP, this.tmpV);
    obj.scale.setScalar(scale);
  }

  private tileOf(bodyId: BodyId, id: string): Tile | undefined {
    return this.grids.get(bodyId)?.tiles.find((t) => t.id === id);
  }

  private buildStars(): THREE.Points {
    const count = 1500;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(9000 + Math.random() * 3000);
      positions.set([v.x, v.y, v.z], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9ca3af, size: 6, sizeAttenuation: true }));
  }

  private resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}

function sameTile(a: TileRef | null, b: TileRef | null): boolean {
  return a === b || (!!a && !!b && a.bodyId === b.bodyId && a.tileIndex === b.tileIndex);
}
