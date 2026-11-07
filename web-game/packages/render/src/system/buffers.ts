import * as THREE from 'three';

/**
 * One InstancedMesh that grows when needed (capacity doubles; the old mesh is disposed). Hidden
 * while empty, so an unused batch costs no draw call. The geometry and material are borrowed.
 */
export class InstancedBatch {
  mesh: THREE.InstancedMesh;
  private capacity: number;

  constructor(
    private readonly parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    private readonly material: THREE.Material,
    readonly name: string,
    capacity = 8,
  ) {
    this.capacity = Math.max(1, capacity);
    this.mesh = this.create(geometry);
  }

  get count(): number {
    return this.mesh.count;
  }

  ensure(n: number): void {
    if (n <= this.capacity) return;
    let cap = this.capacity;
    while (cap < n) cap *= 2;
    const old = this.mesh;
    this.capacity = cap;
    this.mesh = this.create(old.geometry);
    this.mesh.instanceMatrix.array.set(old.instanceMatrix.array.subarray(0, old.count * 16));
    this.mesh.count = old.count;
    this.mesh.visible = old.visible;
    old.removeFromParent();
    old.dispose();
  }

  setMatrixAt(i: number, m: THREE.Matrix4): void {
    this.mesh.setMatrixAt(i, m);
  }

  commit(count: number): void {
    this.mesh.count = count;
    this.mesh.visible = count > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  setGeometry(geometry: THREE.BufferGeometry): void {
    this.mesh.geometry = geometry;
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
