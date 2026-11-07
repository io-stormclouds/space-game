import { BodyId } from '../../shared/ids';
import { CelestialBody } from '../models/celestial-body.model';
import { Vec3, add, copy, length, set, vec3 } from './vec3';

/**
 * Analytic, deterministic orbit positions. Every body's position is a pure
 * function of game time t, so no numerical drift accumulates.
 */
export class OrbitSolver {
  private readonly byId = new Map<BodyId, CelestialBody>();
  /** Docking point in the body's local frame; default = (0, radius × factor, 0). */
  private readonly dockingOffsets = new Map<BodyId, Vec3>();
  private readonly tmp = vec3();

  constructor(bodies: ReadonlyArray<CelestialBody>) {
    for (const b of bodies) this.byId.set(b.id, b);
  }

  body(id: BodyId): CelestialBody {
    const b = this.byId.get(id);
    if (!b) throw new Error(`Unknown body ${id}`);
    return b;
  }

  /** Position in the parent's frame: (r·cos(ωt+φ), 0, r·sin(ωt+φ)). */
  localPosition(bodyId: BodyId, t: number, out: Vec3): Vec3 {
    const b = this.body(bodyId);
    if (b.orbitRadius === 0) return set(out, 0, 0, 0);
    const a = b.orbitSpeed * t + b.initialAngle;
    return set(out, b.orbitRadius * Math.cos(a), 0, b.orbitRadius * Math.sin(a));
  }

  /** Heliocentric position: sum of local positions along the parent chain. */
  worldPosition(bodyId: BodyId, t: number, out: Vec3): Vec3 {
    set(out, 0, 0, 0);
    let cur: CelestialBody | null = this.body(bodyId);
    while (cur) {
      this.localPosition(cur.id, t, this.tmp);
      add(out, out, this.tmp);
      cur = cur.parentId ? this.body(cur.parentId) : null;
    }
    return out;
  }

  /** Overrides where ships dock at a body (e.g. a landing pad tile), in the body's local frame. */
  setDockingOffset(bodyId: BodyId, local: Vec3): void {
    this.dockingOffsets.set(bodyId, { ...local });
  }

  /** Docking point in the body's local frame. */
  dockingOffset(bodyId: BodyId, out: Vec3): Vec3 {
    const o = this.dockingOffsets.get(bodyId);
    if (o) return copy(out, o);
    const b = this.body(bodyId);
    return set(out, 0, b.radius * b.orbitalAltitudeFactor, 0);
  }

  /** World-space docking point: body centre + docking offset. */
  dockingPosition(bodyId: BodyId, t: number, out: Vec3): Vec3 {
    this.worldPosition(bodyId, t, out);
    this.dockingOffset(bodyId, this.tmp);
    return add(out, out, this.tmp);
  }

  /** Parking orbit in the body's local frame, ignoring landing pads: (0, radius × factor, 0). */
  orbitOffset(bodyId: BodyId, out: Vec3): Vec3 {
    const b = this.body(bodyId);
    return set(out, 0, b.radius * b.orbitalAltitudeFactor, 0);
  }

  /** World-space parking orbit point (the mothership never lands, canvas: it unloads by shuttle). */
  orbitPosition(bodyId: BodyId, t: number, out: Vec3): Vec3 {
    this.worldPosition(bodyId, t, out);
    this.orbitOffset(bodyId, this.tmp);
    return add(out, out, this.tmp);
  }

  /** Where a ship of this role waits at a body: transports on the landing pad, the mothership in orbit. */
  stationPosition(bodyId: BodyId, t: number, out: Vec3, mothership: boolean): Vec3 {
    return mothership ? this.orbitPosition(bodyId, t, out) : this.dockingPosition(bodyId, t, out);
  }

  /** Distance of the docking point from the body centre. */
  dockingAltitude(b: CelestialBody): number {
    return length(this.dockingOffset(b.id, this.tmp));
  }

  /** Upper bound of the body's linear speed: Σ ω·r along the parent chain. */
  maxLinearSpeed(bodyId: BodyId): number {
    let v = 0;
    let cur: CelestialBody | null = this.body(bodyId);
    while (cur) {
      v += Math.abs(cur.orbitSpeed) * cur.orbitRadius;
      cur = cur.parentId ? this.body(cur.parentId) : null;
    }
    return v;
  }

  /** Upper bound of the body's distance from the system centre: Σ r along the parent chain. */
  maxWorldRadius(bodyId: BodyId): number {
    let r = 0;
    let cur: CelestialBody | null = this.body(bodyId);
    while (cur) {
      r += cur.orbitRadius;
      cur = cur.parentId ? this.body(cur.parentId) : null;
    }
    return r;
  }

  /** Upper bound of the distance between two bodies' docking points. */
  maxDistanceBetween(a: BodyId, b: BodyId): number {
    return this.maxWorldRadius(a) + this.maxWorldRadius(b)
      + this.dockingAltitude(this.body(a)) + this.dockingAltitude(this.body(b));
  }
}
