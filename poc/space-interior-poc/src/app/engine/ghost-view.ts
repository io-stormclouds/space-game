import { Group, InstancedMesh, Matrix4, type Material } from 'three';
import { resolveItem } from '../domain/catalog/catalog';
import type { ModelId } from '../domain/catalog/models';
import { LayoutIndex } from '../domain/layout-index';
import { applyChange, type Piece } from '../domain/layout';
import type { Plan } from '../domain/planners';
import { shapeOf } from '../domain/placement';
import { GhostMaterials } from './kit-materials';
import type { KitLibrary } from './kit-library';
import { disposeShared, pieceMatrix, shareGeometry } from './layout-view';

/**
 * Placement preview: pieces a plan would add (green), pieces it rejects (red) and pieces it would
 * remove (red, drawn over everything). Rebuilt whenever the plan changes; plans are small.
 */
export class GhostView {
  readonly group = new Group();
  private readonly materials = new GhostMaterials();
  private meshes: InstancedMesh[] = [];

  constructor(private readonly kit: KitLibrary) {
    this.group.name = 'ghost';
    this.group.renderOrder = 10;
  }

  show(plan: Plan | null, index: LayoutIndex): void {
    this.clear();
    if (!plan) return;
    // Added pieces are positioned in the layout as it WOULD be (lamp on the new table, etc.).
    const after = new LayoutIndex(applyChange(index.layout, plan.change));
    this.addBatch(plan.change.add, after, this.materials.valid, 1);
    const rejectedIndex = new LayoutIndex(applyChange(index.layout, { add: plan.rejected, remove: [] }));
    this.addBatch(plan.rejected, rejectedIndex, this.materials.invalid, 1);
    const added = new Set(plan.change.add.map((p) => p.id));
    this.addBatch(
      plan.change.remove.filter((p) => !added.has(p.id)),
      index,
      this.materials.removed,
      1.01,
    );
  }

  private addBatch(pieces: readonly Piece[], index: LayoutIndex, material: Material, scale: number): void {
    const groups = new Map<ModelId, Piece[]>();
    for (const p of pieces) {
      const item = resolveItem(p.item);
      if (!item || !this.kit.get(item.variant.model)) continue;
      const list = groups.get(item.variant.model);
      if (list) list.push(p);
      else groups.set(item.variant.model, [p]);
    }
    const m = new Matrix4();
    const s = new Matrix4().makeScale(scale, scale, scale);
    for (const [modelId, list] of groups) {
      const model = this.kit.get(modelId)!;
      const mesh = new InstancedMesh(shareGeometry(model.geometry), material, list.length);
      list.forEach((p, i) => {
        const item = resolveItem(p.item)!;
        const ip = index.get(p.id) ?? { piece: p, item, shape: shapeOf(p, item) };
        pieceMatrix(ip, index, m);
        if (scale !== 1) m.multiply(s);
        mesh.setMatrixAt(i, m);
      });
      mesh.renderOrder = 10;
      mesh.frustumCulled = false;
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
  }

  clear(): void {
    for (const m of this.meshes) {
      this.group.remove(m);
      disposeShared(m.geometry);
      m.dispose();
    }
    this.meshes = [];
  }

  dispose(): void {
    this.clear();
    this.materials.dispose();
  }
}
