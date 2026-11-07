import * as THREE from 'three';
import { tileIndexOf, type PlanetGrid, type Structure } from '@space-game/domain';
import { InstancedBatch, LineBuffer, writeTransformed } from './buffers';
import type { ModelKit } from './model-kit';
import { DEPOSIT_MODEL, MODELS, baseLift, fitScale, footprintSpan, partsForKind, type ModelId } from './model-registry';
import { createFrame, footprintFrame, structureLook, type StructureLook, type SurfaceFrame } from './placement';

/** One model of one structure, as placed on the body (body-local frame). */
export interface PlacedPart {
  structureId: string;
  model: ModelId;
  /** Every tile of the structure's footprint. */
  tiles: number[];
  look: StructureLook;
  /** Full-size model → body-local transform (outline, picking). */
  local: THREE.Matrix4;
  inverse: THREE.Matrix4;
  /** Footprint centroid on the surface and the width it offers (brackets). */
  center: THREE.Vector3;
  width: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const SCALE_Y = new THREE.Matrix4();

/** Model → body-local matrix for a surface frame (model +Y on the normal, +Z on the forward). */
export function partMatrix(frame: SurfaceFrame, model: ModelId, out: THREE.Matrix4, tmp: { x: THREE.Vector3; y: THREE.Vector3; z: THREE.Vector3 }): THREE.Matrix4 {
  const spec = MODELS[model];
  const s = fitScale(spec, frame.width);
  const lift = baseLift(spec, s);
  tmp.y.set(frame.normal.x, frame.normal.y, frame.normal.z);
  tmp.z.set(frame.forward.x, frame.forward.y, frame.forward.z);
  tmp.x.crossVectors(tmp.y, tmp.z);
  out.makeBasis(tmp.x, tmp.y, tmp.z);
  out.scale(new THREE.Vector3(s, s, s));
  out.setPosition(frame.position.x + frame.normal.x * lift, frame.position.y + frame.normal.y * lift, frame.position.z + frame.normal.z * lift);
  return out;
}

interface Batch {
  solid: InstancedBatch;
  outline: LineBuffer;
}

/**
 * Structures of one body (PoC `StructureView`, generalised): one InstancedMesh per model on the
 * body for solid parts, one merged LineSegments per model for outlines of sites (planned:
 * ghost; constructing: target silhouette; upgrading: scaffold), and deposit rocks (instanced)
 * on free deposit tiles. Rebuilt only when the layout signature of the body's structures changes;
 * progress-only changes rewrite the solid matrices.
 */
export class StructureLayer {
  readonly group = new THREE.Group();
  readonly parts: PlacedPart[] = [];
  /** Tile index → structure covering it. */
  readonly tileOwner = new Map<number, Structure>();
  /** Unit direction from the body centre to the middle of its structures (camera aim). */
  readonly centroid = new THREE.Vector3(0, 1, 0);
  private readonly batches = new Map<ModelId, Batch>();
  private decor: InstancedBatch | null = null;
  private layoutSig = '';
  private progressSig = '';
  private decorSig = '';
  private structures: Structure[] = [];
  private exhausted: ReadonlySet<number> = new Set();
  private readonly frame = createFrame();
  private readonly basis = { x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3() };
  private readonly m = new THREE.Matrix4();
  private readonly v = new THREE.Vector3();

  constructor(
    readonly grid: PlanetGrid,
    private readonly kit: ModelKit,
    private readonly outlineMaterial: THREE.LineBasicMaterial,
    private readonly showDecor: boolean,
  ) {
    this.group.name = `${grid.bodyId}_Structures`;
  }

  /**
   * Updates from the body's structures; `exhausted` = deposit tiles with nothing left.
   * Returns whether the layout (ids, kinds, states, tiles) changed.
   */
  sync(structures: Structure[], exhausted: ReadonlySet<number>): boolean {
    let layout = '';
    let progress = '';
    for (const s of structures) {
      layout += `${s.id}|${s.kind}|${s.state}|${s.tiles.join(',')};`;
      if (s.state === 'CONSTRUCTING') progress += `${s.id}:${Math.round(s.progress * 100)};`;
    }
    let dsig = '';
    for (const i of exhausted) dsig += `${i},`;
    this.structures = structures;
    this.exhausted = exhausted;
    const changed = layout !== this.layoutSig;
    if (changed) {
      this.layoutSig = layout;
      this.progressSig = progress;
      this.rebuild();
      this.rebuildDecor();
      this.decorSig = dsig;
    } else if (progress !== this.progressSig) {
      this.progressSig = progress;
      this.refreshLooks();
      this.writeSolids();
    }
    if (dsig !== this.decorSig) {
      this.decorSig = dsig;
      this.rebuildDecor();
    }
    return changed;
  }

  /** A model finished loading: swap geometry and re-write outlines (bounds may differ a little). */
  useModel(id: ModelId): void {
    const b = this.batches.get(id);
    if (b) {
      b.solid.setGeometry(this.kit.geometry(id));
      this.writeOutline(id, b);
    }
    if (id === DEPOSIT_MODEL && this.decor) this.decor.setGeometry(this.kit.geometry(id));
  }

  /** Nearest part hit by a ray in the body's local frame. */
  pick(ray: THREE.Ray, tmpRay: THREE.Ray, hit: THREE.Vector3): { part: PlacedPart; distance: number } | null {
    let best: PlacedPart | null = null;
    let bestD = Infinity;
    for (const part of this.parts) {
      tmpRay.copy(ray).applyMatrix4(part.inverse);
      if (!tmpRay.intersectBox(this.kit.box(part.model), hit)) continue;
      hit.applyMatrix4(part.local);
      const d = hit.distanceTo(ray.origin);
      if (d < bestD) {
        bestD = d;
        best = part;
      }
    }
    return best ? { part: best, distance: bestD } : null;
  }

  partsOf(structureId: string): PlacedPart[] {
    return this.parts.filter((p) => p.structureId === structureId);
  }

  /** Draw calls this layer would issue (for tests and stats). */
  get drawables(): number {
    let n = 0;
    for (const b of this.batches.values()) n += (b.solid.mesh.visible ? 1 : 0) + (b.outline.lines.visible ? 1 : 0);
    return n + (this.decor?.mesh.visible ? 1 : 0);
  }

  dispose(): void {
    for (const b of this.batches.values()) {
      b.solid.dispose();
      b.outline.dispose();
    }
    this.batches.clear();
    this.decor?.dispose();
    this.decor = null;
    this.group.removeFromParent();
  }

  private rebuild(): void {
    this.parts.length = 0;
    this.tileOwner.clear();
    for (const s of this.structures) {
      const tiles = s.tiles.map(tileIndexOf);
      for (const t of tiles) this.tileOwner.set(t, s);
      const look = structureLook(s);
      for (const part of partsForKind(s.kind)) {
        const own = part.at && part.at.every((k) => k < tiles.length) ? part.at.map((k) => tiles[k]!) : tiles;
        footprintFrame(this.grid, own, this.frame, footprintSpan(own.length));
        const local = partMatrix(this.frame, part.model, new THREE.Matrix4(), this.basis);
        footprintFrame(this.grid, tiles, this.frame);
        this.parts.push({
          structureId: s.id,
          model: part.model,
          tiles,
          look,
          local,
          inverse: local.clone().invert(),
          center: new THREE.Vector3(this.frame.position.x, this.frame.position.y, this.frame.position.z),
          width: this.frame.width,
        });
      }
    }
    this.centroid.set(0, 0, 0);
    for (const part of this.parts) {
      this.batch(part.model);
      this.centroid.add(part.center);
    }
    if (this.centroid.lengthSq() > 1e-12) this.centroid.normalize();
    else this.centroid.set(0, 1, 0);
    this.writeSolids();
    for (const [id, b] of this.batches) this.writeOutline(id, b);
  }

  private refreshLooks(): void {
    const byId = new Map(this.structures.map((s) => [s.id, s]));
    for (const p of this.parts) {
      const s = byId.get(p.structureId);
      if (s) p.look = structureLook(s);
    }
  }

  private writeSolids(): void {
    const counts = new Map<ModelId, number>();
    for (const b of this.batches.values()) b.solid.ensure(this.parts.length);
    for (const p of this.parts) {
      if (!p.look.solid) continue;
      const b = this.batches.get(p.model)!;
      const i = counts.get(p.model) ?? 0;
      this.m.copy(p.local);
      if (p.look.height < 1) this.m.multiply(SCALE_Y.makeScale(1, p.look.height, 1));
      b.solid.setMatrixAt(i, this.m);
      counts.set(p.model, i + 1);
    }
    for (const [id, b] of this.batches) b.solid.commit(counts.get(id) ?? 0);
  }

  private writeOutline(id: ModelId, b: Batch): void {
    const edges = this.kit.edges(id);
    const per = edges.getAttribute('position').count;
    const outlined = this.parts.filter((p) => p.model === id && p.look.outline);
    b.outline.ensure(outlined.length * per);
    let at = 0;
    for (const p of outlined) at = writeTransformed(edges, p.local, b.outline.positions, at, this.v);
    b.outline.commit(at);
  }

  private batch(id: ModelId): Batch {
    let b = this.batches.get(id);
    if (!b) {
      b = {
        solid: new InstancedBatch(this.group, this.kit.geometry(id), this.kit.material, `${this.grid.bodyId}_${id}`),
        outline: new LineBuffer(this.outlineMaterial, 256, false, `${this.grid.bodyId}_${id}_Sites`),
      };
      this.group.add(b.outline.lines);
      this.batches.set(id, b);
    }
    return b;
  }

  private rebuildDecor(): void {
    if (!this.showDecor) return;
    const tiles = this.grid.tiles.filter((t) => t.deposit && !this.tileOwner.has(t.index) && !this.exhausted.has(t.index));
    if (!this.decor) this.decor = new InstancedBatch(this.group, this.kit.geometry(DEPOSIT_MODEL), this.kit.material, `${this.grid.bodyId}_Deposits`, Math.max(8, tiles.length));
    this.decor.ensure(tiles.length);
    const spec = MODELS[DEPOSIT_MODEL];
    const width = this.grid.tileEdge * Math.sqrt(3);
    const s = fitScale(spec, width);
    const q = new THREE.Quaternion();
    const yaw = new THREE.Quaternion();
    tiles.forEach((t, i) => {
      this.v.set(t.normal.x, t.normal.y, t.normal.z);
      q.setFromUnitVectors(UP, this.v).multiply(yaw.setFromAxisAngle(UP, ((t.index * 2654435761) >>> 0) % 628 / 100));
      this.m.compose(new THREE.Vector3(t.center.x, t.center.y, t.center.z), q, new THREE.Vector3(s, s, s));
      this.decor!.setMatrixAt(i, this.m);
    });
    this.decor.commit(tiles.length);
  }
}
