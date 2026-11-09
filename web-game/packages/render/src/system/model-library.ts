import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { flattenKitScene, kitGeometry, ownBuffer } from './hex-kit';
import { MODELS, type ModelId, modelDir, modelUrl, sourceOf } from './model-registry';
import { atlasShade, atlasTone } from './palette';
import { objectTone } from './terrain-tones';

/** One loaded KayKit model, flattened to a single geometry so it can be instanced. */
export interface ModelAsset {
  id: ModelId;
  /**
   * position, normal, color: Space Base Bits atlas swatches recoloured into the limited palette
   * (indexed), or Medieval Hexagon material names through `objectTone` (non-indexed).
   */
  geometry: THREE.BufferGeometry;
  /** Authored bounds (after the registry yaw). */
  box: THREE.Box3;
  size: THREE.Vector3;
  triangles: number;
}

/** Minimal shape of glTF JSON that `stripTextures` and `packGlb` touch. */
export interface GltfJson {
  images?: unknown[];
  textures?: unknown[];
  samplers?: unknown[];
  materials?: Array<{ pbrMetallicRoughness?: { baseColorTexture?: unknown } } & Record<string, unknown>>;
  buffers?: Array<{ uri?: string; byteLength: number }>;
  bufferViews?: Array<{ buffer: number; byteOffset?: number } & Record<string, unknown>>;
  [key: string]: unknown;
}

/** Reads a file as bytes (fetch in the browser, fs in tests). */
export type FetchBytes = (url: string) => Promise<ArrayBuffer>;

const pad4 = (n: number) => (n + 3) & ~3;

/**
 * Packs glTF JSON and its external buffers into one binary glTF (GLB) in memory: every buffer is
 * concatenated into the BIN chunk and the buffer views re-pointed. GLTFLoader then parses it
 * without any further network request (and without FileLoader, which needs DOM events).
 */
export function packGlb(json: GltfJson, buffers: ReadonlyArray<ArrayBuffer>): ArrayBuffer {
  const offsets: number[] = [];
  let binLength = 0;
  for (const b of buffers) {
    offsets.push(binLength);
    binLength = pad4(binLength + b.byteLength);
  }
  const out: GltfJson = {
    ...json,
    buffers: [{ byteLength: binLength }],
    bufferViews: (json.bufferViews ?? []).map((v) => ({ ...v, buffer: 0, byteOffset: (v.byteOffset ?? 0) + (offsets[v.buffer] ?? 0) })),
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(out));
  const jsonLength = pad4(jsonBytes.length);
  const total = 12 + 8 + jsonLength + 8 + binLength;
  const glb = new ArrayBuffer(total);
  const view = new DataView(glb);
  const bytes = new Uint8Array(glb);
  view.setUint32(0, 0x46546c67, true); // 'glTF'
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true); // 'JSON'
  bytes.set(jsonBytes, 20);
  bytes.fill(0x20, 20 + jsonBytes.length, 20 + jsonLength);
  const binStart = 20 + jsonLength;
  view.setUint32(binStart, binLength, true);
  view.setUint32(binStart + 4, 0x004e4942, true); // 'BIN\0'
  buffers.forEach((b, i) => bytes.set(new Uint8Array(b), binStart + 8 + offsets[i]!));
  return glb;
}

const KEEP_ATTRIBUTES = new Set(['position', 'normal', 'color']);
/** Feature-edge angle for ghost and site outlines. */
const EDGE_THRESHOLD_DEG = 30;

/**
 * glTF without images and textures: colour comes from the atlas UVs (vertex colours), so the PNG is
 * never fetched, decoded or uploaded (W14: limited palette; one less texture to dispose).
 */
export function stripTextures<T extends GltfJson>(json: T): T {
  const out = { ...json } as T;
  delete out.images;
  delete out.textures;
  delete out.samplers;
  if (out.materials) {
    out.materials = out.materials.map((m) => {
      if (!m.pbrMetallicRoughness) return m;
      const { baseColorTexture: _drop, ...pbr } = m.pbrMetallicRoughness;
      return { ...m, pbrMetallicRoughness: pbr };
    });
  }
  return out;
}

/** Writes a `color` attribute from the `uv` attribute (atlas swatch → palette tone × gradient shade). */
export function colorFromAtlas(geometry: THREE.BufferGeometry): void {
  const uv = geometry.getAttribute('uv');
  const count = geometry.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const u = uv ? uv.getX(i) : 0;
    const v = uv ? uv.getY(i) : 0;
    c.setHex(atlasTone(u, v)).multiplyScalar(atlasShade(v));
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/**
 * Merges every mesh of a glTF scene into one geometry with the node transforms baked in (PoC
 * `ModelLibrary.extract`), recolours it from the atlas and drops the scene's own resources.
 */
export function flattenScene(id: ModelId, scene: THREE.Object3D, yaw = 0): ModelAsset {
  scene.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  const owned: Array<{ dispose(): void }> = [];
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const src = obj.geometry as THREE.BufferGeometry;
    owned.push(src);
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats as THREE.Material[]) owned.push(m);
    const g = src.clone().applyMatrix4(obj.matrixWorld);
    colorFromAtlas(g);
    for (const name of Object.keys(g.attributes)) if (!KEEP_ATTRIBUTES.has(name)) g.deleteAttribute(name);
    parts.push(g);
  });
  for (const r of owned) r.dispose();
  if (parts.length === 0) throw new Error(`Model ${id} has no meshes`);
  const indexed = parts.every((p) => p.index);
  const merged = parts.length === 1 ? parts[0]! : mergeGeometries(indexed ? parts : parts.map((p) => (p.index ? p.toNonIndexed() : p)), false);
  if (!merged) throw new Error(`Model ${id}: cannot merge meshes`);
  if (merged !== parts[0]) for (const p of parts) p.dispose();
  if (yaw) merged.rotateY(yaw);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  const box = merged.boundingBox!.clone();
  const size = box.getSize(new THREE.Vector3());
  const triangles = (merged.index ? merged.index.count : merged.getAttribute('position').count) / 3;
  return { id, geometry: merged, box, size, triangles };
}

/**
 * Medieval Hexagon scene → asset: the hex-kit flattening (`flattenKitScene`, shared with the terrain
 * layer), vertex colours from the material names (`objectTone`, full tones: these are the player's
 * buildings, the settlement ruins are faded), the registry yaw.
 */
export function flattenHexScene(id: ModelId, scene: THREE.Object3D, yaw = 0): ModelAsset {
  const kit = flattenKitScene(id, scene);
  const geometry = kitGeometry(kit, objectTone, yaw);
  const box = geometry.boundingBox!.clone();
  return { id, geometry, box, size: box.getSize(new THREE.Vector3()), triangles: kit.triangles };
}

/**
 * Loads KayKit models of both sources (`ModelSpec.source`): Space Base Bits glTF from
 * `${assetsBase}kaykit/`, Medieval Hexagon GLB from `${assetsBase}kaykit-hex/`. Caches them and owns
 * every geometry it made: `dispose()` frees all of them, including loads that finish after the dispose.
 */
export class ModelLibrary {
  private readonly loader = new GLTFLoader();
  private readonly cache = new Map<ModelId, Promise<ModelAsset | null>>();
  private readonly assets = new Map<ModelId, ModelAsset>();
  private readonly edges = new Map<ModelId, THREE.BufferGeometry>();
  private disposed = false;

  constructor(
    private readonly assetsBase = 'assets/',
    private readonly fetchBytes: FetchBytes = defaultFetchBytes,
  ) {}

  /** Loaded asset, or undefined while loading / after a failure. */
  get(id: ModelId): ModelAsset | undefined {
    return this.assets.get(id);
  }

  /** Feature edges of a loaded model (built once, owned by the library). */
  edgesOf(id: ModelId): THREE.BufferGeometry | undefined {
    const asset = this.assets.get(id);
    if (!asset) return undefined;
    let e = this.edges.get(id);
    if (!e) {
      e = new THREE.EdgesGeometry(asset.geometry, EDGE_THRESHOLD_DEG);
      this.edges.set(id, e);
    }
    return e;
  }

  /** Resolves with the asset, or null when the file is missing or the library was disposed. */
  load(id: ModelId): Promise<ModelAsset | null> {
    let p = this.cache.get(id);
    if (!p) {
      p = this.fetchModel(id)
        .then((glb) => (this.disposed ? null : this.parse(id, glb)))
        .catch((err: unknown) => {
          if (!this.disposed) console.warn(`KayKit model ${id} unavailable, keeping the placeholder`, err);
          return null;
        });
      this.cache.set(id, p);
    }
    return p;
  }

  /** The .gltf and its .bin buffers, without textures, as one GLB (a hex-kit file already is one). */
  async fetchModel(id: ModelId): Promise<ArrayBuffer> {
    if (sourceOf(id) === 'hex') return ownBuffer(await this.fetchBytes(modelUrl(this.assetsBase, id)));
    const json = stripTextures(JSON.parse(new TextDecoder().decode(await this.fetchBytes(modelUrl(this.assetsBase, id)))) as GltfJson);
    const dir = modelDir(this.assetsBase);
    const buffers = await Promise.all((json.buffers ?? []).map((b) => {
      if (!b.uri) throw new Error(`Model ${id}: embedded buffers are not supported`);
      return this.fetchBytes(dir + b.uri);
    }));
    return packGlb(json, buffers);
  }

  /** Parses a GLB (or self-contained glTF JSON) into a flattened asset. */
  parse(id: ModelId, data: ArrayBuffer | GltfJson | string, path = ''): Promise<ModelAsset | null> {
    return new Promise<ModelAsset | null>((resolve, reject) => {
      this.loader.parse(
        data instanceof ArrayBuffer || typeof data === 'string' ? data : JSON.stringify(data),
        path,
        (gltf) => {
          try {
            const asset = sourceOf(id) === 'hex' ? flattenHexScene(id, gltf.scene, MODELS[id].yaw) : flattenScene(id, gltf.scene, MODELS[id].yaw);
            if (this.disposed) {
              asset.geometry.dispose();
              resolve(null);
              return;
            }
            this.assets.get(id)?.geometry.dispose();
            this.assets.set(id, asset);
            resolve(asset);
          } catch (e) {
            reject(e);
          }
        },
        reject,
      );
    });
  }

  dispose(): void {
    this.disposed = true;
    for (const a of this.assets.values()) a.geometry.dispose();
    for (const e of this.edges.values()) e.dispose();
    this.assets.clear();
    this.edges.clear();
    this.cache.clear();
  }
}

async function defaultFetchBytes(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.arrayBuffer();
}
