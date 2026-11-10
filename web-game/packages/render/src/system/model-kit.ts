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

/** Smallest side of a proxy box, as a share of its largest (flat models such as fields keep a visible slab). */
const PROXY_MIN_SIDE = 0.05;

/**
 * Unit box → model box `box` (T4b proxies): the proxy box (side 1, centred) scaled to the box and moved to its
 * centre, so a proxy under a part's matrix covers exactly what the model's bounds (and picking) cover.
 */
export function boxMatrix(box: THREE.Box3, out: THREE.Matrix4): THREE.Matrix4 {
  const sx = box.max.x - box.min.x;
  const sy = box.max.y - box.min.y;
  const sz = box.max.z - box.min.z;
  const min = Math.max(sx, sy, sz) * PROXY_MIN_SIDE;
  out.makeScale(Math.max(sx, min), Math.max(sy, min), Math.max(sz, min));
  return out.setPosition((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, (box.min.z + box.max.z) / 2);
}

/**
 * Area-weighted mean of a geometry's vertex colours (indexed or not): how a model reads from far away, where it
 * covers a few pixels (T4b proxies). Null without a colour attribute or faces.
 */
export function meanColor(g: THREE.BufferGeometry, out: THREE.Color): THREE.Color | null {
  const pos = g.getAttribute('position');
  const col = g.getAttribute('color');
  if (!pos || !col) return null;
  const idx = g.index;
  const n = idx ? idx.count : pos.count;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  let r = 0;
  let gr = 0;
  let bl = 0;
  let total = 0;
  for (let t = 0; t + 2 < n; t += 3) {
    const i = idx ? idx.getX(t) : t;
    const j = idx ? idx.getX(t + 1) : t + 1;
    const k = idx ? idx.getX(t + 2) : t + 2;
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, j).sub(a);
    c.fromBufferAttribute(pos, k).sub(a);
    const area = b.cross(c).length();
    if (!(area > 0)) continue;
    r += (area * (col.getX(i) + col.getX(j) + col.getX(k))) / 3;
    gr += (area * (col.getY(i) + col.getY(j) + col.getY(k))) / 3;
    bl += (area * (col.getZ(i) + col.getZ(j) + col.getZ(k))) / 3;
    total += area;
  }
  return total > 0 ? out.setRGB(r / total, gr / total, bl / total) : null;
}

/**
 * Geometry source for every model of either kit (Space Base Bits or Medieval Hexagon: same API):
 * the flattened KayKit geometry once loaded, before that a placeholder box with the registry
 * bounds, so fitting and picking do not change when the model arrives. Owns the placeholders and
 * the proxy box (T4b); the library owns the models. One shared flat-shaded material.
 */
export class ModelKit {
  readonly library: ModelLibrary;
  /** Shared by every instanced model (vertex colours, flat shading, W14). */
  readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private readonly boxes = new Map<ModelId, THREE.BufferGeometry>();
  private readonly boxEdges = new Map<ModelId, THREE.BufferGeometry>();
  private readonly bounds = new Map<ModelId, THREE.Box3>();
  private readonly tones = new Map<ModelId, { of: THREE.BufferGeometry; color: THREE.Color }>();
  private proxy: THREE.BufferGeometry | null = null;
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

  /**
   * The proxy of every model far away (T4b): one box, side 1, centred, white vertex colours (12 triangles), shared
   * by every proxy batch; `boxMatrix(box(id))` fits it to a model, the instance colour (`tone`) tints it.
   */
  proxyBox(): THREE.BufferGeometry {
    if (!this.proxy) {
      this.proxy = paintGeometry(new THREE.BoxGeometry(1, 1, 1), 0xffffff);
      this.proxy.computeBoundingBox();
      this.proxy.computeBoundingSphere();
    }
    return this.proxy;
  }

  /** Representative colour of a model for its proxy: the mean of the loaded geometry's colours (placeholder tone before). */
  tone(id: ModelId): THREE.Color {
    const g = this.geometry(id);
    let t = this.tones.get(id);
    if (!t || t.of !== g) {
      const color = new THREE.Color();
      if (!meanColor(g, color)) color.setHex(SCENE.placeholder);
      t = { of: g, color };
      this.tones.set(id, t);
    }
    return t.color;
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
    for (const g of this.boxes.values()) g.dispose();
    for (const g of this.boxEdges.values()) g.dispose();
    this.proxy?.dispose();
    this.proxy = null;
    this.tones.clear();
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
