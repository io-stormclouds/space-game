import * as THREE from 'three';
import type { FrameData } from '@space-game/api';
import { TRAJECTORY_SAMPLES, tileWidth, type BezierPath, type BodyId, type PlanetGrid, type Spacecraft, type Vec3, type WorldState } from '@space-game/domain';
import { InstancedBatch } from './buffers';
import type { ModelKit } from './model-kit';
import { MODELS, ROVER_MODEL, SHIP_MODEL, fitScale, type ModelId } from './model-registry';
import { SCENE } from './palette';
import { flightKey, flightPath, flightProgress, roverRestPosition } from './placement';

/** World length of a ship (PoC SHIP_LENGTH); the mothership is larger. */
export const SHIP_LENGTH = 8;
export const MOTHERSHIP_SCALE = 1.8;

export function shipLength(ship: Pick<Spacecraft, 'role'>): number {
  return ship.role === 'MOTHERSHIP' ? SHIP_LENGTH * MOTHERSHIP_SCALE : SHIP_LENGTH;
}

const UP = new THREE.Vector3(0, 1, 0);
const FORWARD = new THREE.Vector3(0, 0, 1);

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
}

interface Flight {
  key: string;
  path: BezierPath;
  line: THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial>;
}

/**
 * Ships and rovers as two InstancedMeshes in world space (one draw call each), plus the dashed
 * flight path of every ship in transit (remaining part only). Positions are recomputed every frame
 * from the snapshot, the frame data and the analytic orbits; nothing is allocated per frame once a
 * unit exists.
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
  private readonly flights = new Map<string, Flight>();
  private readonly roverLocal = new Map<string, THREE.Vector3>();
  private readonly roverFwd = new Map<string, THREE.Vector3>();
  private readonly flightMaterial = new THREE.LineDashedMaterial({ color: SCENE.flightPath, dashSize: 12, gapSize: 8 });
  private readonly flightSelectedMaterial = new THREE.LineDashedMaterial({ color: SCENE.flightPathSelected, dashSize: 12, gapSize: 8 });
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

  constructor(private readonly kit: ModelKit) {
    this.group.name = 'Units';
    this.ships = new InstancedBatch(this.group, kit.geometry(SHIP_MODEL), kit.material, 'Ships', 4);
    this.rovers = new InstancedBatch(this.group, kit.geometry(ROVER_MODEL), kit.material, 'Rovers', 8);
  }

  useModel(id: ModelId): void {
    if (id === SHIP_MODEL) this.ships.setGeometry(this.kit.geometry(id));
    if (id === ROVER_MODEL) this.rovers.setGeometry(this.kit.geometry(id));
  }

  update(ctx: UnitContext): void {
    this.updateShips(ctx);
    this.updateRovers(ctx);
  }

  /** Draw calls this layer issues (tests and stats). */
  get drawables(): number {
    let n = (this.ships.mesh.visible ? 1 : 0) + (this.rovers.mesh.visible ? 1 : 0);
    for (const f of this.flights.values()) if (f.line.visible) n++;
    return n;
  }

  dispose(): void {
    this.ships.dispose();
    this.rovers.dispose();
    for (const f of this.flights.values()) f.line.geometry.dispose();
    this.flights.clear();
    this.flightMaterial.dispose();
    this.flightSelectedMaterial.dispose();
    this.group.removeFromParent();
  }

  private updateShips(ctx: UnitContext): void {
    const ships = ctx.world.ships;
    this.ships.ensure(ships.length);
    this.docked.clear();
    this.seen.clear();
    const spec = MODELS[SHIP_MODEL];
    let n = 0;
    for (const ship of ships) {
      const pos = this.vec(this.shipPos, ship.id);
      const len = shipLength(ship);
      const sc = fitScale(spec, len);
      if (ship.state === 'IN_TRANSIT' && ship.transfer) {
        const f = this.flight(ship.id, ship.transfer, ctx.selectedShip === ship.id);
        const u = ctx.frame?.transit[ship.id] ?? flightProgress(ship.transfer, ctx.time);
        f.path.pointAt(u, this.v);
        pos.set(this.v.x, this.v.y, this.v.z);
        f.path.tangentAt(u, this.v);
        this.a.set(this.v.x, this.v.y, this.v.z);
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
          pos.addScaledVector(this.c, k * SHIP_LENGTH * 1.6);
        }
        this.q.setFromUnitVectors(UP, this.a);
      } else {
        this.shipPos.delete(ship.id);
        continue;
      }
      this.shipSize.set(ship.id, len);
      this.s.set(sc, sc, sc);
      this.ships.setMatrixAt(n++, this.m.compose(pos, this.q, this.s));
    }
    this.ships.commit(n);
    for (const [key, f] of this.flights) {
      if (this.seen.has(key)) continue;
      f.line.removeFromParent();
      f.line.geometry.dispose();
      this.flights.delete(key);
    }
    if (this.shipPos.size > ships.length || this.shipSize.size > ships.length) {
      const keep = new Set<string>(ships.map((s) => s.id));
      this.prune(this.shipPos, keep);
      this.prune(this.shipSize, keep);
    }
  }

  private updateRovers(ctx: UnitContext): void {
    const rovers = ctx.world.rovers;
    this.rovers.ensure(rovers.length);
    const spec = MODELS[ROVER_MODEL];
    let n = 0;
    for (const r of rovers) {
      const grid = ctx.grids.get(r.bodyId);
      const centre = ctx.bodyWorld(r.bodyId);
      if (!grid || !centre) continue;
      const local = this.vec(this.roverLocal, r.id);
      const fwd = this.vec(this.roverFwd, r.id, 0, 0, 1);
      const p = ctx.frame?.rovers[r.id];
      if (p) this.a.set(p[0], p[1], p[2]);
      else {
        roverRestPosition(grid, r.tileIndex, this.v);
        this.a.set(this.v.x, this.v.y, this.v.z);
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
      const width = tileWidth(grid);
      const sc = fitScale(spec, width);
      this.m.scale(this.s.set(sc, sc, sc));
      const world = this.vec(this.roverPos, r.id).copy(centre).add(local);
      this.m.setPosition(world);
      this.roverSize.set(r.id, spec.footprint * sc);
      this.roverBody.set(r.id, r.bodyId);
      this.rovers.setMatrixAt(n++, this.m);
    }
    this.rovers.commit(n);
    if (this.roverLocal.size > rovers.length) {
      const keep = new Set<string>(rovers.map((r) => r.id));
      for (const m of [this.roverPos, this.roverLocal, this.roverFwd, this.roverSize, this.roverBody]) this.prune(m, keep);
    }
  }

  private flight(shipId: string, plan: NonNullable<Spacecraft['transfer']>, selected: boolean): Flight {
    const key = flightKey(plan);
    let f = this.flights.get(key);
    if (!f) {
      const path = flightPath(plan);
      path.sample(this.samples);
      const g = new THREE.BufferGeometry().setFromPoints(this.samples.map((p) => new THREE.Vector3(p.x, p.y, p.z)));
      const line = new THREE.Line(g, selected ? this.flightSelectedMaterial : this.flightMaterial);
      line.computeLineDistances();
      line.name = `Flight_${shipId}`;
      line.frustumCulled = false;
      line.renderOrder = 5;
      this.group.add(line);
      f = { key, path, line };
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
