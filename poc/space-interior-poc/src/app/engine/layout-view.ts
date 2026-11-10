import {
  BufferGeometry,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type Raycaster,
} from 'three';
import type { ModelId } from '../domain/catalog/models';
import type { IndexedPiece, LayoutIndex } from '../domain/layout-index';
import { transformOf } from '../domain/placement';
import { CUT_ATTRIBUTE } from './kit-materials';
import type { KitLibrary, KitModel } from './kit-library';

const UP = new Vector3(0, 1, 0);
const ZERO = new Matrix4().makeScale(0, 0, 0);
const tmpQ = new Quaternion();
const tmpLocal = new Matrix4();

/** Instance matrix of a piece: T(x, y, z) · Ry(rot·90°) · T(local offset). */
export function pieceMatrix(ip: IndexedPiece, index: LayoutIndex, out = new Matrix4()): Matrix4 {
  const t = transformOf(ip.piece, ip.item, index);
  tmpQ.setFromAxisAngle(UP, (t.rot * Math.PI) / 2);
  out.compose(new Vector3(t.x, t.y, t.z), tmpQ, new Vector3(1, 1, 1));
  if (t.localX !== 0 || t.localZ !== 0) out.multiply(tmpLocal.makeTranslation(t.localX, 0, t.localZ));
  return out;
}

/** Geometry view sharing a model's buffers, with its own per-instance attributes. */
export function shareGeometry(src: BufferGeometry): BufferGeometry {
  const g = new BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) g.setAttribute(name, attr);
  g.setIndex(src.index);
  for (const gr of src.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  g.boundingBox = src.boundingBox;
  g.boundingSphere = src.boundingSphere;
  g.userData['shared'] = Object.keys(src.attributes);
  return g;
}

/**
 * Disposes a shareGeometry() view WITHOUT freeing the model's buffers: BufferGeometry.dispose()
 * makes the renderer delete the GL buffers of every attribute it holds, shared ones included.
 */
export function disposeShared(g: BufferGeometry): void {
  for (const name of (g.userData['shared'] as string[] | undefined) ?? []) g.deleteAttribute(name);
  g.setIndex(null);
  g.dispose();
}

/** All placed copies of one kit model: one InstancedMesh that grows by doubling. */
class ModelBatch {
  mesh!: InstancedMesh;
  private cut!: InstancedBufferAttribute;
  private geometry!: BufferGeometry;
  readonly ids: string[] = [];
  private readonly slots = new Map<string, number>();

  constructor(
    private readonly model: KitModel,
    private readonly parent: Group,
    capacity = 8,
  ) {
    this.build(capacity);
  }

  private build(capacity: number): void {
    const old = this.mesh;
    this.geometry = shareGeometry(this.model.geometry);
    this.cut = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.cut.setUsage(DynamicDrawUsage);
    this.geometry.setAttribute(CUT_ATTRIBUTE, this.cut);
    this.mesh = new InstancedMesh(this.geometry, this.model.materials as never, capacity);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.name = this.model.id;
    this.mesh.count = this.ids.length;
    if (old) {
      const m = new Matrix4();
      const oldCut = old.geometry.getAttribute(CUT_ATTRIBUTE) as InstancedBufferAttribute;
      for (let i = 0; i < this.ids.length; i++) {
        old.getMatrixAt(i, m);
        this.mesh.setMatrixAt(i, m);
        this.cut.setX(i, oldCut.getX(i));
      }
      this.parent.remove(old);
      disposeShared(old.geometry);
      old.dispose();
    }
    this.parent.add(this.mesh);
  }

  set(id: string, matrix: Matrix4): void {
    let slot = this.slots.get(id);
    if (slot === undefined) {
      if (this.ids.length >= this.mesh.instanceMatrix.count) this.build(this.mesh.instanceMatrix.count * 2);
      slot = this.ids.length;
      this.ids.push(id);
      this.slots.set(id, slot);
      this.mesh.count = this.ids.length;
      this.cut.setX(slot, 0);
    }
    this.mesh.setMatrixAt(slot, matrix);
  }

  remove(id: string): void {
    const slot = this.slots.get(id);
    if (slot === undefined) return;
    const last = this.ids.length - 1;
    if (slot !== last) {
      const m = new Matrix4();
      this.mesh.getMatrixAt(last, m);
      this.mesh.setMatrixAt(slot, m);
      this.cut.setX(slot, this.cut.getX(last));
      const moved = this.ids[last];
      this.ids[slot] = moved;
      this.slots.set(moved, slot);
    }
    this.ids.pop();
    this.slots.delete(id);
    this.mesh.count = this.ids.length;
  }

  setCut(id: string, y: number): void {
    const slot = this.slots.get(id);
    if (slot !== undefined) this.cut.setX(slot, y);
  }

  cutAt(slot: number): number {
    return this.cut.getX(slot);
  }

  commit(): void {
    this.mesh.instanceMatrix.needsUpdate = true;
    this.cut.needsUpdate = true;
    this.mesh.boundingSphere = null;
    this.mesh.boundingBox = null;
  }

  dispose(): void {
    this.parent.remove(this.mesh);
    disposeShared(this.geometry);
    this.mesh.dispose();
  }
}

/**
 * Draws a layout. Holds no design state: `sync()` gets the current index and makes the instances
 * match (adds, moves, removes); `applyCut()` sets the per-instance cut heights.
 */
export class LayoutView {
  readonly group = new Group();
  private readonly batches = new Map<ModelId, ModelBatch>();
  private readonly modelOf = new Map<string, ModelId>();
  private index?: LayoutIndex;
  private maxLevel = Infinity;

  constructor(private readonly kit: KitLibrary) {
    this.group.name = 'layout';
  }

  get current(): LayoutIndex | undefined {
    return this.index;
  }

  /** Levels above this are not drawn (looking down into the active deck). */
  setMaxLevel(level: number): void {
    this.maxLevel = level;
    if (this.index) this.sync(this.index);
  }

  sync(index: LayoutIndex): void {
    this.index = index;
    const seen = new Set<string>();
    const m = new Matrix4();
    const touched = new Set<ModelBatch>();
    for (const ip of index.pieces.values()) {
      const modelId = ip.item.variant.model;
      const model = this.kit.get(modelId);
      if (!model) continue; // not loaded yet; the next sync picks it up
      const prev = this.modelOf.get(ip.piece.id);
      if (prev && prev !== modelId) {
        const b = this.batches.get(prev);
        b?.remove(ip.piece.id);
        if (b) touched.add(b);
      }
      let batch = this.batches.get(modelId);
      if (!batch) {
        batch = new ModelBatch(model, this.group);
        this.batches.set(modelId, batch);
      }
      batch.set(ip.piece.id, ip.piece.level > this.maxLevel ? ZERO : pieceMatrix(ip, index, m));
      touched.add(batch);
      this.modelOf.set(ip.piece.id, modelId);
      seen.add(ip.piece.id);
    }
    for (const [id, modelId] of [...this.modelOf]) {
      if (seen.has(id)) continue;
      const b = this.batches.get(modelId);
      b?.remove(id);
      if (b) touched.add(b);
      this.modelOf.delete(id);
    }
    for (const b of touched) b.commit();
  }

  /** Sets every piece's cut height (world y; 0 = uncut). */
  applyCut(cutOf: (ip: IndexedPiece) => number): void {
    if (!this.index) return;
    for (const ip of this.index.pieces.values()) {
      const modelId = this.modelOf.get(ip.piece.id);
      if (modelId) this.batches.get(modelId)?.setCut(ip.piece.id, cutOf(ip));
    }
    for (const b of this.batches.values()) b.commit();
  }

  /** Nearest piece under the ray, ignoring parts that are cut away. */
  raycast(raycaster: Raycaster, filter?: (id: string) => boolean): { id: string; point: Vector3 } | null {
    const meshes = [...this.batches.values()].map((b) => b.mesh).filter((m) => m.count > 0);
    const hits = raycaster.intersectObjects(meshes, false);
    for (const hit of hits) {
      const batch = this.batches.get(hit.object.name as ModelId);
      if (!batch || hit.instanceId === undefined) continue;
      const id = batch.ids[hit.instanceId];
      const cut = batch.cutAt(hit.instanceId);
      if (cut > 0 && hit.point.y > cut + 1e-3) continue;
      if (filter && !filter(id)) continue;
      return { id, point: hit.point };
    }
    return null;
  }

  stats(): { drawCalls: number; instances: number } {
    let drawCalls = 0;
    let instances = 0;
    for (const b of this.batches.values()) {
      if (b.mesh.count === 0) continue;
      instances += b.mesh.count;
      drawCalls += Array.isArray(b.mesh.material) ? b.mesh.material.length : 1;
    }
    return { drawCalls, instances };
  }

  dispose(): void {
    for (const b of this.batches.values()) b.dispose();
    this.batches.clear();
    this.modelOf.clear();
  }
}
