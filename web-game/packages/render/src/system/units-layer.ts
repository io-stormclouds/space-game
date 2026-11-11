import * as THREE from 'three';
import type { FrameData } from '@space-game/api';
import { TRAJECTORY_SAMPLES, tileWidth, type BezierPath, type BodyId, type PlanetGrid, type Spacecraft, type TransferPlan, type Vec3, type WorldState } from '@space-game/domain';
import { InstancedBatch, drawnInstances } from './buffers';
import { OCCLUDER } from './hemisphere-culler';
import { boxMatrix, paintGeometry, type ModelKit } from './model-kit';
import { MODELS, ROVER_MODEL, SHIP_MODEL, fitScale, type ModelId } from './model-registry';
import { SCENE } from './palette';
import { flightKey, flightPath, flightProgress, roverRestPosition } from './placement';
import type { FlightMap } from './view-scale';

/** World length of a ship (PoC SHIP_LENGTH); the mothership is larger. */
export const SHIP_LENGTH = 8;
export const MOTHERSHIP_SCALE = 1.8;

/**
 * Unit LOD (T4b): a ship or rover shorter than this on screen, or docked at / driving on a far body (whose
 * structures are proxies), is drawn as a low-poly proxy (ship: an 8-triangle dart, rover: a 12-triangle box, both
 * fitted to the model's bounds and in its mean colour), and as the full model again once longer than UNIT_FULL_PX
 * (hysteresis) [px]. Ships under 6 px get the diamond marker on top.
 */
export const UNIT_LOD_PX = 8;
export const UNIT_FULL_PX = 10;

export function shipLength(ship: Pick<Spacecraft, 'role'>): number {
  return ship.role === 'MOTHERSHIP' ? SHIP_LENGTH * MOTHERSHIP_SCALE : SHIP_LENGTH;
}

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);

/** A convex solid round the origin from its corners and faces, each face wound to face outwards (flat shading). */
function convexGeometry(corners: ReadonlyArray<readonly [number, number, number]>, faces: ReadonlyArray<readonly [number, number, number]>): THREE.BufferGeometry {
  const pos: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (const [i, j, k] of faces) {
    a.fromArray(corners[i]!);
    b.fromArray(corners[j]!);
    c.fromArray(corners[k]!);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const out = n.dot(a.clone().add(b).add(c)) >= 0;
    for (const v of out ? [a, b, c] : [a, c, b]) pos.push(v.x, v.y, v.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Ship proxy in the unit box (+Z forward, +Y up): a dart, nose ahead, wings swept back (8 triangles). */
export function shipProxyGeometry(): THREE.BufferGeometry {
  const corners = [
    [0, 0, 0.5], // nose
    [-0.5, -0.1, -0.35], // wings
    [0.5, -0.1, -0.35],
    [0, 0.5, -0.25], // fin
    [0, -0.5, -0.25], // keel
    [0, 0, -0.5], // tail
  ] as const;
  const faces = [
    [0, 3, 2],
    [0, 2, 4],
    [0, 4, 1],
    [0, 1, 3],
    [5, 2, 3],
    [5, 4, 2],
    [5, 1, 4],
    [5, 3, 1],
  ] as const;
  return convexGeometry(corners, faces);
}

/** Rover proxy in the unit box: a box (12 triangles). */
export function roverProxyGeometry(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(1, 1, 1);
}

/** Where bodies are this frame and where ships dock (supplied by the view). */
export interface UnitContext {
  world: WorldState;
  frame: FrameData | null;
  time: number;
  grids: ReadonlyMap<BodyId, PlanetGrid>;
  bodyWorld(id: BodyId): THREE.Vector3 | undefined;
  /** Docking point in the body's local frame. */
  docking(id: BodyId): Vec3;
  /** Parking orbit in the body's local frame, ignoring landing pads (the mothership never lands). */
  orbit(id: BodyId): Vec3;
  /** Ship whose flight path is drawn in the signal colour. */
  selectedShip: string | null;
  /** Unit LOD and rover culling (T4b); null = every unit as its full model, nothing culled (`cullDetail: false`). */
  detail: UnitDetail | null;
  /**
   * Presentation scale (`view-scale.ts`): scene units per world unit of a body's frame (rover positions and
   * sizes on it, and `docking` / `orbit` are already in scene units), of ships, and the scene curve of a flight.
   * Absent = world units.
   */
  scaleOf?(id: BodyId): number;
  unitScale?: number;
  mapFlight?(plan: TransferPlan): FlightMap | null;
}

/** What the unit level of detail needs from the view (T4b). */
export interface UnitDetail {
  /** Camera position (world). */
  camera: THREE.Vector3;
  /** Length on screen of `size` world units at `pos` [px]. */
  apparentPx(pos: THREE.Vector3, size: number): number;
  /** A far body (its structures drawn as proxies): the units docked at it or driving on it are proxies too. */
  far(id: BodyId): boolean;
  /** Whether a sphere (world) touches the camera's view frustum: a unit outside it is not drawn. */
  inView(pos: THREE.Vector3, radius: number): boolean;
}

interface Flight {
  key: string;
  path: BezierPath;
  /** The curve in the scene; null = world units. */
  map: FlightMap | null;
  line: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>;
}

/**
 * Ships and rovers as two InstancedMeshes in scene space (the view scale, `UnitContext.scaleOf` / `unitScale` /
 * `mapFlight`; one draw call each), plus the dashed
 * flight path of every ship in transit (remaining part only). Positions are recomputed every frame
 * from the snapshot, the frame data and the analytic orbits; nothing is allocated per frame once a
 * unit exists. With `ctx.detail` (T4b) units shorter than UNIT_LOD_PX on screen or at a far body go to
 * two more InstancedMeshes of proxies (made up front, hidden while empty), and units outside the
 * view frustum or rovers behind the horizon of their body are not drawn; picking works on
 * `shipPos` / `roverPos` and does not care which mesh draws a unit.
 */
export class UnitsLayer {
  readonly group = new THREE.Group();
  /** World position, length and up vector of every visible ship / rover (picking, brackets). */
  readonly shipPos = new Map<string, THREE.Vector3>();
  readonly shipSize = new Map<string, number>();
  readonly roverPos = new Map<string, THREE.Vector3>();
  readonly roverSize = new Map<string, number>();
  readonly roverBody = new Map<string, BodyId>();
  private readonly ships: InstancedBatch;
  private readonly rovers: InstancedBatch;
  private readonly shipProxies: InstancedBatch;
  private readonly roverProxies: InstancedBatch;
  private readonly batches: ReadonlyArray<InstancedBatch>;
  /** Proxy shapes in the unit box, painted in the model's tone (owned). */
  private readonly shipProxyGeometry = shipProxyGeometry();
  private readonly roverProxyGeometry = roverProxyGeometry();
  /** Unit box → model box of the ship and rover models (`boxMatrix`). */
  private readonly shipFit = new THREE.Matrix4();
  private readonly roverFit = new THREE.Matrix4();
  /** Units drawn as proxies now (hysteresis). */
  private readonly proxyShips = new Set<string>();
  private readonly proxyRovers = new Set<string>();
  private readonly flights = new Map<string, Flight>();
  private readonly roverLocal = new Map<string, THREE.Vector3>();
  private readonly roverFwd = new Map<string, THREE.Vector3>();
  private readonly flightMaterial: THREE.LineDashedMaterial;
  private readonly flightSelectedMaterial: THREE.LineDashedMaterial;
  private readonly docked = new Map<BodyId, number>();
  private readonly seen = new Set<string>();
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly c = new THREE.Vector3();
  private readonly v: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly samples: Vec3[] = Array.from({ length: TRAJECTORY_SAMPLES }, () => ({ x: 0, y: 0, z: 0 }));

  /** `dashScale`: scene units per world unit of the flight lines' dashes (the flights' scale between planets). */
  constructor(
    private readonly kit: ModelKit,
    dashScale = 1,
  ) {
    this.group.name = 'Units';
    const dash = { dashSize: 12 * dashScale, gapSize: 8 * dashScale };
    this.flightMaterial = new THREE.LineDashedMaterial({ color: SCENE.flightPath, ...dash });
    this.flightSelectedMaterial = new THREE.LineDashedMaterial({ color: SCENE.flightPathSelected, ...dash });
    this.ships = new InstancedBatch(this.group, kit.geometry(SHIP_MODEL), kit.material, 'Ships', 4);
    this.rovers = new InstancedBatch(this.group, kit.geometry(ROVER_MODEL), kit.material, 'Rovers', 8);
    this.shipProxies = new InstancedBatch(this.group, this.shipProxyGeometry, kit.material, 'ShipProxies', 4);
    this.roverProxies = new InstancedBatch(this.group, this.roverProxyGeometry, kit.material, 'RoverProxies', 8);
    this.batches = [this.ships, this.rovers, this.shipProxies, this.roverProxies];
    this.fitProxy(SHIP_MODEL);
    this.fitProxy(ROVER_MODEL);
  }

  useModel(id: ModelId): void {
    if (id === SHIP_MODEL) this.ships.setGeometry(this.kit.geometry(id));
    if (id === ROVER_MODEL) this.rovers.setGeometry(this.kit.geometry(id));
    this.fitProxy(id);
  }

  update(ctx: UnitContext): void {
    this.updateShips(ctx);
    this.updateRovers(ctx);
  }

  /** Draw calls this layer issues (tests and stats). */
  get drawables(): number {
    let n = 0;
    for (const b of this.batches) if (b.mesh.visible) n++;
    for (const f of this.flights.values()) if (f.line.visible) n++;
    return n;
  }

  /** Ships and rovers drawn as full models and as proxies this frame (tests, harness). */
  get drawnUnits(): { ships: number; shipProxies: number; rovers: number; roverProxies: number } {
    return { ships: this.ships.drawn, shipProxies: this.shipProxies.drawn, rovers: this.rovers.drawn, roverProxies: this.roverProxies.drawn };
  }

  /** Adds the triangles and instances of the ships and rovers (models and proxies) drawn this frame. */
  drawn(out: { triangles: number; instances: number }): void {
    for (const b of this.batches) drawnInstances(b.mesh, out);
  }

  dispose(): void {
    this.ships.dispose();
    this.rovers.dispose();
    this.shipProxies.dispose();
    this.roverProxies.dispose();
    this.shipProxyGeometry.dispose();
    this.roverProxyGeometry.dispose();
    for (const f of this.flights.values()) f.line.geometry.dispose();
    this.flights.clear();
    this.flightMaterial.dispose();
    this.flightSelectedMaterial.dispose();
    this.group.removeFromParent();
  }

  private updateShips(ctx: UnitContext): void {
    const ships = ctx.world.ships;
    this.ships.ensure(ships.length);
    this.shipProxies.ensure(ships.length);
    this.docked.clear();
    this.seen.clear();
    const spec = MODELS[SHIP_MODEL];
    const unit = ctx.unitScale ?? 1;
    let n = 0;
    let np = 0;
    for (const ship of ships) {
      const pos = this.vec(this.shipPos, ship.id);
      const len = shipLength(ship) * unit;
      const sc = fitScale(spec, len);
      if (ship.state === 'IN_TRANSIT' && ship.transfer) {
        const f = this.flight(ship.id, ship.transfer, ctx);
        const u = ctx.frame?.transit[ship.id] ?? flightProgress(ship.transfer, ctx.time);
        if (f.map) f.map.at(f.path, u, this.v);
        else f.path.pointAt(u, this.v);
        pos.set(this.v.x, this.v.y, this.v.z);
        if (f.map) f.map.tangent(f.path, u, this.v);
        else f.path.tangentAt(u, this.v);
        this.a.set(this.v.x, this.v.y, this.v.z).normalize();
        this.q.setFromUnitVectors(FORWARD, this.a);
        const from = Math.min(TRAJECTORY_SAMPLES - 2, Math.floor(u * (TRAJECTORY_SAMPLES - 1)));
        f.line.geometry.setDrawRange(from, TRAJECTORY_SAMPLES - from);
        f.line.material = ctx.selectedShip === ship.id ? this.flightSelectedMaterial : this.flightMaterial;
        f.line.visible = true;
        this.seen.add(f.key);
      } else if (ship.currentBodyId) {
        const centre = ctx.bodyWorld(ship.currentBodyId);
        if (!centre) {
          this.shipPos.delete(ship.id);
          continue;
        }
        const off = ship.role === 'MOTHERSHIP' ? ctx.orbit(ship.currentBodyId) : ctx.docking(ship.currentBodyId);
        this.a.set(off.x, off.y, off.z);
        const k = this.docked.get(ship.currentBodyId) ?? 0;
        this.docked.set(ship.currentBodyId, k + 1);
        pos.copy(centre).add(this.a);
        this.a.normalize();
        if (k > 0) {
          // several ships at one body: line them up along a tangent
          this.b.set(0, 0, 1);
          if (Math.abs(this.a.z) > 0.9) this.b.set(1, 0, 0);
          this.c.crossVectors(this.a, this.b).normalize();
          pos.addScaledVector(this.c, k * SHIP_LENGTH * unit * 1.6);
        }
        this.q.setFromUnitVectors(UP, this.a);
      } else {
        this.shipPos.delete(ship.id);
        continue;
      }
      this.shipSize.set(ship.id, len);
      if (ctx.detail && !ctx.detail.inView(pos, len)) continue; // off screen: not drawn (still pickable data)
      this.s.set(sc, sc, sc);
      this.m.compose(pos, this.q, this.s);
      const docked = ship.state !== 'IN_TRANSIT' ? ship.currentBodyId : null;
      if (this.asProxy(ctx, this.proxyShips, ship.id, pos, len, docked)) this.shipProxies.setMatrixAt(np++, this.m.multiply(this.shipFit));
      else this.ships.setMatrixAt(n++, this.m);
    }
    this.ships.commit(n);
    this.shipProxies.commit(np);
    for (const [key, f] of this.flights) {
      if (this.seen.has(key)) continue;
      f.line.removeFromParent();
      f.line.geometry.dispose();
      this.flights.delete(key);
    }
    if (this.shipPos.size > ships.length || this.shipSize.size > ships.length || this.proxyShips.size > ships.length) {
      const keep = new Set<string>(ships.map((s) => s.id));
      this.prune(this.shipPos, keep);
      this.prune(this.shipSize, keep);
      for (const id of this.proxyShips) if (!keep.has(id)) this.proxyShips.delete(id);
    }
  }

  /**
   * Whether a unit `size` long at `pos` is drawn as a proxy now: on a far body (`at`, where it is docked or drives),
   * or shorter than UNIT_LOD_PX on screen (with hysteresis, `proxied` keeps the state). Never without `ctx.detail`.
   */
  private asProxy(ctx: UnitContext, proxied: Set<string>, id: string, pos: THREE.Vector3, size: number, at: BodyId | null): boolean {
    const detail = ctx.detail;
    if (!detail) return false;
    const was = proxied.has(id);
    const px = detail.apparentPx(pos, size);
    const small = was ? px < UNIT_FULL_PX : px < UNIT_LOD_PX;
    if (small && !was) proxied.add(id);
    else if (!small && was) proxied.delete(id);
    return small || (at !== null && detail.far(at));
  }

  /**
   * A rover (`size` long, at `world`) is behind the horizon of its body (centre, radius R) seen from the camera: the
   * hemisphere test of `HemisphereCuller` for one point, with the rover's size as its height and angular extent.
   */
  private behind(camera: THREE.Vector3, centre: THREE.Vector3, world: THREE.Vector3, R: number, size: number): boolean {
    const occluder = R * OCCLUDER;
    this.b.subVectors(camera, centre);
    const d = this.b.length();
    if (d <= occluder) return false;
    this.c.subVectors(world, centre);
    const r = this.c.length();
    if (r < 1e-9) return false;
    const top = r + size;
    const reach = Math.acos(occluder / d) + (top > occluder ? Math.acos(occluder / top) : 0) + size / occluder;
    return reach < Math.PI && this.b.dot(this.c) / (d * r) < Math.cos(reach);
  }

  /** The proxy of a model follows its bounds and tone (placeholder until the model loads). */
  private fitProxy(id: ModelId): void {
    if (id !== SHIP_MODEL && id !== ROVER_MODEL) return;
    boxMatrix(this.kit.box(id), id === SHIP_MODEL ? this.shipFit : this.roverFit);
    const g = id === SHIP_MODEL ? this.shipProxyGeometry : this.roverProxyGeometry;
    const tone = this.kit.tone(id);
    // repainted in place: the attribute may be on the GPU already
    const col = (g.getAttribute('color') as THREE.BufferAttribute | undefined) ?? paintGeometry(g, 0xffffff).getAttribute('color');
    for (let i = 0; i < col.count; i++) col.setXYZ(i, tone.r, tone.g, tone.b);
    col.needsUpdate = true;
  }

  private updateRovers(ctx: UnitContext): void {
    const rovers = ctx.world.rovers;
    this.rovers.ensure(rovers.length);
    this.roverProxies.ensure(rovers.length);
    const spec = MODELS[ROVER_MODEL];
    let n = 0;
    let np = 0;
    for (const r of rovers) {
      const grid = ctx.grids.get(r.bodyId);
      const centre = ctx.bodyWorld(r.bodyId);
      if (!grid || !centre) continue;
      const k = ctx.scaleOf?.(r.bodyId) ?? 1;
      // local = scene offset from the body centre (the simulation's body frame, scaled with the body)
      const local = this.vec(this.roverLocal, r.id);
      const fwd = this.vec(this.roverFwd, r.id, 0, 0, 1);
      const p = ctx.frame?.rovers[r.id];
      if (p) this.a.set(p[0] * k, p[1] * k, p[2] * k);
      else {
        roverRestPosition(grid, r.tileIndex, this.v);
        this.a.set(this.v.x * k, this.v.y * k, this.v.z * k);
      }
      // forward = direction of travel since the last frame, projected on the tangent plane
      this.b.subVectors(this.a, local);
      const moved = this.b.lengthSq() > 1e-8 && local.lengthSq() > 0;
      local.copy(this.a);
      this.c.copy(local).normalize(); // up
      if (moved) fwd.copy(this.b);
      fwd.addScaledVector(this.c, -fwd.dot(this.c));
      if (fwd.lengthSq() < 1e-10) fwd.set(1, 0, 0).addScaledVector(this.c, -this.c.x);
      fwd.normalize();
      this.b.crossVectors(this.c, fwd); // right = up × forward
      this.m.makeBasis(this.b, this.c, fwd);
      const width = tileWidth(grid) * k;
      const sc = fitScale(spec, width);
      this.m.scale(this.s.set(sc, sc, sc));
      const world = this.vec(this.roverPos, r.id).copy(centre).add(local);
      this.m.setPosition(world);
      const size = spec.footprint * sc;
      this.roverSize.set(r.id, size);
      this.roverBody.set(r.id, r.bodyId);
      // off screen or behind its body: not drawn (position and size stay for picking, which the surface in front
      // of a hidden one wins anyway)
      if (ctx.detail && (!ctx.detail.inView(world, size) || this.behind(ctx.detail.camera, centre, world, grid.radius * k, size))) continue;
      if (this.asProxy(ctx, this.proxyRovers, r.id, world, size, r.bodyId)) this.roverProxies.setMatrixAt(np++, this.m.multiply(this.roverFit));
      else this.rovers.setMatrixAt(n++, this.m);
    }
    this.rovers.commit(n);
    this.roverProxies.commit(np);
    if (this.roverLocal.size > rovers.length || this.proxyRovers.size > rovers.length) {
      const keep = new Set<string>(rovers.map((r) => r.id));
      for (const m of [this.roverPos, this.roverLocal, this.roverFwd, this.roverSize, this.roverBody]) this.prune(m, keep);
      for (const id of this.proxyRovers) if (!keep.has(id)) this.proxyRovers.delete(id);
    }
  }

  private flight(shipId: string, plan: NonNullable<Spacecraft['transfer']>, ctx: UnitContext): Flight {
    const key = flightKey(plan);
    let f = this.flights.get(key);
    if (!f) {
      const path = flightPath(plan);
      const map = ctx.mapFlight?.(plan) ?? null;
      const n = this.samples.length;
      if (map) this.samples.forEach((p, i) => map.at(path, n === 1 ? 0 : i / (n - 1), p));
      else path.sample(this.samples);
      const g = new THREE.BufferGeometry().setFromPoints(this.samples.map((p) => new THREE.Vector3(p.x, p.y, p.z)));
      const line = new THREE.Line(g, ctx.selectedShip === shipId ? this.flightSelectedMaterial : this.flightMaterial);
      line.computeLineDistances();
      line.name = `Flight_${shipId}`;
      line.frustumCulled = false;
      line.renderOrder = 5;
      this.group.add(line);
      f = { key, path, map, line };
      this.flights.set(key, f);
    }
    return f;
  }

  private vec(map: Map<string, THREE.Vector3>, id: string, x = 0, y = 0, z = 0): THREE.Vector3 {
    let v = map.get(id);
    if (!v) {
      v = new THREE.Vector3(x, y, z);
      map.set(id, v);
    }
    return v;
  }

  private prune(map: Map<string, unknown>, keep: Set<string>): void {
    for (const id of map.keys()) if (!keep.has(id)) map.delete(id);
  }
}
