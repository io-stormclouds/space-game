import * as THREE from 'three';
import { Tile } from '../game/models/planet-grid.model';
import { ModelAsset } from './model-library';
import { ModelSpec, baseLift, fitScale } from './model-registry';

const CAPACITY = 512;
const UP = new THREE.Vector3(0, 1, 0);
const Y = new THREE.Vector3(0, 1, 0);

/** One instance: where on the body it stands and how it is turned. */
interface Instance {
  /** Tiles this instance belongs to; building on any of them removes it. */
  tiles: ReadonlyArray<number>;
  /** Foot point on the body surface (body-local frame) and the surface normal there. */
  point: THREE.Vector3;
  normal: THREE.Vector3;
  /** Rotation about the normal, radians, in the frame `fromUnitVectors(UP, normal)`. */
  yaw: number;
  /** Multiplier on the fitted size (props). */
  scale: number;
  /** Connectors: world length to span; the piece is stretched along its `linkAxis`. */
  length?: number;
}

/**
 * Instances of one model on one body (a structure kind, a dressing model, deposit markers or a
 * connector), as a single InstancedMesh, child of the body's group. Starts as a plain box;
 * `useModel` swaps in the loaded geometry and re-fits every instance.
 */
export class StructureView {
  readonly mesh: THREE.InstancedMesh;
  private readonly instances: Instance[] = [];
  /** Authored size of the current geometry (1×1×1 for the placeholder box). */
  private readonly size = new THREE.Vector3(1, 1, 1);
  private hasModel = false;
  private readonly fallbackGeometry: THREE.BufferGeometry;
  private readonly fallbackMaterial: THREE.Material;
  private readonly m = new THREE.Matrix4();
  private readonly p = new THREE.Vector3();
  private readonly q = new THREE.Quaternion();
  private readonly qy = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();

  constructor(
    private readonly tileWidth: number,
    readonly spec: ModelSpec,
    color = 0xe2e8f0,
  ) {
    this.fallbackGeometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    this.fallbackMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.4, emissive: 0x1e293b });
    this.mesh = new THREE.InstancedMesh(this.fallbackGeometry, this.fallbackMaterial, CAPACITY);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.name = `Instances_${spec.file}`;
  }

  get count(): number {
    return this.mesh.count;
  }

  /** Swaps the box for the real model and re-fits all existing instances. */
  useModel(asset: ModelAsset): void {
    this.mesh.geometry = asset.geometry;
    this.mesh.material = asset.material;
    this.size.copy(asset.size);
    this.hasModel = true;
    this.rewrite();
  }

  /** Places an instance in the middle of the tile, standing on its normal (turned to the tile's corner if the spec asks). */
  add(tile: Tile): void {
    const normal = new THREE.Vector3(tile.normal.x, tile.normal.y, tile.normal.z);
    const yaw = this.spec.alignCorner === undefined ? 0 : tileCornerYaw(tile) - this.spec.alignCorner;
    this.push({ tiles: [tile.index], point: new THREE.Vector3(tile.center.x, tile.center.y, tile.center.z), normal, yaw, scale: 1 });
  }

  /** Small prop leaning towards a tile vertex: `radial` 0 = centre, 1 = at the vertex. */
  addProp(tile: Tile, corner: number, radial: number, yaw: number, scale: number): void {
    const c = tile.center;
    const v = tile.vertices[corner % tile.vertices.length];
    const r = Math.hypot(c.x, c.y, c.z);
    const point = new THREE.Vector3(c.x + (v.x - c.x) * radial, c.y + (v.y - c.y) * radial, c.z + (v.z - c.z) * radial).setLength(r);
    this.push({ tiles: [tile.index], point, normal: point.clone().normalize(), yaw, scale });
  }

  /** Connector between two neighbouring tiles, centred on their shared edge, `span` = fraction of the centre distance. */
  addLink(a: Tile, b: Tile, span: number): void {
    const ca = new THREE.Vector3(a.center.x, a.center.y, a.center.z);
    const cb = new THREE.Vector3(b.center.x, b.center.y, b.center.z);
    const point = ca.clone().add(cb).setLength(ca.length());
    const normal = point.clone().normalize();
    // direction a → b in the local frame of the midpoint
    this.q.setFromUnitVectors(UP, normal).invert();
    const d = cb.clone().sub(ca).applyQuaternion(this.q);
    const yaw = Math.atan2(d.x, d.z) - (this.spec.linkAxis === 'x' ? Math.PI / 2 : 0);
    this.push({ tiles: [a.index, b.index], point, normal, yaw, scale: 1, length: ca.distanceTo(cb) * span });
  }

  /** Removes every instance that belongs to the tile (by compacting the list). Returns how many went. */
  remove(tileIndex: number): number {
    const before = this.instances.length;
    for (let i = this.instances.length - 1; i >= 0; i--) if (this.instances[i].tiles.includes(tileIndex)) this.instances.splice(i, 1);
    const removed = before - this.instances.length;
    if (removed) this.rewrite();
    return removed;
  }

  dispose(): void {
    this.fallbackGeometry.dispose();
    this.fallbackMaterial.dispose();
    this.mesh.dispose();
  }

  private push(inst: Instance): void {
    if (this.instances.length >= CAPACITY) return;
    this.instances.push(inst);
    this.write(this.instances.length - 1);
    this.mesh.count = this.instances.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private rewrite(): void {
    for (let i = 0; i < this.instances.length; i++) this.write(i);
    this.mesh.count = this.instances.length;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private write(i: number): void {
    const inst = this.instances[i];
    let lift = 0;
    if (inst.length !== undefined) {
      // connector: width from the spec's fill, length stretched to span the gap
      const alongX = this.spec.linkAxis === 'x';
      const across = alongX ? this.size.z : this.size.x;
      const along = alongX ? this.size.x : this.size.z;
      const k = (this.tileWidth * this.spec.fill) / across;
      const stretch = inst.length / along;
      if (alongX) this.s.set(stretch, k, k);
      else this.s.set(k, k, stretch);
    } else {
      const k = (this.hasModel ? fitScale(this.spec, this.tileWidth) : this.tileWidth * 0.35) * inst.scale;
      this.s.setScalar(k);
      lift = this.hasModel ? baseLift(this.spec, k) : 0;
    }
    this.p.copy(inst.point).addScaledVector(inst.normal, lift);
    this.q.setFromUnitVectors(UP, inst.normal).multiply(this.qy.setFromAxisAngle(Y, inst.yaw));
    this.m.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(i, this.m);
  }
}

/**
 * Angle of the tile's vertex 0 around the normal, atan2(x, z) in the frame `fromUnitVectors(UP, n)`.
 * Turning a model by (this − its own corner angle) puts that model corner on the tile corner.
 */
export function tileCornerYaw(tile: Tile): number {
  const n = new THREE.Vector3(tile.normal.x, tile.normal.y, tile.normal.z);
  const inv = new THREE.Quaternion().setFromUnitVectors(UP, n).invert();
  const v = tile.vertices[0];
  const d = new THREE.Vector3(v.x - tile.center.x, v.y - tile.center.y, v.z - tile.center.z).applyQuaternion(inv);
  return Math.atan2(d.x, d.z);
}
