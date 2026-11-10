import * as THREE from 'three';
import { hash3, isKenneyModel, type DecorItem, type PlanetGrid, type TerrainPlan, type TileFrame } from '@space-game/domain';
import { drawnInstances } from './buffers';
import { CulledInstances, type HemisphereCuller } from './hemisphere-culler';
import { kitGeometry, type KitModel } from './hex-kit';
import { isRuinBuilding, objectTone, ruinTone } from './terrain-tones';

/** Tree model drawn for every tree in the LOD band (the cheapest of the three, 287 triangles). */
export const LOD_TREE = 'detail_treeA';
/** Share of the trees kept in the LOD band (by `hash3` of the tile, so the same trees stay). */
export const LOD_TREE_KEEP = 0.5;

export const isTree = (model: string): boolean => model.startsWith('detail_tree');

/** Lift of the Kenney models above the tile surface [tile widths]: keeps a crater floor out of the ground's depth. */
export const KENNEY_LIFT = 0.004;

/** Model → body scale of a decor item: `fill` of the tile width over the model's footprint, times `sm`. */
const scaleOf = (d: DecorItem, model: KitModel, tileWidth: number): number => ((tileWidth * d.fill) / Math.max(model.size.x, model.size.z)) * (d.sm ?? 1);

/**
 * Bends a flat-based model (model units, base on y = 0, centred on x/z) onto a sphere of radius `R` (body units)
 * for the scale `s` it is drawn at: every vertex drops by the sphere's sag at its distance from the axis, so the
 * base follows the curved tile instead of touching it only in the middle; then everything rises by `lift`
 * (body units). Every instance of a Kenney model on one body has the same `fill`, so one bent geometry fits all.
 */
export function bendToSphere(geometry: THREE.BufferGeometry, R: number, s: number, lift = 0): void {
  const p = geometry.getAttribute('position') as THREE.BufferAttribute;
  const Rm = R / s;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const r2 = Math.min(x * x + z * z, Rm * Rm);
    p.setY(i, p.getY(i) - (Rm - Math.sqrt(Rm * Rm - r2)) + lift / s);
  }
  p.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
}

/** One model's instances: the mesh draws the culled, compacted `set`. */
interface DecorMesh {
  id: string;
  mesh: THREE.InstancedMesh;
  set: CulledInstances;
  tree: boolean;
}

interface Slot {
  set: CulledInstances;
  index: number;
}

/**
 * Trees, rocks and the settlement as instanced meshes, one per model. Every instance stands on its tile,
 * turned to the tile frame. Colours come from `objectTone` with the plan's biome and ground (winter crowns in
 * ice, dry bushes olive, Kenney craters in the ground's tone); settlement buildings are ruins in faded tones
 * (`ruinTone`, T-23), trees, rocks, mountains, craters and crystals keep theirs. `setHidden(tiles)` hides
 * everything on the given tiles (a structure stands there) and restores it when a tile leaves the set (the
 * structure was demolished).
 *
 * T4: with the body's culler only instances in the camera's visible cap are drawn (`recull` each frame), and in
 * the LOD band (`setLod`, the scene decides by apparent radius) every tree is drawn as `LOD_TREE`, about half of
 * them (`LOD_TREE_KEEP`): one draw call for all trees instead of three. Hidden and culled instances are left
 * out of the instance buffers (not drawn at zero scale); `slotOf` maps a tile's instance to its slot.
 */
export class TerrainDecor {
  readonly group = new THREE.Group();
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private readonly byTile = new Map<number, Slot[]>();
  private readonly parts: DecorMesh[] = [];
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly hidden = new Set<number>();
  /** Every tree as `LOD_TREE` (null when the kit has no such model or the plan no trees). */
  private readonly lodMesh: THREE.InstancedMesh | null = null;
  private readonly lodSet: CulledInstances | null = null;
  private readonly lodKeep: Uint8Array = new Uint8Array(0);
  private readonly lodFilter = (i: number): boolean => this.lodKeep[i] === 1;
  private lod = false;
  private _triangles = 0;
  private _instances = 0;
  private _topRadius = 0;

  constructor(
    grid: PlanetGrid,
    plan: TerrainPlan,
    frames: ReadonlyArray<TileFrame>,
    kit: ReadonlyMap<string, KitModel>,
    /** Visible cap of the body (hemisphere culling); null = draw every instance. */
    private readonly culler: HemisphereCuller | null = null,
  ) {
    this.group.name = `${grid.bodyId}_TerrainDecor`;
    const tone = (mat: string): number => objectTone(mat, plan);
    const ruinObjectTone = (mat: string): number => ruinTone(objectTone(mat, plan));
    const tileWidth = grid.tileEdge * Math.sqrt(3);
    const R = grid.radius;
    const byModel = new Map<string, DecorItem[]>();
    for (const d of plan.decor) {
      const list = byModel.get(d.model) ?? [];
      list.push(d);
      byModel.set(d.model, list);
    }

    const basis = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const yawQ = new THREE.Quaternion();
    const pos = new THREE.Vector3();
    const sc = new THREE.Vector3();
    const X = new THREE.Vector3();
    const Y = new THREE.Vector3();
    const Z = new THREE.Vector3();
    const m = new THREE.Matrix4();
    /** Model → body matrix of a decor item drawn as `model`, turned by its yaw (`n`: its index among its model's). */
    const place = (d: DecorItem, n: number, model: KitModel, out: THREE.Matrix4): number => {
      const f = frames[d.tile]!;
      const s = scaleOf(d, model, tileWidth);
      X.set(f.x.x, f.x.y, f.x.z);
      Y.set(f.y.x, f.y.y, f.y.z);
      Z.set(f.z.x, f.z.y, f.z.z);
      basis.makeBasis(X, Y, Z);
      q.setFromRotationMatrix(basis);
      yawQ.setFromAxisAngle(Y, d.yaw ?? hash3(plan.seed, d.tile, 8, n) * Math.PI * 2);
      q.premultiply(yawQ);
      pos
        .set(f.center.x, f.center.y, f.center.z)
        .addScaledVector(X, (d.ox ?? 0) * tileWidth)
        .addScaledVector(Z, (d.oz ?? 0) * tileWidth)
        .normalize()
        .multiplyScalar(R - model.box.min.y * s);
      out.compose(pos, q, sc.setScalar(s));
      return s;
    };
    const slot = (tile: number, set: CulledInstances, index: number) => {
      const slots = this.byTile.get(tile) ?? [];
      slots.push({ set, index });
      this.byTile.set(tile, slots);
    };

    for (const [id, items] of byModel) {
      const model = kit.get(id);
      if (!model) continue;
      // settlement buildings are ruins: faded, so the player's own (full-tone) buildings stand out
      const geometry = kitGeometry(model, isRuinBuilding(id) ? ruinObjectTone : tone);
      // a flat Kenney crater as wide as the tile would float at its rim on the curved tile: bend it onto the sphere
      if (isKenneyModel(id)) bendToSphere(geometry, R, scaleOf(items[0]!, model, tileWidth), tileWidth * KENNEY_LIFT);
      const mesh = new THREE.InstancedMesh(geometry, this.material, items.length);
      mesh.name = `Decor_${id}`;
      mesh.frustumCulled = false; // instances span the whole sphere; the bounding sphere is the model's
      const set = new CulledInstances(items.length);
      items.forEach((d, n) => {
        const s = place(d, n, model, m);
        this._topRadius = Math.max(this._topRadius, R + model.size.y * s);
        set.set(n, m);
        slot(d.tile, set, n);
      });
      set.count = items.length;
      set.apply(mesh, null);
      this.group.add(mesh);
      this.meshes.push(mesh);
      this.parts.push({ id, mesh, set, tree: isTree(id) });
      this._triangles += model.triangles * items.length;
      this._instances += items.length;
    }

    // LOD band: every tree as the cheapest tree model, about half of them
    const lodModel = kit.get(LOD_TREE);
    const trees = lodModel ? [...byModel].filter(([id]) => isTree(id) && kit.has(id)) : [];
    const treeCount = trees.reduce((n, [, items]) => n + items.length, 0);
    if (lodModel && treeCount > 0) {
      const shared = this.parts.find((p) => p.id === LOD_TREE)?.mesh.geometry;
      const mesh = new THREE.InstancedMesh(shared ?? kitGeometry(lodModel, tone), this.material, treeCount);
      mesh.name = 'Decor_lod_trees';
      mesh.frustumCulled = false;
      mesh.visible = false;
      mesh.count = 0;
      const set = new CulledInstances(treeCount);
      const keep = new Uint8Array(treeCount);
      let k = 0;
      for (const [, items] of trees) {
        items.forEach((d, n) => {
          place(d, n, lodModel, m);
          set.set(k, m);
          keep[k] = hash3(plan.seed, d.tile, 23, n) < LOD_TREE_KEEP ? 1 : 0;
          slot(d.tile, set, k);
          k++;
        });
      }
      set.count = treeCount;
      this.group.add(mesh);
      this.lodMesh = mesh;
      this.lodSet = set;
      this.lodKeep = keep;
    }
  }

  /** Triangles of every instance at full detail. */
  get triangles(): number {
    return this._triangles;
  }

  get instances(): number {
    return this._instances;
  }

  /** Draw calls at full detail (one per model). */
  get drawCalls(): number {
    return this.meshes.length;
  }

  /** Whether the trees are drawn as the LOD band wants them. */
  get lodActive(): boolean {
    return this.lod;
  }

  /** Adds the triangles and instances drawn this frame (nothing while the group is hidden). */
  drawn(out: { triangles: number; instances: number }): void {
    if (!this.group.visible) return;
    for (const m of this.meshes) drawnInstances(m, out);
    if (this.lodMesh) drawnInstances(this.lodMesh, out);
  }

  /** Distance from the body centre to the top of the tallest decor model (the castle). */
  get topRadius(): number {
    return this._topRadius;
  }

  hasDecor(tile: number): boolean {
    return this.byTile.has(tile);
  }

  /** Instances of a model's mesh (`Decor_<id>`, or `lod` for the LOD trees): written, and drawn now. */
  instancesOf(id: string): { written: number; drawn: number } {
    const mesh = id === 'lod' ? this.lodMesh : (this.parts.find((p) => p.id === id)?.mesh ?? null);
    const set = id === 'lod' ? this.lodSet : (this.parts.find((p) => p.id === id)?.set ?? null);
    return { written: set?.count ?? 0, drawn: mesh?.visible ? mesh.count : 0 };
  }

  /**
   * Where each decor item on a tile is drawn now, by mesh name (its model's, or the LOD trees' in the band) and
   * slot in that mesh (-1 = hidden, culled or thinned out; tests, harness).
   */
  slotsOn(tile: number): Array<{ mesh: string; slot: number }> {
    const out: Array<{ mesh: string; slot: number }> = [];
    for (const s of this.byTile.get(tile) ?? []) {
      if (s.set === this.lodSet) {
        if (this.lod) out.push({ mesh: this.lodMesh!.name, slot: s.set.slotOf(s.index) });
        continue;
      }
      const p = this.parts.find((x) => x.set === s.set)!;
      if (!(this.lod && p.tree && this.lodMesh)) out.push({ mesh: p.mesh.name, slot: s.set.slotOf(s.index) });
    }
    return out;
  }

  /** Hides decor on exactly these tiles and shows it again everywhere else. Cheap when nothing changed. */
  setHidden(tiles: Iterable<number>): void {
    const next = new Set(tiles);
    let changed = false;
    for (const t of this.hidden) if (!next.has(t)) changed = this.set(t, false) || changed;
    for (const t of next) if (!this.hidden.has(t)) changed = this.set(t, true) || changed;
    if (changed) this.recull();
  }

  /** Trees as in the LOD band (`LOD_TREE`, thinned) or at full detail; re-culls when it changes. */
  setLod(on: boolean): void {
    if (on === this.lod || !this.lodMesh) return;
    this.lod = on;
    for (const p of this.parts) if (p.tree) p.set.invalidate();
    this.lodSet!.invalidate();
    this.recull();
  }

  /** Re-draws what the culler's cap, the hidden tiles and the LOD band let through (cheap when nothing moved). */
  recull(): void {
    for (const p of this.parts) {
      if (this.lod && p.tree) {
        p.mesh.count = 0;
        p.mesh.visible = false;
        continue;
      }
      p.set.cull(p.mesh, this.culler);
    }
    if (!this.lodMesh || !this.lodSet) return;
    if (this.lod) this.lodSet.cull(this.lodMesh, this.culler, this.lodFilter);
    else {
      this.lodMesh.count = 0;
      this.lodMesh.visible = false;
    }
  }

  dispose(): void {
    for (const m of this.meshes) m.geometry.dispose();
    if (this.lodMesh && !this.meshes.some((m) => m.geometry === this.lodMesh!.geometry)) this.lodMesh.geometry.dispose();
    this.material.dispose();
    this.group.clear();
  }

  private set(tile: number, hide: boolean): boolean {
    if (hide) this.hidden.add(tile);
    else this.hidden.delete(tile);
    const slots = this.byTile.get(tile);
    for (const s of slots ?? []) s.set.setHidden(s.index, hide);
    return !!slots;
  }
}
