import * as THREE from 'three';
import type { CelestialBody } from '@space-game/domain';
import type { ModelKit } from './model-kit';
import { BELT_MODELS, MODELS, type ModelId } from './model-registry';

/** Deterministic PRNG (mulberry32); the scene never uses Math.random. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface BeltRock {
  x: number;
  y: number;
  z: number;
  size: number;
  yaw: number;
  tilt: number;
  model: number;
}

/** Half-width of the belt annulus and its thickness, in body radii. */
export const BELT_HALF_WIDTH = 3;
export const BELT_HALF_HEIGHT = 0.5;

/**
 * Rocks of a BELT body: an annulus around the parent at `orbitRadius` ± BELT_HALF_WIDTH × radius,
 * seeded by the body id so it is the same on every run. Pure; tested.
 */
export function beltRocks(body: Pick<CelestialBody, 'id' | 'orbitRadius' | 'radius'>, count: number): BeltRock[] {
  let seed = 0;
  for (let i = 0; i < body.id.length; i++) seed = (Math.imul(seed, 31) + body.id.charCodeAt(i)) >>> 0;
  const rnd = mulberry32(seed || 1);
  const rocks: BeltRock[] = [];
  for (let i = 0; i < count; i++) {
    const a = rnd() * Math.PI * 2;
    // denser in the middle of the annulus
    const off = (rnd() + rnd() - 1) * BELT_HALF_WIDTH * body.radius;
    const r = body.orbitRadius + off;
    rocks.push({
      x: r * Math.cos(a),
      y: (rnd() * 2 - 1) * BELT_HALF_HEIGHT * body.radius,
      z: r * Math.sin(a),
      size: body.radius * (0.12 + rnd() * rnd() * 0.45),
      yaw: rnd() * Math.PI * 2,
      tilt: rnd() * Math.PI,
      model: rnd() < 0.5 ? 0 : 1,
    });
  }
  return rocks;
}

const ROCKS = 420;

/**
 * The belt as two InstancedMeshes (rock_A, rock_B) in the parent's frame, rotating with the belt's
 * angular velocity. No grid; picking is a ring test in the view.
 */
export class BeltView {
  readonly group = new THREE.Group();
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly rocks: BeltRock[];
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();

  constructor(
    readonly body: CelestialBody,
    private readonly kit: ModelKit,
  ) {
    this.group.name = `${body.name}_Belt`;
    this.rocks = beltRocks(body, ROCKS);
    BELT_MODELS.forEach((id, k) => {
      const n = this.rocks.filter((r) => r.model === k).length;
      const mesh = new THREE.InstancedMesh(kit.geometry(id), kit.material, Math.max(1, n));
      mesh.name = `${body.name}_${id}`;
      mesh.frustumCulled = false;
      this.meshes.push(mesh);
      this.group.add(mesh);
      this.fit(k, id);
    });
  }

  /** Inner and outer radius of the ring in the parent's frame. */
  get innerRadius(): number {
    return this.body.orbitRadius - BELT_HALF_WIDTH * this.body.radius;
  }

  get outerRadius(): number {
    return this.body.orbitRadius + BELT_HALF_WIDTH * this.body.radius;
  }

  /** Swaps in a loaded rock model. */
  useModel(id: ModelId): void {
    const k = BELT_MODELS.indexOf(id);
    if (k < 0) return;
    this.meshes[k]!.geometry = this.kit.geometry(id);
    this.fit(k, id);
  }

  /** Same direction and speed as the analytic orbit (x = r·cos(ωt+φ), z = r·sin(ωt+φ)). */
  update(t: number): void {
    this.group.rotation.y = -this.body.orbitSpeed * t;
  }

  dispose(): void {
    for (const m of this.meshes) m.dispose();
    this.group.removeFromParent();
  }

  private fit(k: number, id: ModelId): void {
    const mesh = this.meshes[k]!;
    const spec = MODELS[id];
    let i = 0;
    for (const r of this.rocks) {
      if (r.model !== k) continue;
      const sc = r.size / spec.footprint;
      this.p.set(r.x, r.y, r.z);
      this.q.setFromEuler(this.e.set(r.tilt, r.yaw, 0));
      this.s.set(sc, sc, sc);
      mesh.setMatrixAt(i++, this.m.compose(this.p, this.q, this.s));
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
  }
}
