import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ModelPack, ModelPart, ModelSpec, PACK_BASES, partUrl, partsOf } from './model-registry';

/** One loaded model, flattened to a single geometry + material so it can be instanced. */
export interface ModelAsset {
  file: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Authored bounds (before any fitting). */
  size: THREE.Vector3;
  triangles: number;
}

/** Loads one part's scene; the browser fetches over HTTP, tests read files from disk. */
export type SceneSource = (part: ModelPart, url: string) => Promise<THREE.Object3D>;

const TEXTURED_ATTRIBUTES = ['position', 'normal', 'uv'];
const PALETTE_ATTRIBUTES = ['position', 'normal', 'color'];

/**
 * Loads glTF models and caches them.
 *
 * - **KayKit** (`.gltf`): every model shares one texture atlas and one material, so the geometry of a
 *   file is merged into one BufferGeometry (node transforms baked in) and keeps the file's material.
 * - **Kenney** (`.glb`): flat-coloured, several materials per model (`metal`, `metalRed`, `dark`…) and
 *   no textures. Each material's base colour is baked into a vertex colour, so every Kenney model
 *   renders with ONE shared vertex-colour material — one draw call per model, like KayKit.
 *
 * A spec may be a composite of several parts (Kenney kit pieces stacked into one building); parts are
 * placed, merged and the result is recentred on its footprint with its lowest point at y = 0.
 */
export class ModelLibrary {
  private readonly loader = new GLTFLoader();
  private readonly cache = new Map<string, Promise<ModelAsset>>();
  private readonly scenes = new Map<string, Promise<THREE.Object3D>>();
  private readonly assets: ModelAsset[] = [];
  private paletteMaterial: THREE.MeshStandardMaterial | null = null;

  constructor(
    private readonly bases: Record<ModelPack, string> = PACK_BASES,
    private readonly source: SceneSource = (_part, url) => this.loader.loadAsync(url).then((g) => g.scene),
  ) {}

  load(spec: ModelSpec): Promise<ModelAsset> {
    let p = this.cache.get(spec.file);
    if (!p) {
      const parts = partsOf(spec);
      p = Promise.all(parts.map((part) => this.scene(part))).then((scenes) => this.build(spec, parts, scenes));
      this.cache.set(spec.file, p);
    }
    return p;
  }

  /** Parses glTF JSON text (buffers/images as data URIs or omitted). Used by tests. */
  parse(file: string, jsonText: string, yaw = 0): Promise<ModelAsset> {
    return new Promise((resolve, reject) => {
      this.loader.parse(jsonText, '', (gltf) => resolve(this.extract(file, gltf.scene, yaw)), reject);
    });
  }

  dispose(): void {
    for (const a of this.assets) {
      a.geometry.dispose();
      if (a.material === this.paletteMaterial) continue;
      const m = a.material as THREE.MeshStandardMaterial;
      m.map?.dispose();
      m.dispose();
    }
    this.paletteMaterial?.dispose();
    this.paletteMaterial = null;
    this.assets.length = 0;
    this.cache.clear();
    this.scenes.clear();
  }

  private scene(part: ModelPart): Promise<THREE.Object3D> {
    const key = `${part.pack}:${part.file}`;
    let p = this.scenes.get(key);
    if (!p) {
      p = this.source(part, partUrl(this.bases[part.pack], part));
      this.scenes.set(key, p);
    }
    return p;
  }

  private build(spec: ModelSpec, parts: ReadonlyArray<ModelPart>, scenes: ReadonlyArray<THREE.Object3D>): ModelAsset {
    const single = parts.length === 1 && !spec.parts;
    if (single && parts[0].pack === 'kaykit' && !spec.recenter) return this.extract(spec.file, scenes[0], spec.yaw);

    const palette = parts.every((p) => p.pack === 'kenney');
    if (!palette && parts.some((p) => p.pack === 'kenney')) throw new Error(`Model ${spec.file} mixes packs`);
    const pieces: THREE.BufferGeometry[] = [];
    let material: THREE.Material | null = null;
    parts.forEach((part, i) => {
      const flat = this.flatten(spec.file, scenes[i], palette);
      material ??= flat.material;
      // Kenney files carry an offset on their root node; place every part from its own footprint centre
      recentre(flat.geometry);
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(part.x ?? 0, part.y ?? 0, part.z ?? 0),
        new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), part.yaw ?? 0),
        new THREE.Vector3().setScalar(part.scale ?? 1),
      );
      pieces.push(flat.geometry.applyMatrix4(m));
    });
    const geometry = merge(spec.file, pieces);
    if (spec.yaw) geometry.rotateY(spec.yaw);
    recentre(geometry);
    return this.finish(spec.file, geometry, palette ? this.palette() : material!);
  }

  private extract(file: string, scene: THREE.Object3D, yaw: number): ModelAsset {
    const { geometry, material } = this.flatten(file, scene, false);
    if (yaw) geometry.rotateY(yaw);
    return this.finish(file, geometry, material);
  }

  /** Bakes node transforms and merges every mesh of a scene into one geometry. */
  private flatten(file: string, scene: THREE.Object3D, palette: boolean): { geometry: THREE.BufferGeometry; material: THREE.Material } {
    scene.updateMatrixWorld(true);
    const keep = palette ? PALETTE_ATTRIBUTES : TEXTURED_ATTRIBUTES;
    const parts: THREE.BufferGeometry[] = [];
    let material: THREE.Material | null = null;
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const g = (obj.geometry as THREE.BufferGeometry).clone().applyMatrix4(obj.matrixWorld);
      const mat = (Array.isArray(obj.material) ? obj.material[0] : obj.material) as THREE.MeshStandardMaterial;
      for (const name of Object.keys(g.attributes)) if (!keep.includes(name)) g.deleteAttribute(name);
      const count = g.getAttribute('position').count;
      if (palette) {
        const c = mat.color ?? new THREE.Color(1, 1, 1);
        const colors = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b], i * 3);
        g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      } else if (!g.getAttribute('uv')) {
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
      }
      parts.push(g);
      material ??= mat;
    });
    if (parts.length === 0 || !material) throw new Error(`Model ${file} has no meshes`);
    return { geometry: merge(file, parts), material };
  }

  private finish(file: string, geometry: THREE.BufferGeometry, material: THREE.Material): ModelAsset {
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const size = new THREE.Vector3();
    geometry.boundingBox!.getSize(size);
    const triangles = (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;
    const asset: ModelAsset = { file, geometry, material, size, triangles };
    this.assets.push(asset);
    return asset;
  }

  /** The one material every Kenney model shares: colours come from the vertices. */
  private palette(): THREE.MeshStandardMaterial {
    // Kenney files say metallic 1 / roughness 1, which renders almost black without an environment map.
    this.paletteMaterial ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.12 });
    return this.paletteMaterial;
  }
}

/** Footprint centred on the origin, lowest point on y = 0. */
function recentre(geometry: THREE.BufferGeometry): void {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
}

/** Merges geometries, making them all indexed or all non-indexed first. */
function merge(file: string, parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  if (parts.length === 1) return parts[0];
  const indexed = parts.every((g) => g.index);
  const list = indexed ? parts : parts.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(list, false);
  if (!merged) throw new Error(`Model ${file}: parts have incompatible attributes`);
  return merged;
}
