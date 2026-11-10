import * as THREE from 'three';

/** The camera direction seen from a body may turn this far before its visible cap is recomputed [rad] (2°). */
export const CULL_TURN = (2 * Math.PI) / 180;
/** ... and the horizon angle acos(R/d) may change this far (zoom) [rad] (1°). */
export const CULL_ZOOM = Math.PI / 180;
/**
 * Radius of the sphere that hides the far side, as a share of the body radius: a little below the surface, so
 * the chords of a flat-faced grid (≈ 0.25 % of R at n = 8) and the water of the hex terrain (≈ 0.4 %) never
 * hide what they don't.
 */
export const OCCLUDER = 0.995;
const COS_TURN = Math.cos(CULL_TURN);

/**
 * The cap of a body the camera can see (T4). A point Q shows above the horizon of the occluding sphere (radius R)
 * while angle(Q, c) < acos(R/d) + acos(R/|Q|), for the camera direction c and distance d from the body centre in
 * the body frame. One culler per body, shared by its structures and terrain decor: `update` every frame is a dot
 * product unless the camera turned by more than CULL_TURN or zoomed by more than CULL_ZOOM; then `version` bumps
 * and the layers re-cull. Between recomputes every test keeps that much slack (`limit`), so nothing pops in at
 * the horizon.
 */
export class HemisphereCuller {
  /** Radius of the occluding sphere. */
  readonly occluder: number;
  /** Camera direction (unit, body frame) at the last recompute. */
  readonly dir = new THREE.Vector3(0, 0, 1);
  /** acos(R/d) at the last recompute; π before the first one (all visible) and with the camera inside. */
  horizon = Math.PI;
  /** Bumps on every recompute: a layer whose instances were culled at an older version re-culls. */
  version = 0;
  private readonly tmp = new THREE.Vector3();

  constructor(radius: number) {
    this.occluder = radius * OCCLUDER;
  }

  /** Camera position in the body frame. True when the visible cap was recomputed. */
  update(camera: THREE.Vector3): boolean {
    const d = camera.length();
    if (d < 1e-9) return false;
    const horizon = d > this.occluder ? Math.acos(this.occluder / d) : Math.PI;
    this.tmp.copy(camera).divideScalar(d);
    if (this.version > 0 && this.tmp.dot(this.dir) >= COS_TURN && Math.abs(horizon - this.horizon) <= CULL_ZOOM) return false;
    this.dir.copy(this.tmp);
    this.horizon = horizon;
    this.version++;
    return true;
  }

  /**
   * Cosine limit for an instance with angular `slack` (`instanceSlack`): it may be seen while dot(n, dir) > limit,
   * n its anchor's direction. Below −1 (everything) when the cap reaches round the whole body.
   */
  limit(slack: number): number {
    const a = this.horizon + slack + CULL_TURN + CULL_ZOOM;
    return a >= Math.PI ? -2 : Math.cos(a);
  }
}

/**
 * Angular slack of an instance over an occluding sphere `R` [rad], from its extent: every point of it lies within
 * `top` of the body centre and within `angle` of its anchor's direction n. Its highest point clears the horizon
 * acos(R/top) further round, and it reaches `angle` off n, so with the anchor further from the camera direction
 * than horizon + slack no point of it can be seen (angle(Q, c) ≥ angle(n, c) − angle(Q, n)).
 */
export function instanceSlack(R: number, top: number, angle: number): number {
  return (top > R ? Math.acos(R / top) : 0) + angle;
}

const CORNER = new THREE.Vector3();

/**
 * Extent of a box under a column-major matrix (`e` at offset `o`) as seen from the body centre: the largest
 * distance of its corners and their largest angle from the direction (ax, ay, az) [rad]. The box is convex and
 * so is a cone round the direction (under 90°), so the corners bound every point of it.
 */
function boxExtent(box: THREE.Box3, e: ArrayLike<number>, o: number, ax: number, ay: number, az: number, out: { top: number; angle: number }): void {
  let top = 0;
  let minCos = 1;
  for (let k = 0; k < 8; k++) {
    const x = k & 1 ? box.max.x : box.min.x;
    const y = k & 2 ? box.max.y : box.min.y;
    const z = k & 4 ? box.max.z : box.min.z;
    CORNER.set(e[o]! * x + e[o + 4]! * y + e[o + 8]! * z + e[o + 12]!, e[o + 1]! * x + e[o + 5]! * y + e[o + 9]! * z + e[o + 13]!, e[o + 2]! * x + e[o + 6]! * y + e[o + 10]! * z + e[o + 14]!);
    const r = CORNER.length();
    top = Math.max(top, r);
    minCos = Math.min(minCos, r > 0 ? (CORNER.x * ax + CORNER.y * ay + CORNER.z * az) / r : -1);
  }
  out.top = top;
  out.angle = minCos > 0 ? Math.acos(Math.min(1, minCos)) : Math.PI;
}

/**
 * The instances of one InstancedMesh in their own order ("source"), drawn compacted (T4): those not hidden, kept
 * by the optional filter and in the culler's visible cap go to the front of the mesh's instance buffer, in source
 * order, and `mesh.count` is how many. `slotOf` / `sourceOf` map between the orders; everything outside the mesh
 * (picking, tile ownership, hiding, outlines) works on source indices and never sees the compaction. The extent of
 * each instance is its matrix applied to the mesh geometry's bounding box.
 */
export class CulledInstances {
  /** Source matrices, 16 floats each (column-major, as `Matrix4.elements`). */
  private matrices: Float32Array;
  /** Per instance: unit direction of its anchor (the matrix translation) and its slack for the last occluder. */
  private anchors: Float32Array;
  private hidden: Uint8Array;
  /** Colour (r, g, b) per instance once `setColor` was used (T4b proxies), else null. */
  private colors: Float32Array | null = null;
  private slots: Int32Array;
  private sources: Int32Array;
  private capacity: number;
  /** Source instances written. */
  count = 0;
  /** Instances drawn after the last `apply`. */
  drawn = 0;
  /** Culler version of the last `apply`, -1 = never (or the instances changed since). */
  private applied = -1;
  /** Geometry and occluder the slacks were computed for (null = recompute). */
  private extentOf: THREE.BufferGeometry | null = null;
  private extentR = 0;
  private readonly extent = { top: 0, angle: 0 };

  constructor(capacity: number) {
    this.capacity = Math.max(1, capacity);
    this.matrices = new Float32Array(this.capacity * 16);
    this.anchors = new Float32Array(this.capacity * 4);
    this.hidden = new Uint8Array(this.capacity);
    this.slots = new Int32Array(this.capacity).fill(-1);
    this.sources = new Int32Array(this.capacity);
  }

  /** Makes room for `n` instances, keeping those written. */
  ensure(n: number): void {
    if (n <= this.capacity) return;
    let cap = this.capacity;
    while (cap < n) cap *= 2;
    const grow = <T extends Float32Array | Int32Array | Uint8Array>(a: T, per: number, make: (len: number) => T): T => {
      const b = make(cap * per);
      b.set(a);
      return b;
    };
    this.matrices = grow(this.matrices, 16, (l) => new Float32Array(l));
    this.anchors = grow(this.anchors, 4, (l) => new Float32Array(l));
    this.hidden = grow(this.hidden, 1, (l) => new Uint8Array(l));
    if (this.colors) this.colors = grow(this.colors, 3, (l) => new Float32Array(l));
    this.slots = grow(this.slots, 1, (l) => new Int32Array(l).fill(-1));
    this.sources = grow(this.sources, 1, (l) => new Int32Array(l));
    this.capacity = cap;
  }

  /** Writes source instance `i` (body frame). Its anchor is the matrix translation. */
  set(i: number, m: THREE.Matrix4): void {
    const e = m.elements;
    this.matrices.set(e, i * 16);
    const r = Math.hypot(e[12]!, e[13]!, e[14]!);
    const a = i * 4;
    this.anchors[a] = r > 0 ? e[12]! / r : 0;
    this.anchors[a + 1] = r > 0 ? e[13]! / r : 1;
    this.anchors[a + 2] = r > 0 ? e[14]! / r : 0;
    this.applied = -1;
    this.extentOf = null;
  }

  /** Colour of source instance `i`: drawn through `mesh.instanceColor`, in the same slot as its matrix (T4b proxies). */
  setColor(i: number, c: THREE.Color): void {
    if (!this.colors) this.colors = new Float32Array(this.capacity * 3).fill(1);
    this.colors[i * 3] = c.r;
    this.colors[i * 3 + 1] = c.g;
    this.colors[i * 3 + 2] = c.b;
    this.applied = -1;
  }

  /** Copies source instance `i` into `out`. */
  matrixAt(i: number, out: THREE.Matrix4): THREE.Matrix4 {
    return out.fromArray(this.matrices, i * 16);
  }

  /** Hides or shows source instance `i` (a structure stands on its tile). */
  setHidden(i: number, hide: boolean): void {
    const h = hide ? 1 : 0;
    if (this.hidden[i] === h) return;
    this.hidden[i] = h;
    this.applied = -1;
  }

  isHidden(i: number): boolean {
    return this.hidden[i] === 1;
  }

  /** Forces the next `cull` to rewrite the mesh (the filter or the geometry changed). */
  invalidate(): void {
    this.applied = -1;
    this.extentOf = null;
  }

  /** Slot of source instance `i` in the mesh after the last `apply`, -1 when not drawn. */
  slotOf(i: number): number {
    return i < this.count ? this.slots[i]! : -1;
  }

  /** Source instance drawn in `slot`. */
  sourceOf(slot: number): number {
    return slot < this.drawn ? this.sources[slot]! : -1;
  }

  /** `apply` unless nothing changed since the last one (same culler version, same instances). */
  cull(mesh: THREE.InstancedMesh, culler: HemisphereCuller | null, keep?: (i: number) => boolean): void {
    if (this.applied >= 0 && this.applied === (culler?.version ?? 0) && this.extentOf === (culler ? mesh.geometry : this.extentOf)) return;
    this.apply(mesh, culler, keep);
  }

  /**
   * Compacts the instances to draw into `mesh` (whose capacity must hold `count`): not hidden, `keep(i)` (when
   * given) and in the visible cap of `culler` (when given). Sets `mesh.count`, and hides the mesh when nothing is
   * left. Colours (`setColor`) go to `mesh.instanceColor` (made when missing) in the same slots.
   */
  apply(mesh: THREE.InstancedMesh, culler: HemisphereCuller | null, keep?: (i: number) => boolean): void {
    if (culler) this.measure(mesh.geometry, culler.occluder);
    const out = mesh.instanceMatrix.array as Float32Array;
    const colors = this.colors;
    if (colors && !mesh.instanceColor) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count * 3).fill(1), 3);
    const outColor = colors ? (mesh.instanceColor!.array as Float32Array) : null;
    const cx = culler?.dir.x ?? 0;
    const cy = culler?.dir.y ?? 0;
    const cz = culler?.dir.z ?? 0;
    let n = 0;
    for (let i = 0; i < this.count; i++) {
      this.slots[i] = -1;
      if (this.hidden[i] || (keep && !keep(i))) continue;
      if (culler) {
        const a = i * 4;
        if (this.anchors[a]! * cx + this.anchors[a + 1]! * cy + this.anchors[a + 2]! * cz <= culler.limit(this.anchors[a + 3]!)) continue;
      }
      out.set(this.matrices.subarray(i * 16, i * 16 + 16), n * 16);
      if (outColor) outColor.set(colors!.subarray(i * 3, i * 3 + 3), n * 3);
      this.slots[i] = n;
      this.sources[n] = i;
      n++;
    }
    this.drawn = n;
    this.applied = culler?.version ?? 0;
    mesh.count = n;
    mesh.visible = n > 0;
    mesh.instanceMatrix.needsUpdate = true;
    if (outColor) mesh.instanceColor!.needsUpdate = true;
  }

  /** Slack of every instance for this geometry's bounding box over the occluder `R` (cached until either changes). */
  private measure(g: THREE.BufferGeometry, R: number): void {
    if (this.extentOf === g && this.extentR === R) return;
    if (!g.boundingBox) g.computeBoundingBox();
    const box = g.boundingBox!;
    for (let i = 0; i < this.count; i++) {
      const a = i * 4;
      boxExtent(box, this.matrices, i * 16, this.anchors[a]!, this.anchors[a + 1]!, this.anchors[a + 2]!, this.extent);
      this.anchors[a + 3] = instanceSlack(R, this.extent.top, this.extent.angle);
    }
    this.extentOf = g;
    this.extentR = R;
  }
}
