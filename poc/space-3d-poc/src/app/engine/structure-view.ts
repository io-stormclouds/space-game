import * as THREE from 'three';
import { Tile } from '../game/models/planet-grid.model';
import { ModelAsset } from './model-library';
import { ModelSpec, baseLift, fitScale } from './model-registry';

const CAPACITY = 512;
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Instances of one model kind on one body (structures of a kind, or deposit markers), as a single
 * InstancedMesh, child of the body's group. Starts as a plain box; `useModel` swaps in a loaded
 * KayKit geometry and re-fits every instance.
 */
export class StructureView {
  readonly mesh: THREE.InstancedMesh;
  private readonly tiles: Tile[] = [];
  private readonly scale = new THREE.Vector3();
  private lift = 0;
  private readonly fallbackGeometry: THREE.BufferGeometry;
  private readonly fallbackMaterial: THREE.Material;
  private readonly m = new THREE.Matrix4();
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly n = new THREE.Vector3();

  constructor(
    private readonly tileWidth: number,
    color = 0xe2e8f0,
  ) {
    const side = tileWidth * 0.35;
    this.scale.set(side, side, side);
    this.lift = side / 2;
    this.fallbackGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.fallbackMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.4, emissive: 0x1e293b });
    this.mesh = new THREE.InstancedMesh(this.fallbackGeometry, this.fallbackMaterial, CAPACITY);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'Instances';
  }

  get count(): number {
    return this.mesh.count;
  }

  /** Swaps the box for a real model and re-fits all existing instances to the tile width. */
  useModel(asset: ModelAsset, spec: ModelSpec): void {
    const s = fitScale(spec, this.tileWidth);
    this.scale.set(s, s, s);
    this.lift = baseLift(spec, s);
    this.mesh.geometry = asset.geometry;
    this.mesh.material = asset.material;
    this.tiles.forEach((t, i) => this.writeMatrix(i, t));
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Places an instance on the tile, standing on its outward normal. */
  add(tile: Tile): void {
    if (this.mesh.count >= CAPACITY) return;
    const i = this.mesh.count;
    this.tiles.push(tile);
    this.writeMatrix(i, tile);
    this.mesh.count = i + 1;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Removes the instance on a tile (if any) by compacting the list. */
  remove(tileIndex: number): void {
    const i = this.tiles.findIndex((t) => t.index === tileIndex);
    if (i < 0) return;
    this.tiles.splice(i, 1);
    this.tiles.forEach((t, k) => this.writeMatrix(k, t));
    this.mesh.count = this.tiles.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.fallbackGeometry.dispose();
    this.fallbackMaterial.dispose();
    this.mesh.dispose();
  }

  private writeMatrix(i: number, tile: Tile): void {
    this.n.set(tile.normal.x, tile.normal.y, tile.normal.z);
    this.p.set(tile.center.x, tile.center.y, tile.center.z).addScaledVector(this.n, this.lift);
    this.q.setFromUnitVectors(UP, this.n);
    this.m.compose(this.p, this.q, this.scale);
    this.mesh.setMatrixAt(i, this.m);
  }
}
