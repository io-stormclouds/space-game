import { BufferAttribute, BufferGeometry, Mesh, type Material } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { isProcModel, type ModelId } from '../domain/catalog/models';
import type { KitMaterials } from './kit-materials';
import { buildProcModel } from './proc-models';

/** One kit model flattened to a single geometry with one group per shared material. */
export interface KitModel {
  readonly id: ModelId;
  readonly geometry: BufferGeometry;
  readonly materials: readonly Material[];
}

const KEEP = new Set(['position', 'normal', 'uv']);

/**
 * Loads slim kit GLBs and flattens each into one indexed geometry whose groups map to the five
 * shared kit materials (by glTF material name). Flattened geometry is what instancing needs:
 * one InstancedMesh per model draws every copy of it in one call per material.
 */
export class KitLibrary {
  private readonly loader = new GLTFLoader();
  private readonly cache = new Map<ModelId, Promise<KitModel>>();
  private readonly ready = new Map<ModelId, KitModel>();

  constructor(
    private readonly baseUrl: string,
    private readonly materials: KitMaterials,
  ) {}

  get(id: ModelId): KitModel | undefined {
    return this.ready.get(id);
  }

  /** Kit models come from slim GLBs; the few the kit lacks are built in code (proc-models.ts). */
  load(id: ModelId): Promise<KitModel> {
    let p = this.cache.get(id);
    if (!p) {
      const source = isProcModel(id)
        ? Promise.resolve(buildProcModel(id, (name) => this.materials.get(name)))
        : this.loader.loadAsync(`${this.baseUrl}/${id}.glb`).then((gltf) => this.flatten(id, gltf.scene));
      p = source.then((model) => {
        this.ready.set(id, model);
        return model;
      });
      this.cache.set(id, p);
    }
    return p;
  }

  /** Loads many models with bounded concurrency; reports progress after each one. */
  async loadAll(ids: readonly ModelId[], onProgress?: (done: number, total: number) => void, concurrency = 8): Promise<void> {
    let next = 0;
    let done = 0;
    const worker = async () => {
      while (next < ids.length) {
        const id = ids[next++];
        try {
          await this.load(id);
        } catch (e) {
          console.error(`[kit] ${id}`, e);
        }
        onProgress?.(++done, ids.length);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, ids.length) }, worker));
  }

  private flatten(id: ModelId, root: import('three').Object3D): KitModel {
    root.updateMatrixWorld(true);
    const byMaterial = new Map<string, BufferGeometry[]>();
    root.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const src = mesh.geometry;
      // A primitive is one material; multi-material meshes come as several Mesh children.
      const name = mats[0]?.name || 'Atlas';
      const g = new BufferGeometry();
      for (const [attr, value] of Object.entries(src.attributes)) {
        if (KEEP.has(attr)) g.setAttribute(attr, value.clone());
      }
      if (!g.getAttribute('uv')) {
        const count = g.getAttribute('position').count;
        g.setAttribute('uv', new BufferAttribute(new Float32Array(count * 2), 2));
      }
      if (!g.getAttribute('normal')) g.computeVertexNormals();
      if (src.index) g.setIndex(src.index.clone());
      else g.setIndex([...Array(g.getAttribute('position').count).keys()]);
      g.applyMatrix4(mesh.matrixWorld);
      const list = byMaterial.get(name);
      if (list) list.push(g);
      else byMaterial.set(name, [g]);
      for (const m of mats) m.dispose();
    });

    const parts: BufferGeometry[] = [];
    const materials: Material[] = [];
    for (const [name, list] of byMaterial) {
      parts.push(list.length === 1 ? list[0] : mergeGeometries(list, false)!);
      materials.push(this.materials.get(name));
    }
    const geometry = mergeGeometries(parts, true)!;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    for (const p of parts) p.dispose();
    return { id, geometry, materials };
  }

  dispose(): void {
    for (const m of this.ready.values()) m.geometry.dispose();
    this.ready.clear();
    this.cache.clear();
  }
}
