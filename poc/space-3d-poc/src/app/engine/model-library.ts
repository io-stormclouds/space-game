import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ModelSpec, modelUrl } from './model-registry';

/** One loaded KayKit model, flattened to a single geometry + material so it can be instanced. */
export interface ModelAsset {
  file: string;
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Authored bounds (before any fitting). */
  size: THREE.Vector3;
  triangles: number;
}

const KEEP_ATTRIBUTES = ['position', 'normal', 'uv'];

/**
 * Loads glTF files from `public/assets/kaykit/` and caches them. All KayKit models share one
 * texture atlas and one material, so every asset's material is interchangeable; the geometry of
 * each file is merged into one BufferGeometry (node transforms baked in) for InstancedMesh use.
 */
export class ModelLibrary {
  private readonly loader = new GLTFLoader();
  private readonly cache = new Map<string, Promise<ModelAsset>>();
  private readonly assets: ModelAsset[] = [];

  constructor(private readonly base = '/assets/kaykit') {}

  load(spec: ModelSpec): Promise<ModelAsset> {
    let p = this.cache.get(spec.file);
    if (!p) {
      p = this.loader.loadAsync(modelUrl(this.base, spec)).then((gltf) => this.extract(spec.file, gltf.scene, spec.yaw));
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
      const m = a.material as THREE.MeshStandardMaterial;
      m.map?.dispose();
      m.dispose();
    }
    this.assets.length = 0;
    this.cache.clear();
  }

  private extract(file: string, scene: THREE.Object3D, yaw: number): ModelAsset {
    scene.updateMatrixWorld(true);
    const parts: THREE.BufferGeometry[] = [];
    let material: THREE.Material | null = null;
    scene.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const g = (obj.geometry as THREE.BufferGeometry).clone().applyMatrix4(obj.matrixWorld);
      for (const name of Object.keys(g.attributes)) if (!KEEP_ATTRIBUTES.includes(name)) g.deleteAttribute(name);
      if (!g.getAttribute('uv')) {
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.getAttribute('position').count * 2), 2));
      }
      parts.push(g.index ? g : g); // all KayKit meshes are indexed
      material ??= (Array.isArray(obj.material) ? obj.material[0] : obj.material) as THREE.Material;
    });
    if (parts.length === 0 || !material) throw new Error(`Model ${file} has no meshes`);
    const geometry = parts.length === 1 ? parts[0] : (mergeGeometries(parts, false) as THREE.BufferGeometry);
    if (yaw) geometry.rotateY(yaw);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    const size = new THREE.Vector3();
    geometry.boundingBox!.getSize(size);
    const triangles = (geometry.index ? geometry.index.count : geometry.getAttribute('position').count) / 3;
    const asset: ModelAsset = { file, geometry, material, size, triangles };
    this.assets.push(asset);
    return asset;
  }
}
