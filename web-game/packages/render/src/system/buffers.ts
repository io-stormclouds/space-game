import * as THREE from 'three';
import { CulledInstances, type HemisphereCuller } from './hemisphere-culler';

/**
 * One InstancedMesh that grows when needed (capacity doubles; the old mesh is disposed). Hidden
 * while empty, so an unused batch costs no draw call. The geometry and material are borrowed.
 * With a culler (instances on a body, T4) the instances are kept in their own order and only those
 * in the camera's visible cap are drawn, compacted to the front (`CulledInstances`); `recull` after
 * the culler moved. Indices given to `setMatrixAt` are always source indices. A parked batch (`park`, the
 * T4b level of detail draws a proxy instead) keeps its instances written but draws none of them.
 */
export class InstancedBatch {
  mesh: THREE.InstancedMesh;
  private capacity: number;
  private readonly culled: CulledInstances | null;
  /** Instances of the last `commit`. */
  private written = 0;
  private parked = false;

  constructor(
    private readonly parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    private readonly material: THREE.Material,
    readonly name: string,
    capacity = 8,
    private readonly culler: HemisphereCuller | null = null,
    /** Per-instance colours (`setColorAt`): the mesh gets an `instanceColor` from the start. */
    private readonly colored = false,
  ) {
    this.capacity = Math.max(1, capacity);
    this.mesh = this.create(geometry);
    this.culled = culler ? new CulledInstances(this.capacity) : null;
  }

  /** Instances written by the last `commit` (drawn or not). */
  get count(): number {
    return this.written;
  }

  /** Instances drawn: after culling, `mesh.count`. */
  get drawn(): number {
    return this.mesh.visible ? this.mesh.count : 0;
  }

  /** Whether the batch is parked (draws nothing, keeps its instances). */
  get isParked(): boolean {
    return this.parked;
  }

  /** Where source instance `i` is drawn in the mesh, -1 when culled or parked (identity without a culler). */
  slotOf(i: number): number {
    if (this.parked) return -1;
    if (!this.culled) return i < this.mesh.count ? i : -1;
    return this.culled.slotOf(i);
  }

  ensure(n: number): void {
    if (n <= this.capacity) return;
    let cap = this.capacity;
    while (cap < n) cap *= 2;
    const old = this.mesh;
    this.capacity = cap;
    this.mesh = this.create(old.geometry);
    // without a culler the mesh holds the instances themselves (also while parked, beyond `count`)
    const keep = this.culled ? old.count : this.written;
    this.mesh.instanceMatrix.array.set(old.instanceMatrix.array.subarray(0, keep * 16));
    if (old.instanceColor && this.mesh.instanceColor) this.mesh.instanceColor.array.set(old.instanceColor.array.subarray(0, keep * 3));
    this.mesh.count = old.count;
    this.mesh.visible = old.visible;
    old.removeFromParent();
    old.dispose();
    this.culled?.ensure(cap);
  }

  setMatrixAt(i: number, m: THREE.Matrix4): void {
    if (this.culled) this.culled.set(i, m);
    else this.mesh.setMatrixAt(i, m);
  }

  /** Colour of instance `i` (a batch made `colored`). */
  setColorAt(i: number, c: THREE.Color): void {
    if (this.culled) this.culled.setColor(i, c);
    else this.mesh.setColorAt(i, c);
  }

  commit(count: number): void {
    this.written = count;
    if (this.culled) this.culled.count = count;
    if (this.parked) return; // drawn when unparked
    this.draw();
  }

  /** Re-culls when the culler recomputed its cap since the last commit (cheap otherwise). */
  recull(): void {
    if (!this.parked) this.culled?.cull(this.mesh, this.culler);
  }

  /** Parks the batch (draws nothing, no draw call) or draws its written instances again. */
  park(on: boolean): void {
    if (on === this.parked) return;
    this.parked = on;
    if (!on) return this.draw();
    this.mesh.count = 0;
    this.mesh.visible = false;
  }

  setGeometry(geometry: THREE.BufferGeometry): void {
    this.mesh.geometry = geometry;
    // the extent of the instances comes from the geometry's bounds
    if (this.culled) {
      this.culled.invalidate();
      if (!this.parked) this.culled.cull(this.mesh, this.culler);
    }
  }

  private draw(): void {
    if (this.culled) return this.culled.apply(this.mesh, this.culler);
    this.mesh.count = this.written;
    this.mesh.visible = this.written > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.dispose();
  }

  private create(geometry: THREE.BufferGeometry): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, this.material, this.capacity);
    mesh.name = this.name;
    mesh.count = 0;
    mesh.visible = false;
    // instances move with their body and span the whole surface: the batch bounds are not kept
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (this.colored) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.capacity * 3).fill(1), 3).setUsage(THREE.DynamicDrawUsage);
    this.parent.add(mesh);
    return mesh;
  }
}

/**
 * LineSegments over a growable position (+ optional colour) buffer. Writers fill `positions` /
 * `colors` from 0 and call `commit(vertexCount)`; growing replaces and disposes the geometry.
 */
export class LineBuffer {
  readonly lines: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  positions: Float32Array;
  colors: Float32Array | null;
  private capacity: number;

  constructor(
    material: THREE.LineBasicMaterial,
    capacityVertices: number,
    private readonly withColors = false,
    name = 'Lines',
  ) {
    this.capacity = Math.max(2, capacityVertices);
    this.positions = new Float32Array(this.capacity * 3);
    this.colors = withColors ? new Float32Array(this.capacity * 3) : null;
    this.lines = new THREE.LineSegments(this.makeGeometry(), material);
    this.lines.name = name;
    this.lines.frustumCulled = false;
    this.lines.visible = false;
  }

  /** Makes room for `vertices` vertices, keeping what was written so far when `keep`. */
  ensure(vertices: number, keep = false): void {
    if (vertices <= this.capacity) return;
    let cap = this.capacity;
    while (cap < vertices) cap *= 2;
    const p = new Float32Array(cap * 3);
    const c = this.withColors ? new Float32Array(cap * 3) : null;
    if (keep) {
      p.set(this.positions);
      if (c && this.colors) c.set(this.colors);
    }
    this.capacity = cap;
    this.positions = p;
    this.colors = c;
    const old = this.lines.geometry;
    this.lines.geometry = this.makeGeometry();
    old.dispose();
  }

  commit(vertices: number): void {
    const g = this.lines.geometry;
    g.setDrawRange(0, vertices);
    (g.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    if (this.withColors) (g.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    this.lines.visible = vertices > 0;
  }

  dispose(): void {
    this.lines.removeFromParent();
    this.lines.geometry.dispose();
  }

  private makeGeometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    if (this.colors) g.setAttribute('color', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    return g;
  }
}

/** Triangles of one copy of a mesh geometry (indexed or not). */
export function geometryTriangles(g: THREE.BufferGeometry): number {
  return (g.index ? g.index.count : (g.getAttribute('position')?.count ?? 0)) / 3;
}

/** Triangles and instances an instanced mesh submits this frame (0 when hidden; after culling, `mesh.count`). */
export function drawnInstances(mesh: THREE.InstancedMesh, out: { triangles: number; instances: number }): void {
  if (!mesh.visible || mesh.count === 0) return;
  out.triangles += geometryTriangles(mesh.geometry) * mesh.count;
  out.instances += mesh.count;
}

/** Writes `count` vertices of an edges geometry transformed by `m` into `out` from vertex `at`. */
export function writeTransformed(edges: THREE.BufferGeometry, m: THREE.Matrix4, out: Float32Array, at: number, tmp: THREE.Vector3): number {
  const pos = edges.getAttribute('position');
  let o = at * 3;
  for (let i = 0; i < pos.count; i++) {
    tmp.fromBufferAttribute(pos, i).applyMatrix4(m);
    out[o++] = tmp.x;
    out[o++] = tmp.y;
    out[o++] = tmp.z;
  }
  return at + pos.count;
}
