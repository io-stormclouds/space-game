import { type BezierPath, type BodyId, type CelestialBody, type OrbitSolver, type TransferPlan, type Vec3 } from '@space-game/domain';

/*
 * Presentation scale of the system scene: the scene is not drawn in world units. The simulation's numbers
 * (orbit radii, body radii, docking points, flight curves) also drive flight time, fuel and rover trips, so
 * they stay as they are; the view spreads the system out instead. Orbits around the star grow more than the
 * bodies do, so neighbours are far apart on screen and a distant planet stays small: below the LOD thresholds
 * of the scene (hex terrain from 80 px, structures from 24 px) it draws as a plain sphere.
 *
 * Everything on and around a body (surface, structures, terrain, docking point, parking orbit, its moons'
 * orbits, rovers on it) is scaled with the body, so a body's own system keeps its proportions; only the
 * distances between the star's children change. Flights are mapped by `FlightMap`.
 */

/** Scene units per world unit. */
export interface ViewScale {
  /** Offsets of the star's children (planet and belt orbits) and the belt's width. */
  readonly orbit: number;
  /** Planets, moons and asteroids: their size and everything on and around them; ships and rovers. */
  readonly body: number;
  /** The star's radius (and the parking orbit around it). */
  readonly star: number;
}

/**
 * Tau Ceti: orbits 448–1185 → 6.7k–17.8k, planet radii 31–50 → 62–100, the star 50 → 250. Neighbouring orbits
 * are 7–19 planet diameters apart instead of 1–2.5, so a neighbour passing closest stays under ~70 px at 1080p.
 */
export const VIEW_SCALE: ViewScale = { orbit: 15, body: 2, star: 5 };

/** World units as they are (tests that check the simulation's geometry directly). */
export const WORLD_SCALE: ViewScale = { orbit: 1, body: 1, star: 1 };

/** Scale of a body's own size: radius, surface and everything in its frame (belt: the annulus). */
export function sizeScale(body: Pick<CelestialBody, 'kind'>, s: ViewScale): number {
  if (body.kind === 'STAR') return s.star;
  return body.kind === 'BELT' ? s.orbit : s.body;
}

/** Scale of the offsets of a body's children: around the star the orbit scale, around anything else its size scale. */
export function childScale(parent: Pick<CelestialBody, 'kind'>, s: ViewScale): number {
  return parent.kind === 'STAR' ? s.orbit : sizeScale(parent, s);
}

/** Size of a belt rock in the scene per world unit: between the body and the orbit scale, so the belt still shows in the overview. */
export function beltRockScale(s: ViewScale): number {
  return Math.max(s.body, s.orbit / 3);
}

const set = (out: Vec3, x: number, y: number, z: number): Vec3 => {
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
};

/** Where the simulation's bodies and points are in the scene at a time. Allocation-free after construction. */
export class SceneMap {
  private readonly byId = new Map<BodyId, CelestialBody>();
  private readonly offsets = new Map<BodyId, number>();
  private readonly sizes = new Map<BodyId, number>();
  private readonly tmp: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly tmpW: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(
    bodies: ReadonlyArray<CelestialBody>,
    private readonly solver: OrbitSolver,
    readonly scale: ViewScale,
  ) {
    for (const b of bodies) this.byId.set(b.id, b);
    for (const b of bodies) {
      const parent = b.parentId ? this.byId.get(b.parentId) : undefined;
      this.offsets.set(b.id, parent ? childScale(parent, scale) : 1);
      this.sizes.set(b.id, sizeScale(b, scale));
    }
  }

  has(id: BodyId): boolean {
    return this.byId.has(id);
  }

  /** Scene units per world unit of the body's own size. */
  size(id: BodyId): number {
    return this.sizes.get(id) ?? 1;
  }

  /** Scene units per world unit of the body's offset from its parent. */
  offset(id: BodyId): number {
    return this.offsets.get(id) ?? 1;
  }

  /** Scene units per world unit of the offsets of the body's children. */
  children(id: BodyId): number {
    const b = this.byId.get(id);
    return b ? childScale(b, this.scale) : 1;
  }

  /** Scene position of a body's centre at time t (the parent chain, each offset scaled). */
  bodyAt(id: BodyId, t: number, out: Vec3): Vec3 {
    set(out, 0, 0, 0);
    let cur = this.byId.get(id);
    while (cur) {
      this.solver.localPosition(cur.id, t, this.tmp);
      const k = this.offset(cur.id);
      out.x += this.tmp.x * k;
      out.y += this.tmp.y * k;
      out.z += this.tmp.z * k;
      cur = cur.parentId ? this.byId.get(cur.parentId) : undefined;
    }
    return out;
  }

  /** Scene position of world point `p` taken in the frame of body `id` at time t (it moves and scales with the body). */
  pointNear(p: Vec3, id: BodyId, t: number, out: Vec3): Vec3 {
    const w = this.solver.worldPosition(id, t, this.tmpW);
    const k = this.size(id);
    const dx = (p.x - w.x) * k;
    const dy = (p.y - w.y) * k;
    const dz = (p.z - w.z) * k;
    this.bodyAt(id, t, out);
    out.x += dx;
    out.y += dy;
    out.z += dz;
    return out;
  }

  /** Scene position of world point `p` in the frame where the children of `id` live (scaled by `children(id)`). */
  pointIn(p: Vec3, id: BodyId, t: number, out: Vec3): Vec3 {
    const w = this.solver.worldPosition(id, t, this.tmpW);
    const k = this.children(id);
    const dx = (p.x - w.x) * k;
    const dy = (p.y - w.y) * k;
    const dz = (p.z - w.z) * k;
    this.bodyAt(id, t, out);
    out.x += dx;
    out.y += dy;
    out.z += dz;
    return out;
  }

  /** The nearest body whose frame holds both (a body is in its own chain); the root when there is none. */
  commonFrame(a: BodyId, b: BodyId): BodyId | null {
    const chain = new Set<BodyId>();
    for (let cur = this.byId.get(a); cur; cur = cur.parentId ? this.byId.get(cur.parentId) : undefined) chain.add(cur.id);
    for (let cur = this.byId.get(b); cur; cur = cur.parentId ? this.byId.get(cur.parentId) : undefined) if (chain.has(cur.id)) return cur.id;
    return null;
  }

  /** The mapping of one flight, or null when its bodies are unknown (the curve is drawn in world units then). */
  flight(plan: Pick<TransferPlan, 'fromBodyId' | 'toBodyId' | 'startPos' | 'leadPos' | 'startTime' | 'estimatedDuration'>): FlightMap | null {
    if (!this.has(plan.fromBodyId) || !this.has(plan.toBodyId)) return null;
    const frame = this.commonFrame(plan.fromBodyId, plan.toBodyId);
    return frame === null ? null : new FlightMap(this, plan, frame);
  }
}

/**
 * A flight in the scene. The simulation flies a fixed curve in world units (`BezierPath.arc` from the start to
 * the target's docking point at arrival). The view takes each point in the frame of the nearest body holding
 * both ends (the star for a flight between planets, the planet for one to its moon) at that point's time, and
 * blends in the difference at the ends, so the ship leaves exactly from where it was docked and arrives exactly
 * where it docks, with a smooth curve in between.
 */
export class FlightMap {
  private readonly t0: number;
  private readonly t1: number;
  private readonly c0: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly c1: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly p: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly q: Vec3 = { x: 0, y: 0, z: 0 };

  constructor(
    private readonly map: SceneMap,
    plan: Pick<TransferPlan, 'fromBodyId' | 'toBodyId' | 'startPos' | 'leadPos' | 'startTime' | 'estimatedDuration'>,
    private readonly frame: BodyId,
  ) {
    this.t0 = plan.startTime;
    this.t1 = plan.startTime + plan.estimatedDuration; // arrivalTime
    this.correction(plan.startPos, plan.fromBodyId, this.t0, this.c0);
    this.correction(plan.leadPos, plan.toBodyId, this.t1, this.c1);
  }

  /** Scene point at progress u of the curve `path` (the plan's own curve). */
  at(path: BezierPath, u: number, out: Vec3): Vec3 {
    path.pointAt(u, this.p);
    this.map.pointIn(this.p, this.frame, this.t0 + (this.t1 - this.t0) * u, out);
    const s = 1 - u;
    out.x += this.c0.x * s + this.c1.x * u;
    out.y += this.c0.y * s + this.c1.y * u;
    out.z += this.c0.z * s + this.c1.z * u;
    return out;
  }

  /** Direction of travel at u (central difference of `at`, not normalised). */
  tangent(path: BezierPath, u: number, out: Vec3): Vec3 {
    const h = 1e-3;
    const a = Math.max(0, u - h);
    const b = Math.min(1, u + h);
    this.at(path, a, this.q);
    this.at(path, b, out);
    out.x -= this.q.x;
    out.y -= this.q.y;
    out.z -= this.q.z;
    return out;
  }

  /** What the frame mapping misses at an end: the end taken in its own body's frame minus it taken in the flight's frame. */
  private correction(p: Vec3, body: BodyId, t: number, out: Vec3): void {
    this.map.pointNear(p, body, t, out);
    this.map.pointIn(p, this.frame, t, this.q);
    out.x -= this.q.x;
    out.y -= this.q.y;
    out.z -= this.q.z;
  }
}

/** Radius of the sphere around the centre that holds every orbit and body, in scene units. */
export function sceneExtent(bodies: ReadonlyArray<CelestialBody>, s: ViewScale): number {
  if (bodies.length === 0) return 1;
  const byId = new Map(bodies.map((b) => [b.id, b] as const));
  let r = 0;
  for (const b of bodies) {
    let d = 0;
    for (let cur: CelestialBody | undefined = b; cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined) {
      const parent = cur.parentId ? byId.get(cur.parentId) : undefined;
      d += cur.orbitRadius * (parent ? childScale(parent, s) : 1);
    }
    r = Math.max(r, d + b.radius * sizeScale(b, s) * (b.kind === 'BELT' ? 3 : 1));
  }
  return Math.max(r, 1);
}
