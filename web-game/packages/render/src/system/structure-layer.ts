import * as THREE from 'three';
import { tileIndexOf, type PlanetGrid, type Structure } from '@space-game/domain';
import { InstancedBatch, LineBuffer, drawnInstances, writeTransformed } from './buffers';
import type { HemisphereCuller } from './hemisphere-culler';
import { boxMatrix, type ModelKit } from './model-kit';
import { DEPOSIT_MODEL, MODELS, baseLift, fitScale, footprintSpan, levelTier, partsFor, type ModelId, type ModelPart, type Skin } from './model-registry';
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

/**
 * Mid LOD band of the structures on a near body (LOD-mid; with a culler, while the body is not far): a structure
 * that stands more than STRUCTURE_MID_ANGLE round the body from the point under the camera (towards and past the
 * limb, where it is seen edge-on, squeezed into a thin ring of the disc, often only its top showing over the
 * horizon) and is narrower on screen than STRUCTURE_MID_PX is drawn as the T4b proxy boxes of its parts (the same
 * `kit.proxyBox` fitted to `kit.box(model)`, in `kit.tone(model)`). It gets its models back once nearer the camera
 * than STRUCTURE_NEAR_ANGLE or wider than STRUCTURE_NEAR_PX (the gaps are the hysteresis, per structure).
 *
 * The angle keeps what is near the camera full at any window size and zoom: in a close-up the horizon itself is
 * nearer than the band (acos(R/d) < 50° below d ≈ 1.56 R), at the default planet view (3.4 R, horizon 73°) the
 * inner nine tenths of the disc's radius on screen keep the models, and the band grows with the visible cap as the
 * camera backs away, so fewer models are drawn the further it is. The width is the "small on screen" guard: a
 * structure wider than STRUCTURE_MID_PX (a big window, a large footprint) stays a model [rad; px: the whole footprint
 * width at the distance of its centre].
 */
export const STRUCTURE_MID_ANGLE = (50 * Math.PI) / 180;
export const STRUCTURE_NEAR_ANGLE = (46 * Math.PI) / 180;
export const STRUCTURE_MID_PX = 64;
export const STRUCTURE_NEAR_PX = 72;
const COS_MID = Math.cos(STRUCTURE_MID_ANGLE);
const COS_NEAR = Math.cos(STRUCTURE_NEAR_ANGLE);
/**
 * The band is evaluated again only after the camera moved (body frame) by more than this share of its height above
 * the surface: in between no structure's angle moves by more than about 1° nor its distance by more than 2 %, well
 * inside the hysteresis.
 */
export const MID_LOD_REFRESH = 0.02;

const UP = new THREE.Vector3(0, 1, 0);
const SCALE_Y = new THREE.Matrix4();
const SCALE = new THREE.Vector3();

/** Level whose look a structure shows: its working level, L1 for a site before the first construction ends. */
export function modelLevel(s: Pick<Structure, 'level'>): number {
  return Math.max(1, s.level);
}

/** Surface frame of one part: its own tiles (`part.at`) or the whole footprint, sized by their span. */
export function partFrame(grid: PlanetGrid, tiles: ReadonlyArray<number>, part: ModelPart, out: SurfaceFrame): SurfaceFrame {
  const own = part.at && part.at.every((k) => k < tiles.length) ? part.at.map((k) => tiles[k]!) : tiles;
  return footprintFrame(grid, own, out, footprintSpan(own.length));
}

/**
 * Model → body-local matrix of a part in its frame: model +Y on the normal, +Z on the forward turned
 * by `part.yaw`, scaled to `part.fill` (default: the model's) of the frame width, lowest point on the
 * surface, then shifted by `part.offset` (frame widths).
 */
export function partMatrix(frame: SurfaceFrame, part: ModelPart, out: THREE.Matrix4, tmp: { x: THREE.Vector3; y: THREE.Vector3; z: THREE.Vector3 }): THREE.Matrix4 {
  const spec = MODELS[part.model];
  const s = fitScale(spec, frame.width, part.fill);
  let lift = baseLift(spec, s);
  tmp.y.set(frame.normal.x, frame.normal.y, frame.normal.z);
  tmp.z.set(frame.forward.x, frame.forward.y, frame.forward.z);
  tmp.x.crossVectors(tmp.y, tmp.z);
  let px = frame.position.x;
  let py = frame.position.y;
  let pz = frame.position.z;
  const o = part.offset;
  if (o) {
    const ox = (o.x ?? 0) * frame.width;
    const oz = (o.z ?? 0) * frame.width;
    px += tmp.x.x * ox + tmp.z.x * oz;
    py += tmp.x.y * ox + tmp.z.y * oz;
    pz += tmp.x.z * ox + tmp.z.z * oz;
    lift += (o.y ?? 0) * frame.width;
  }
  if (part.yaw) {
    // z' = z cos + x sin, x' = y × z'
    tmp.z.multiplyScalar(Math.cos(part.yaw)).addScaledVector(tmp.x, Math.sin(part.yaw));
    tmp.x.crossVectors(tmp.y, tmp.z);
  }
  out.makeBasis(tmp.x, tmp.y, tmp.z);
  out.scale(SCALE.set(s, s, s));
  out.setPosition(px + frame.normal.x * lift, py + frame.normal.y * lift, pz + frame.normal.z * lift);
  return out;
}

interface Batch {
  solid: InstancedBatch;
  outline: LineBuffer;
  /** Source index in `solid` → index of its part in `parts` (the mid band's filter). */
  src: Int32Array;
}

/**
 * Structures of one body (PoC `StructureView`, generalised): one InstancedMesh per model on the
 * body for solid parts, one merged LineSegments per model for outlines of sites (planned:
 * ghost; constructing: target silhouette; upgrading: scaffold), and deposit rocks (instanced)
 * on free deposit tiles. Each structure shows the parts of its kind at its level tier in the body's
 * skin (`partsFor(kind, level, skin)`: Space Base Bits, or Medieval Hexagon on a medieval body), so
 * an upgrade across a tier moves it to other batches. Rebuilt only when the layout signature
 * (ids, kinds, states, tiles, tiers) changes; progress-only changes rewrite the solid matrices.
 * With the body's culler (T4) solids and deposit rocks behind the horizon are not drawn (`recull`
 * each frame; `parts`, picking, `tileOwner` and the outlines keep every structure).
 *
 * Level of detail (T4b, only with a culler): far away (`setProxy`, the scene decides by apparent radius)
 * every solid part and deposit rock is drawn as the kit's proxy box fitted to its model's bounds
 * (`boxMatrix(kit.box(model))`, the same box picking tests) and tinted with the model's mean colour
 * (`kit.tone`), all in one culled InstancedMesh: one draw call for the body. The model batches are parked
 * meanwhile (their instances stay written); the site outlines are unchanged.
 *
 * Mid band (LOD-mid, only with a culler and while not proxied): `updateBand` (the scene, from the camera in the body
 * frame) sends every structure far round the body from the camera and small on screen (STRUCTURE_MID_ANGLE,
 * STRUCTURE_MID_PX) to a second proxy batch with the same boxes and tones, filtered by structure; the model batches
 * leave those parts out (`InstancedBatch.setFilter`). Both batches hold every solid part from the last write, so a
 * switch only re-compacts what is drawn: no new instances, meshes or geometries. `parts`, picking, `tileOwner` and
 * the site outlines do not change.
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
  /** Body → model matrix of every deposit rock drawn (the proxies reuse them). */
  private deposits: THREE.Matrix4[] = [];
  /** Proxy boxes of every solid part and deposit rock (T4b); null without a culler (no LOD). */
  private readonly proxy: InstancedBatch | null = null;
  private proxyOn = false;
  /** Mid-band proxy boxes of every solid part (LOD-mid), drawn for the parts flagged in `partMid`; null without a culler. */
  private readonly mid: InstancedBatch | null = null;
  /** Per part (`parts` order): 1 = its structure is in the mid band (drawn as boxes). */
  private partMid = new Uint8Array(0);
  /** Source index in `mid` (solid parts in order) → index of its part in `parts`. */
  private midSrc = new Int32Array(8);
  /** Camera (body frame) and px scale of the last band evaluation (NaN: evaluate at the next update). */
  private readonly bandCam = new THREE.Vector3(NaN, NaN, NaN);
  private bandScale = 0;
  /** The proxies no longer match the parts, rocks or loaded models (rewritten when they show). */
  private proxyStale = true;
  private readonly fit = new THREE.Matrix4();
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
    /** Look of the structures (`skinFor(body)`); fixed for the life of the layer. */
    readonly skin: Skin = 'spacebits',
    /** Visible cap of the body (hemisphere culling); null = draw every instance. */
    private readonly culler: HemisphereCuller | null = null,
  ) {
    this.group.name = `${grid.bodyId}_Structures`;
    // made up front (hidden while parked): the LOD switch adds and frees no GPU objects
    if (culler) {
      this.proxy = new InstancedBatch(this.group, kit.proxyBox(), kit.material, `${grid.bodyId}_Proxies`, 8, culler, true);
      this.proxy.park(true);
      this.mid = new InstancedBatch(this.group, kit.proxyBox(), kit.material, `${grid.bodyId}_MidProxies`, 8, culler, true);
      this.mid.setFilter((i) => this.partMid[this.midSrc[i]!] === 1);
    }
  }

  /** Re-culls the solids and deposit rocks, or the proxies, after the camera moved (no-op unless the culler recomputed). */
  recull(): void {
    if (this.proxyOn) return this.proxy!.recull();
    for (const b of this.batches.values()) b.solid.recull();
    this.decor?.recull();
    this.mid?.recull();
  }

  /**
   * Mid band (LOD-mid): flags the structures more than STRUCTURE_MID_ANGLE round the body from the point under the
   * camera and narrower on screen than STRUCTURE_MID_PX for their proxy boxes (back nearer than STRUCTURE_NEAR_ANGLE
   * or wider than STRUCTURE_NEAR_PX). `camera` is the camera position in the body frame, `pxPerUnit` the screen size
   * of one unit at distance one [px] ((height / 2) / tan(fov / 2)). Evaluated only when the camera moved by more than
   * MID_LOD_REFRESH of its height above the surface, the scale changed or the layout was rebuilt; no-op without a
   * culler or while proxied. Returns whether a structure changed band (the next `recull` draws it).
   */
  updateBand(camera: THREE.Vector3, pxPerUnit: number): boolean {
    if (!this.mid || this.proxyOn) return false;
    const r = camera.length();
    const step = MID_LOD_REFRESH * Math.max(r - this.grid.radius, 0);
    if (pxPerUnit === this.bandScale && this.bandCam.distanceToSquared(camera) <= step * step) return false; // NaN: evaluate
    this.bandCam.copy(camera);
    this.bandScale = pxPerUnit;
    let changed = false;
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i]!;
      const d = camera.distanceTo(p.center);
      const px = d > 0 ? (p.width * pxPerUnit) / d : Infinity;
      const c = p.center;
      const len = r * c.length();
      // cosine of the angle round the body centre between the structure and the camera
      const cos = len > 0 ? (c.x * camera.x + c.y * camera.y + c.z * camera.z) / len : 1;
      const was = this.partMid[i] === 1;
      const boxed = was ? cos < COS_NEAR && px < STRUCTURE_NEAR_PX : cos < COS_MID && px < STRUCTURE_MID_PX;
      if (boxed === was) continue;
      this.partMid[i] = boxed ? 1 : 0;
      changed = true;
    }
    if (changed) {
      for (const b of this.batches.values()) b.solid.refilter();
      this.mid.refilter();
    }
    return changed;
  }

  /** Whether a part's structure is in the mid band now (drawn as boxes unless the body is proxied; tests, harness). */
  inMidBand(part: PlacedPart): boolean {
    return this.partMid[this.parts.indexOf(part)] === 1;
  }

  /**
   * Proxies (far) or full models (near), T4b. No-op without a culler or when nothing changes. Returns whether
   * it switched.
   */
  setProxy(on: boolean): boolean {
    if (!this.proxy || on === this.proxyOn) return false;
    this.proxyOn = on;
    if (on && this.proxyStale) this.writeProxies();
    for (const b of this.batches.values()) b.solid.park(on);
    this.decor?.park(on);
    this.mid?.park(on);
    this.proxy.park(!on);
    return true;
  }

  /** Whether the structures are drawn as proxies. */
  get proxied(): boolean {
    return this.proxyOn;
  }

  /** Proxy instances: written (every solid part and deposit rock while proxied) and drawn after culling (tests, harness). */
  get proxyInstances(): { written: number; drawn: number } {
    return { written: this.proxyOn ? (this.proxy?.count ?? 0) : 0, drawn: this.proxy?.drawn ?? 0 };
  }

  /** The proxy mesh (tests, harness); null without LOD. */
  get proxyMesh(): THREE.InstancedMesh | null {
    return this.proxy?.mesh ?? null;
  }

  /** Where a part's proxy is drawn in the proxy mesh, -1 when culled, not solid or not proxied (tests). */
  proxySlotOfPart(part: PlacedPart): number {
    if (!this.proxy || !part.look.solid) return -1;
    let i = 0;
    for (const p of this.parts) {
      if (p === part) return this.proxy.slotOf(i);
      if (p.look.solid) i++;
    }
    return -1;
  }

  /** Mid-band proxy instances: written (every solid part) and drawn after the band and culling (tests, harness). */
  get midInstances(): { written: number; drawn: number } {
    return { written: this.mid?.count ?? 0, drawn: this.mid?.drawn ?? 0 };
  }

  /** The mid-band proxy mesh (tests, harness); null without LOD. */
  get midMesh(): THREE.InstancedMesh | null {
    return this.mid?.mesh ?? null;
  }

  /** Where a part's mid-band proxy is drawn in the mid mesh, -1 when culled, not solid, not in the band or proxied (tests). */
  midSlotOfPart(part: PlacedPart): number {
    if (!this.mid || !part.look.solid) return -1;
    let i = 0;
    for (const p of this.parts) {
      if (p === part) return this.mid.slotOf(i);
      if (p.look.solid) i++;
    }
    return -1;
  }

  /** Solid instances of a model: written and drawn after culling (tests, harness). */
  instancesOf(model: ModelId): { written: number; drawn: number } {
    const b = this.batches.get(model);
    return { written: b?.solid.count ?? 0, drawn: b?.solid.drawn ?? 0 };
  }

  /** Where a structure part's solid is drawn in its model's mesh, -1 when culled or not solid (tests). */
  slotOfPart(part: PlacedPart): number {
    if (!part.look.solid) return -1;
    let i = 0;
    for (const p of this.parts) {
      if (p === part) return this.batches.get(p.model)!.solid.slotOf(i);
      if (p.model === part.model && p.look.solid) i++;
    }
    return -1;
  }

  /**
   * Updates from the body's structures; `exhausted` = deposit tiles with nothing left.
   * Returns whether the layout (ids, kinds, states, tiles, level tiers) changed.
   */
  sync(structures: Structure[], exhausted: ReadonlySet<number>): boolean {
    let layout = '';
    let progress = '';
    for (const s of structures) {
      layout += `${s.id}|${s.kind}|${s.state}|${levelTier(modelLevel(s))}|${s.tiles.join(',')};`;
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
      this.writeMid(); // its bounds and tone came with it
    }
    if (id === DEPOSIT_MODEL && this.decor) this.decor.setGeometry(this.kit.geometry(id));
    if (b || id === DEPOSIT_MODEL) this.proxiesChanged(); // its bounds and tone came with it
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

  /** Adds the triangles and instances of the solid parts and deposit rocks (or their proxies) drawn this frame. */
  drawn(out: { triangles: number; instances: number }): void {
    for (const b of this.batches.values()) drawnInstances(b.solid.mesh, out);
    if (this.decor) drawnInstances(this.decor.mesh, out);
    if (this.proxy) drawnInstances(this.proxy.mesh, out);
    if (this.mid) drawnInstances(this.mid.mesh, out);
  }

  /** Draw calls this layer would issue (for tests and stats). */
  get drawables(): number {
    let n = 0;
    for (const b of this.batches.values()) n += (b.solid.mesh.visible ? 1 : 0) + (b.outline.lines.visible ? 1 : 0);
    return n + (this.decor?.mesh.visible ? 1 : 0) + (this.proxy?.mesh.visible ? 1 : 0) + (this.mid?.mesh.visible ? 1 : 0);
  }

  dispose(): void {
    for (const b of this.batches.values()) {
      b.solid.dispose();
      b.outline.dispose();
    }
    this.batches.clear();
    this.decor?.dispose();
    this.decor = null;
    this.proxy?.dispose(); // the box geometry is the kit's
    this.mid?.dispose();
    this.group.removeFromParent();
  }

  private rebuild(): void {
    // the mid band carries over by structure: a layout change elsewhere does not pop one inside the hysteresis gap
    const wasMid = this.mid ? new Set(this.parts.filter((_, i) => this.partMid[i] === 1).map((p) => p.structureId)) : null;
    this.parts.length = 0;
    this.tileOwner.clear();
    this.centroid.set(0, 0, 0);
    for (const s of this.structures) {
      const tiles = s.tiles.map(tileIndexOf);
      for (const t of tiles) this.tileOwner.set(t, s);
      const look = structureLook(s);
      footprintFrame(this.grid, tiles, this.frame);
      const center = new THREE.Vector3(this.frame.position.x, this.frame.position.y, this.frame.position.z);
      const width = this.frame.width;
      this.centroid.add(center); // once per structure, however many parts it has
      for (const part of partsFor(s.kind, modelLevel(s), this.skin)) {
        const local = partMatrix(partFrame(this.grid, tiles, part, this.frame), part, new THREE.Matrix4(), this.basis);
        this.parts.push({ structureId: s.id, model: part.model, tiles, look, local, inverse: local.clone().invert(), center, width });
        this.batch(part.model);
      }
    }
    if (this.centroid.lengthSq() > 1e-12) this.centroid.normalize();
    else this.centroid.set(0, 1, 0);
    this.partMid = new Uint8Array(this.parts.length);
    if (wasMid) this.parts.forEach((p, i) => (this.partMid[i] = wasMid.has(p.structureId) ? 1 : 0));
    this.bandCam.set(NaN, NaN, NaN); // new parts: the band is evaluated at the next update
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
    for (const p of this.parts) if (p.look.solid) counts.set(p.model, (counts.get(p.model) ?? 0) + 1);
    for (const [id, n] of counts) {
      const b = this.batches.get(id)!;
      b.solid.ensure(n);
      if (b.src.length < n) b.src = new Int32Array(Math.max(n, b.src.length * 2));
    }
    counts.clear();
    this.parts.forEach((p, k) => {
      if (!p.look.solid) return;
      const b = this.batches.get(p.model)!;
      const i = counts.get(p.model) ?? 0;
      this.m.copy(p.local);
      if (p.look.height < 1) this.m.multiply(SCALE_Y.makeScale(1, p.look.height, 1));
      b.solid.setMatrixAt(i, this.m);
      b.src[i] = k;
      counts.set(p.model, i + 1);
    });
    for (const [id, b] of this.batches) b.solid.commit(counts.get(id) ?? 0);
    this.writeMid();
    this.proxiesChanged();
  }

  /**
   * One mid-band box per solid part, in `parts` order: the same matrix and tone as its far proxy (`writeProxies`).
   * Every solid part is written, whatever its band: switching only changes the filter.
   */
  private writeMid(): void {
    const mid = this.mid;
    if (!mid) return;
    let n = 0;
    for (const p of this.parts) if (p.look.solid) n++;
    mid.ensure(n);
    if (this.midSrc.length < n) this.midSrc = new Int32Array(Math.max(n, this.midSrc.length * 2));
    let i = 0;
    this.parts.forEach((p, k) => {
      if (!p.look.solid) return;
      this.m.copy(p.local);
      if (p.look.height < 1) this.m.multiply(SCALE_Y.makeScale(1, p.look.height, 1));
      mid.setMatrixAt(i, this.m.multiply(boxMatrix(this.kit.box(p.model), this.fit)));
      mid.setColorAt(i, this.kit.tone(p.model));
      this.midSrc[i++] = k;
    });
    mid.commit(i);
  }

  /** The parts, rocks or models changed: the proxies follow now when they show, else when they next do. */
  private proxiesChanged(): void {
    this.proxyStale = true;
    if (this.proxyOn) this.writeProxies();
  }

  /**
   * One proxy box per solid part (its full matrix, growth in Y included, times the box of its model) and per
   * deposit rock, tinted with the model's tone, in `parts` order then the rocks.
   */
  private writeProxies(): void {
    const proxy = this.proxy;
    if (!proxy) return;
    let n = this.deposits.length;
    for (const p of this.parts) if (p.look.solid) n++;
    proxy.ensure(n);
    let i = 0;
    for (const p of this.parts) {
      if (!p.look.solid) continue;
      this.m.copy(p.local);
      if (p.look.height < 1) this.m.multiply(SCALE_Y.makeScale(1, p.look.height, 1));
      proxy.setMatrixAt(i, this.m.multiply(boxMatrix(this.kit.box(p.model), this.fit)));
      proxy.setColorAt(i++, this.kit.tone(p.model));
    }
    if (this.deposits.length) {
      boxMatrix(this.kit.box(DEPOSIT_MODEL), this.fit);
      const tone = this.kit.tone(DEPOSIT_MODEL);
      for (const d of this.deposits) {
        proxy.setMatrixAt(i, this.m.multiplyMatrices(d, this.fit));
        proxy.setColorAt(i++, tone);
      }
    }
    proxy.commit(i);
    this.proxyStale = false;
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
        solid: new InstancedBatch(this.group, this.kit.geometry(id), this.kit.material, `${this.grid.bodyId}_${id}`, 8, this.culler),
        outline: new LineBuffer(this.outlineMaterial, 256, false, `${this.grid.bodyId}_${id}_Sites`),
        src: new Int32Array(8),
      };
      const batch = b;
      // the mid band draws these parts as boxes instead
      if (this.mid) b.solid.setFilter((i) => this.partMid[batch.src[i]!] !== 1);
      this.group.add(b.outline.lines);
      this.batches.set(id, b);
      if (this.proxyOn) b.solid.park(true);
    }
    return b;
  }

  private rebuildDecor(): void {
    if (!this.showDecor) return;
    const tiles = this.grid.tiles.filter((t) => t.deposit && !this.tileOwner.has(t.index) && !this.exhausted.has(t.index));
    if (!this.decor) {
      this.decor = new InstancedBatch(this.group, this.kit.geometry(DEPOSIT_MODEL), this.kit.material, `${this.grid.bodyId}_Deposits`, Math.max(8, tiles.length), this.culler);
      if (this.proxyOn) this.decor.park(true);
    }
    this.decor.ensure(tiles.length);
    const spec = MODELS[DEPOSIT_MODEL];
    const width = this.grid.tileEdge * Math.sqrt(3);
    const s = fitScale(spec, width);
    const q = new THREE.Quaternion();
    const yaw = new THREE.Quaternion();
    const scale = new THREE.Vector3(s, s, s);
    // only kept for the proxies (LOD); without it the batch holds the matrices
    const keep = this.proxy !== null;
    this.deposits = keep ? tiles.map((_, i) => this.deposits[i] ?? new THREE.Matrix4()) : [];
    tiles.forEach((t, i) => {
      this.v.set(t.normal.x, t.normal.y, t.normal.z);
      q.setFromUnitVectors(UP, this.v).multiply(yaw.setFromAxisAngle(UP, ((t.index * 2654435761) >>> 0) % 628 / 100));
      this.m.compose(this.v.set(t.center.x, t.center.y, t.center.z), q, scale);
      this.decor!.setMatrixAt(i, this.m);
      if (keep) this.deposits[i]!.copy(this.m);
    });
    this.decor.commit(tiles.length);
    this.proxiesChanged();
  }
}
