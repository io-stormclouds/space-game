import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { FetchBytes } from './model-library';

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

/** `${base}kaykit-hex/<id>.gltf.glb`; `base` is the app's assets base ('assets/' or '/assets/'). */
export function hexKitUrl(assetsBase: string, id: string): string {
  const base = assetsBase === '' || assetsBase.endsWith('/') ? assetsBase : `${assetsBase}/`;
  return `${base}kaykit-hex/${id}.gltf.glb`;
}

/**
 * Loader for the KayKit Medieval Hexagon subset (`.gltf.glb`, no textures: colour is the material name).
 * Keeps the geometry as plain arrays per material so the terrain layer can warp tiles vertex by vertex
 * and colour them from the palette. Each file is fetched once.
 */
export class HexKit {
  private readonly loader = new GLTFLoader();
  private readonly cache = new Map<string, Promise<KitModel>>();

  constructor(
    private readonly assetsBase: string,
    private readonly fetchBytes: FetchBytes = defaultFetchBytes,
  ) {}

  load(id: string): Promise<KitModel> {
    let p = this.cache.get(id);
    if (!p) {
      p = this.fetchBytes(hexKitUrl(this.assetsBase, id)).then((bytes) => this.parse(id, bytes));
      this.cache.set(id, p);
    }
    return p;
  }

  async loadAll(ids: Iterable<string>): Promise<ReadonlyMap<string, KitModel>> {
    const list = [...new Set(ids)];
    const models = await Promise.all(list.map((id) => this.load(id)));
    return new Map(models.map((m) => [m.id, m]));
  }

  dispose(): void {
    this.cache.clear();
  }

  private parse(id: string, bytes: ArrayBuffer): Promise<KitModel> {
    // GLTFLoader tells a GLB from JSON text by `instanceof ArrayBuffer`; bytes from another realm (jsdom, workers) fail it
    const data = bytes instanceof ArrayBuffer ? bytes : new Uint8Array(bytes).slice().buffer;
    return new Promise((resolve, reject) => {
      this.loader.parse(data, '', (gltf) => resolve(flatten(id, gltf.scene)), reject);
    });
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
    const src = o.geometry as THREE.BufferGeometry;
    const g = src.index ? src.toNonIndexed() : src.clone();
    g.applyMatrix4(o.matrixWorld);
    const pos = (g.getAttribute('position').array as Float32Array).slice();
    const material = (Array.isArray(o.material) ? o.material[0] : o.material) as THREE.Material;
    for (let i = 0; i < pos.length; i += 3) box.expandByPoint(v.set(pos[i]!, pos[i + 1]!, pos[i + 2]!));
    triangles += pos.length / 9;
    parts.push({ mat: material.name, pos });
    g.dispose();
  });
  if (parts.length === 0) throw new Error(`Kit model ${id} has no meshes`);
  return { id, parts, box, size: box.getSize(new THREE.Vector3()), triangles };
}

async function defaultFetchBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.arrayBuffer();
}
