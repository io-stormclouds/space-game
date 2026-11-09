import * as THREE from 'three';
import { hash3, type DecorItem, type PlanetGrid, type TerrainPlan, type TileFrame } from '@space-game/domain';
import type { KitModel } from './hex-kit';
import { objectTone } from './terrain-tones';

interface Slot {
  mesh: THREE.InstancedMesh;
  index: number;
  matrix: THREE.Matrix4;
}

/**
 * Trees, rocks and the settlement as instanced meshes, one per model. Every instance stands on its tile,
 * turned to the tile frame. `setHidden(tiles)` hides everything on the given tiles (a structure stands
 * there) and restores it when a tile leaves the set (the structure was demolished).
 */
export class TerrainDecor {
  readonly group = new THREE.Group();
  private readonly material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  private readonly byTile = new Map<number, Slot[]>();
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly hidden = new Set<number>();
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private _triangles = 0;
  private _instances = 0;
  private _topRadius = 0;

  constructor(
    grid: PlanetGrid,
    plan: TerrainPlan,
    frames: ReadonlyArray<TileFrame>,
    kit: ReadonlyMap<string, KitModel>,
  ) {
    this.group.name = `${grid.bodyId}_TerrainDecor`;
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
    const tone = new THREE.Color();

    for (const [id, items] of byModel) {
      const model = kit.get(id);
      if (!model) continue;
      const positions: number[] = [];
      const colors: number[] = [];
      for (const part of model.parts) {
        tone.setHex(objectTone(part.mat));
        for (let i = 0; i < part.pos.length; i += 3) {
          positions.push(part.pos[i]!, part.pos[i + 1]!, part.pos[i + 2]!);
          colors.push(tone.r, tone.g, tone.b);
        }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(positions), 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(Float32Array.from(colors), 3));
      geometry.computeVertexNormals();
      geometry.computeBoundingSphere();

      const mesh = new THREE.InstancedMesh(geometry, this.material, items.length);
      mesh.name = `Decor_${id}`;
      mesh.frustumCulled = false; // instances span the whole sphere; the bounding sphere is the model's
      const footprint = Math.max(model.size.x, model.size.z);
      items.forEach((d, n) => {
        const f = frames[d.tile]!;
        const s = ((tileWidth * d.fill) / footprint) * (d.sm ?? 1);
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
        this._topRadius = Math.max(this._topRadius, R + model.size.y * s);
        const m = new THREE.Matrix4().compose(pos, q, sc.setScalar(s));
        mesh.setMatrixAt(n, m);
        const slots = this.byTile.get(d.tile) ?? [];
        slots.push({ mesh, index: n, matrix: m });
        this.byTile.set(d.tile, slots);
      });
      mesh.instanceMatrix.needsUpdate = true;
      this.group.add(mesh);
      this.meshes.push(mesh);
      this._triangles += model.triangles * items.length;
      this._instances += items.length;
    }
  }

  get triangles(): number {
    return this._triangles;
  }

  get instances(): number {
    return this._instances;
  }

  get drawCalls(): number {
    return this.meshes.length;
  }

  /** Distance from the body centre to the top of the tallest decor model (the castle). */
  get topRadius(): number {
    return this._topRadius;
  }

  hasDecor(tile: number): boolean {
    return this.byTile.has(tile);
  }

  /** Hides decor on exactly these tiles and shows it again everywhere else. Cheap when nothing changed. */
  setHidden(tiles: Iterable<number>): void {
    const next = new Set(tiles);
    for (const t of this.hidden) if (!next.has(t)) this.set(t, false);
    for (const t of next) if (!this.hidden.has(t)) this.set(t, true);
  }

  dispose(): void {
    for (const m of this.meshes) m.geometry.dispose();
    this.material.dispose();
    this.group.clear();
  }

  private set(tile: number, hide: boolean): void {
    if (hide) this.hidden.add(tile);
    else this.hidden.delete(tile);
    for (const s of this.byTile.get(tile) ?? []) {
      s.mesh.setMatrixAt(s.index, hide ? this.zero : s.matrix);
      s.mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
