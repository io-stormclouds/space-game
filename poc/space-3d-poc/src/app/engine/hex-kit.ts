import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** One material group of a kit model: node transforms baked in, non-indexed, positions only. */
export interface KitPart {
  /** KayKit material name (`Green`, `Stone`, `Water`…): the key the palette colours by. */
  mat: string;
  pos: Float32Array;
}

export interface KitModel {
  id: string;
  parts: ReadonlyArray<KitPart>;
  box: THREE.Box3;
  size: THREE.Vector3;
  triangles: number;
}

export const HEX_KIT_BASE = '/assets/kaykit-hex';

/** Loads a kit file's scene; the browser fetches over HTTP, tests read from disk. */
export type KitSource = (id: string, url: string) => Promise<THREE.Object3D>;

/**
 * Loader for the KayKit Medieval Hexagon subset (`.gltf.glb`, no textures: colour is the material name).
 * Keeps the geometry as plain arrays per material so the terrain layer can warp tiles vertex by vertex and
 * colour them from the palette. Each file is fetched once.
 */
export class HexKit {
  private readonly loader = new GLTFLoader();
  private readonly cache = new Map<string, Promise<KitModel>>();

  constructor(
    private readonly base = HEX_KIT_BASE,
    private readonly source: KitSource = (_id, url) => this.loader.loadAsync(url).then((g) => g.scene),
  ) {}

  load(id: string): Promise<KitModel> {
    let p = this.cache.get(id);
    if (!p) {
      p = this.source(id, `${this.base}/${id}.gltf.glb`).then((scene) => flatten(id, scene));
      this.cache.set(id, p);
    }
    return p;
  }

  async loadAll(ids: Iterable<string>): Promise<ReadonlyMap<string, KitModel>> {
    const list = [...new Set(ids)];
    const models = await Promise.all(list.map((id) => this.load(id)));
    return new Map(models.map((m) => [m.id, m]));
  }
}

function flatten(id: string, scene: THREE.Object3D): KitModel {
  scene.updateMatrixWorld(true);
  const parts: KitPart[] = [];
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  let triangles = 0;
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const g = (o.geometry as THREE.BufferGeometry).index ? (o.geometry as THREE.BufferGeometry).toNonIndexed() : (o.geometry as THREE.BufferGeometry).clone();
    g.applyMatrix4(o.matrixWorld);
    const pos = (g.getAttribute('position').array as Float32Array).slice();
    const material = (Array.isArray(o.material) ? o.material[0] : o.material) as THREE.Material;
    for (let i = 0; i < pos.length; i += 3) box.expandByPoint(v.set(pos[i], pos[i + 1], pos[i + 2]));
    triangles += pos.length / 9;
    parts.push({ mat: material.name, pos });
    g.dispose();
  });
  if (parts.length === 0) throw new Error(`Kit model ${id} has no meshes`);
  return { id, parts, box, size: box.getSize(new THREE.Vector3()), triangles };
}
