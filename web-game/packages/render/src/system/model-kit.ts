import * as THREE from 'three';
import { ModelLibrary, type FetchBytes } from './model-library';
import { BASE_MODEL_IDS, MODELS, type ModelId } from './model-registry';
import { SCENE } from './palette';

/** Adds a constant `color` attribute so placeholders work with the shared vertex-colour material. */
export function paintGeometry<T extends THREE.BufferGeometry>(geometry: T, hex: number): T {
  const count = geometry.getAttribute('position').count;
  const c = new THREE.Color(hex);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

/**
 * Geometry source for every model of either kit (Space Base Bits or Medieval Hexagon: same API):
 * the flattened KayKit geometry once loaded, before that a placeholder box with the registry
 * bounds, so fitting and picking do not change when the model arrives. Owns the placeholders; the
 * library owns the models. One shared flat-shaded material.
 */
export class ModelKit {
  readonly library: ModelLibrary;
  /** Shared by every instanced model (vertex colours, flat shading, W14). */
  readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private readonly boxes = new Map<ModelId, THREE.BufferGeometry>();
  private readonly boxEdges = new Map<ModelId, THREE.BufferGeometry>();
  private readonly bounds = new Map<ModelId, THREE.Box3>();
  private readonly listeners = new Set<(id: ModelId) => void>();
  private disposed = false;

  constructor(assetsBase: string, fetchBytes?: FetchBytes) {
    this.library = new ModelLibrary(assetsBase, fetchBytes);
  }

  /**
   * Starts loading the given models (default: the Space Base Bits set; a skin's extra models are
   * loaded when a body uses it); resolves when all settled (missing ones keep the placeholder).
   */
  loadAll(ids: ReadonlyArray<ModelId> = BASE_MODEL_IDS): Promise<void> {
    return Promise.all(
      ids.map((id) =>
        this.library.load(id).then((asset) => {
          if (asset && !this.disposed) for (const l of this.listeners) l(id);
        }),
      ),
    ).then(() => undefined);
  }

  onLoaded(listener: (id: ModelId) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  isLoaded(id: ModelId): boolean {
    return !!this.library.get(id);
  }

  geometry(id: ModelId): THREE.BufferGeometry {
    return this.library.get(id)?.geometry ?? this.placeholder(id);
  }

  edges(id: ModelId): THREE.BufferGeometry {
    const e = this.library.edgesOf(id);
    if (e) return e;
    let b = this.boxEdges.get(id);
    if (!b) {
      b = new THREE.EdgesGeometry(this.placeholder(id));
      this.boxEdges.set(id, b);
    }
    return b;
  }

  /** Model-space bounds (registry numbers until loaded, then the real ones). */
  box(id: ModelId): THREE.Box3 {
    const asset = this.library.get(id);
    if (asset) return asset.box;
    let b = this.bounds.get(id);
    if (!b) {
      const s = MODELS[id];
      b = new THREE.Box3(new THREE.Vector3(-s.footprint / 2, -s.baseOffset, -s.footprint / 2), new THREE.Vector3(s.footprint / 2, s.height - s.baseOffset, s.footprint / 2));
      this.bounds.set(id, b);
    }
    return b;
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
    for (const g of this.boxes.values()) g.dispose();
    for (const g of this.boxEdges.values()) g.dispose();
    this.boxes.clear();
    this.boxEdges.clear();
    this.material.dispose();
    this.library.dispose();
  }

  private placeholder(id: ModelId): THREE.BufferGeometry {
    let g = this.boxes.get(id);
    if (!g) {
      const s = MODELS[id];
      g = paintGeometry(new THREE.BoxGeometry(s.footprint, s.height, s.footprint).translate(0, s.height / 2 - s.baseOffset, 0), SCENE.placeholder);
      g.computeBoundingSphere();
      this.boxes.set(id, g);
    }
    return g;
  }
}
