import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { FetchBytes } from './model-library';
import { hexKitUrl } from './model-registry';

export { hexKitUrl } from './model-registry';

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

/**
 * Bytes as an ArrayBuffer of this realm. GLTFLoader tells a GLB from JSON text by `instanceof
 * ArrayBuffer`; bytes from another realm (jsdom, workers) fail it and would be read as text.
 */
export function ownBuffer(bytes: ArrayBuffer): ArrayBuffer {
  return bytes instanceof ArrayBuffer ? bytes : new Uint8Array(bytes).slice().buffer;
}

/**
 * Loader for the KayKit Medieval Hexagon subset (`.gltf.glb`, no textures: colour is the material name).
 * Keeps the geometry as plain arrays per material so the terrain layer can warp tiles vertex by vertex
 * and colour them from the palette. Each file is fetched once. Player structures of the medieval skin
 * go through `ModelLibrary` instead, which uses the same `flattenKitScene` + `kitGeometry`.
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
    return new Promise((resolve, reject) => {
      this.loader.parse(ownBuffer(bytes), '', (gltf) => resolve(flattenKitScene(id, gltf.scene)), reject);
    });
  }
}

/**
 * Bakes every mesh of a hex-kit glTF scene (node transforms applied, non-indexed) into position
 * arrays grouped by material name, and drops the scene's own geometries and materials.
 */
export function flattenKitScene(id: string, scene: THREE.Object3D): KitModel {
  scene.updateMatrixWorld(true);
  const parts: KitPart[] = [];
  const owned: Array<{ dispose(): void }> = [];
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  let triangles = 0;
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const src = o.geometry as THREE.BufferGeometry;
    const g = src.index ? src.toNonIndexed() : src.clone();
    g.applyMatrix4(o.matrixWorld);
    const pos = (g.getAttribute('position').array as Float32Array).slice();
    const mats = (Array.isArray(o.material) ? o.material : [o.material]) as THREE.Material[];
    for (let i = 0; i < pos.length; i += 3) box.expandByPoint(v.set(pos[i]!, pos[i + 1]!, pos[i + 2]!));
    triangles += pos.length / 9;
    parts.push({ mat: mats[0]!.name, pos });
    g.dispose();
    owned.push(src, ...mats);
  });
  for (const r of owned) r.dispose();
  if (parts.length === 0) throw new Error(`Kit model ${id} has no meshes`);
  return { id, parts, box, size: box.getSize(new THREE.Vector3()), triangles };
}

/**
 * One flat-shadable geometry of a kit model: position, normal and a `color` per vertex from
 * `tone(material name)` (sRGB hex), turned by `yaw` about +Y. Bounds computed.
 */
export function kitGeometry(model: KitModel, tone: (mat: string) => number, yaw = 0): THREE.BufferGeometry {
  let n = 0;
  for (const part of model.parts) n += part.pos.length;
  const positions = new Float32Array(n);
  const colors = new Float32Array(n);
  const c = new THREE.Color();
  let at = 0;
  for (const part of model.parts) {
    positions.set(part.pos, at);
    c.setHex(tone(part.mat));
    for (let i = 0; i < part.pos.length; i += 3) {
      colors[at + i] = c.r;
      colors[at + i + 1] = c.g;
      colors[at + i + 2] = c.b;
    }
    at += part.pos.length;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  if (yaw) geometry.rotateY(yaw);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

async function defaultFetchBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.arrayBuffer();
}
