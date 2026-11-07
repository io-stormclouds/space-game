import { Vec3, copy, distance, normalize, set, vec3 } from './vec3';

/** Quadratic Bézier curve P0 → P1 → P2 with a movable end point. */
export class BezierPath {
  readonly p0 = vec3();
  readonly p1 = vec3();
  readonly p2 = vec3();
  private readonly tmpA = vec3();
  private readonly tmpB = vec3();

  constructor(p0: Vec3, p1: Vec3, p2: Vec3) {
    copy(this.p0, p0);
    copy(this.p1, p1);
    copy(this.p2, p2);
  }

  /** Builds a curve whose control point is the midpoint lifted along +Y by liftFactor × |P2−P0|. */
  static arc(p0: Vec3, p2: Vec3, liftFactor: number): BezierPath {
    const d = distance(p0, p2);
    const p1 = vec3((p0.x + p2.x) / 2, (p0.y + p2.y) / 2 + d * liftFactor, (p0.z + p2.z) / 2);
    return new BezierPath(p0, p1, p2);
  }

  setEnd(p2: Vec3): void {
    copy(this.p2, p2);
  }

  /** Moves the control point so it stays the lifted midpoint of the current P0/P2. */
  relift(liftFactor: number): void {
    const d = distance(this.p0, this.p2);
    set(this.p1, (this.p0.x + this.p2.x) / 2, (this.p0.y + this.p2.y) / 2 + d * liftFactor, (this.p0.z + this.p2.z) / 2);
  }

  pointAt(u: number, out: Vec3): Vec3 {
    const s = 1 - u;
    const a = s * s;
    const b = 2 * s * u;
    const c = u * u;
    return set(
      out,
      a * this.p0.x + b * this.p1.x + c * this.p2.x,
      a * this.p0.y + b * this.p1.y + c * this.p2.y,
      a * this.p0.z + b * this.p1.z + c * this.p2.z,
    );
  }

  /** Unit tangent dP/du. */
  tangentAt(u: number, out: Vec3): Vec3 {
    const s = 1 - u;
    set(
      out,
      2 * s * (this.p1.x - this.p0.x) + 2 * u * (this.p2.x - this.p1.x),
      2 * s * (this.p1.y - this.p0.y) + 2 * u * (this.p2.y - this.p1.y),
      2 * s * (this.p1.z - this.p0.z) + 2 * u * (this.p2.z - this.p1.z),
    );
    return normalize(out, out);
  }

  /** Polyline approximation of the arc length. */
  approxLength(segments = 32): number {
    let len = 0;
    this.pointAt(0, this.tmpA);
    for (let i = 1; i <= segments; i++) {
      this.pointAt(i / segments, this.tmpB);
      len += distance(this.tmpA, this.tmpB);
      copy(this.tmpA, this.tmpB);
    }
    return len;
  }

  /** Writes `out.length` evenly spaced (in u) samples into the provided vectors. */
  sample(out: Vec3[]): void {
    const n = out.length;
    for (let i = 0; i < n; i++) this.pointAt(n === 1 ? 0 : i / (n - 1), out[i]);
  }
}
