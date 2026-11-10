import * as THREE from 'three';
import { InstancedBatch } from './buffers';
import { CULL_TURN, CULL_ZOOM, CulledInstances, HemisphereCuller, OCCLUDER, instanceSlack } from './hemisphere-culler';

const R = 50;
const deg = Math.PI / 180;

/** Deterministic pseudo-random numbers in [0, 1). */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomDir(r: () => number, out = new THREE.Vector3()): THREE.Vector3 {
  const z = r() * 2 - 1;
  const a = r() * Math.PI * 2;
  const s = Math.sqrt(1 - z * z);
  return out.set(s * Math.cos(a), z, s * Math.sin(a));
}

/** Whether the segment camera → p misses the open ball of radius `R` (p can be seen past the body). */
function seen(camera: THREE.Vector3, p: THREE.Vector3, radius: number): boolean {
  const d = new THREE.Vector3().subVectors(p, camera);
  const len = d.length();
  d.divideScalar(len);
  const t = Math.max(0, Math.min(len, -camera.dot(d)));
  return new THREE.Vector3().copy(camera).addScaledVector(d, t).length() >= radius;
}

/** A model-to-body matrix: model +Y on the normal `n`, standing at radius `r`, scaled by `s`. */
function standing(n: THREE.Vector3, r: number, s: number): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
  return new THREE.Matrix4().compose(n.clone().multiplyScalar(r), q, new THREE.Vector3(s, s, s));
}

/** Unit box geometry standing on its base (y from 0 to 1), like the KayKit models. */
function standingBox(): THREE.BufferGeometry {
  return new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
}

describe('HemisphereCuller', () => {
  it('recomputes on the first update, after a turn beyond 2° or a zoom beyond 1° of horizon, not in between', () => {
    const c = new HemisphereCuller(R);
    expect(c.limit(0)).toBeLessThan(-1); // before any update: everything
    expect(c.update(new THREE.Vector3(0, 0, 3.4 * R))).toBe(true);
    expect(c.version).toBe(1);
    expect(c.horizon).toBeCloseTo(Math.acos(OCCLUDER / 3.4), 9);
    const at = (angle: number, d: number) => new THREE.Vector3(Math.sin(angle) * d, 0, Math.cos(angle) * d);
    expect(c.update(at(1.5 * deg, 3.4 * R))).toBe(false);
    expect(c.update(at(-1.5 * deg, 3.4 * R))).toBe(false); // measured from the last recompute, not the last frame
    expect(c.update(at(2.5 * deg, 3.4 * R))).toBe(true);
    expect(c.version).toBe(2);
    // a zoom: acos(R/d) moves with d
    const d2 = (OCCLUDER * R) / Math.cos(c.horizon + 0.5 * deg);
    expect(c.update(at(2.5 * deg, d2))).toBe(false);
    const d3 = (OCCLUDER * R) / Math.cos(c.horizon + 1.5 * deg);
    expect(c.update(at(2.5 * deg, d3))).toBe(true);
    // inside the occluder (never in the game; the camera keeps 1.3 R): everything again
    c.update(new THREE.Vector3(0, R * 0.5, 0));
    expect(c.limit(0)).toBeLessThan(-1);
  });

  it('never culls what the camera can see: random cameras and boxes on the surface, checked by rays past the body', () => {
    const r = rng(7);
    const c = new HemisphereCuller(R);
    const material = new THREE.MeshBasicMaterial();
    const N = 250;
    const local = new THREE.Vector3();
    const p = new THREE.Vector3();
    const m = new THREE.Matrix4();
    let culled = 0;
    let checked = 0;
    for (let k = 0; k < 30; k++) {
      // one model per round: a box from a flat pad to a tower of 16 % R, sunk a little into the ground
      const w = 0.2 + r() * 3;
      const h = 0.05 + r() * r() * 8;
      const geometry = new THREE.BoxGeometry(w, h, w * (0.3 + r())).translate(0, h / 2 - r() * 0.1 * h, 0);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      const mesh = new THREE.InstancedMesh(geometry, material, N);
      const set = new CulledInstances(N);
      for (let i = 0; i < N; i++) {
        const n = randomDir(r);
        // stands on the surface, turned about its normal and tilted up to 3° (parts off their frame's centre)
        const axis = randomDir(r).cross(n).normalize();
        const up = n.clone().applyAxisAngle(axis, r() * 3 * deg);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), r() * 7));
        set.set(i, new THREE.Matrix4().compose(n.multiplyScalar(R * (0.999 + r() * 0.004)), q, new THREE.Vector3(1, 1, 1)));
      }
      set.count = N;
      const cam = randomDir(r).multiplyScalar(R * (1.3 + r() * 30));
      c.update(cam);
      set.apply(mesh, c);
      // the camera may wander up to the recompute thresholds without a recompute (the worst case of the slack)
      const drift = cam.clone().applyAxisAngle(randomDir(r).cross(c.dir).normalize(), CULL_TURN * 0.99);
      const zoomed = (OCCLUDER * R) / Math.cos(Math.min(Math.PI / 2 - 1e-6, c.horizon + CULL_ZOOM * 0.99));
      const eyes = [cam, drift, drift.clone().setLength(Math.max(zoomed, R * 1.01))];
      for (let i = 0; i < N; i++) {
        if (set.slotOf(i) >= 0) continue;
        culled++;
        set.matrixAt(i, m);
        for (let j = 0; j < 30; j++) {
          local.set(box.min.x + r() * (box.max.x - box.min.x), box.min.y + r() * (box.max.y - box.min.y), box.min.z + r() * (box.max.z - box.min.z));
          p.copy(local).applyMatrix4(m);
          for (const eye of eyes) {
            checked++;
            expect(seen(eye, p, c.occluder), `round ${k} instance ${i}`).toBe(false);
          }
        }
      }
      expect(set.drawn).toBeGreaterThan(0);
    }
    expect(culled).toBeGreaterThan(2000);
    expect(checked).toBeGreaterThan(150000);
  });

  it('keeps the near cap: an instance on the surface where dot(n, c) > R/d is always drawn', () => {
    const r = rng(11);
    const c = new HemisphereCuller(R);
    const n = new THREE.Vector3();
    for (let k = 0; k < 20; k++) {
      const d = R * (1.3 + r() * 20);
      c.update(randomDir(r).multiplyScalar(d));
      for (let i = 0; i < 500; i++) {
        randomDir(r, n);
        if (n.dot(c.dir) <= R / d) continue;
        expect(n.dot(c.dir)).toBeGreaterThan(c.limit(instanceSlack(c.occluder, R * 1.001, 0.001)));
      }
    }
  });

  it('culls the far side: from 3.4 R over half of an even spread of small instances is left out', () => {
    const r = rng(3);
    const c = new HemisphereCuller(R);
    c.update(new THREE.Vector3(0, 0, 3.4 * R));
    let drawn = 0;
    const n = new THREE.Vector3();
    // a 1 % R building: top ≈ 1.01 R, about 0.6° wide
    const slack = instanceSlack(c.occluder, R * 1.01, 0.01);
    for (let i = 0; i < 4000; i++) if (randomDir(r, n).dot(c.dir) > c.limit(slack)) drawn++;
    // the cap of acos(R/d) ≈ 73° plus the top over the horizon (≈ 10°) and the recompute slack (3°): about 47 %
    expect(drawn / 4000).toBeGreaterThan(0.4);
    expect(drawn / 4000).toBeLessThan(0.5);
  });
});

describe('CulledInstances', () => {
  const mesh = (cap: number) => new THREE.InstancedMesh(standingBox(), new THREE.MeshBasicMaterial(), cap);

  it('compacts the visible, not hidden, kept instances to the front in source order and maps both ways', () => {
    const set = new CulledInstances(2);
    const dirs = [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0.2).normalize(), new THREE.Vector3(0, 1, 0.5).normalize(), new THREE.Vector3(0.1, 0, 1).normalize()];
    set.ensure(dirs.length); // grows from 2
    dirs.forEach((n, i) => set.set(i, standing(n, R, 0.5)));
    set.count = dirs.length;
    const m = mesh(dirs.length);
    const c = new HemisphereCuller(R);
    c.update(new THREE.Vector3(0, 0, 4 * R));
    set.apply(m, c);
    // 1 is on the far side; the others face the camera
    expect(m.count).toBe(4);
    expect([0, 1, 2, 3, 4].map((i) => set.slotOf(i))).toEqual([0, -1, 1, 2, 3]);
    expect([0, 1, 2, 3].map((s) => set.sourceOf(s))).toEqual([0, 2, 3, 4]);
    const got = new THREE.Matrix4();
    for (let i = 0; i < 5; i++) {
      const slot = set.slotOf(i);
      if (slot < 0) continue;
      m.getMatrixAt(slot, got);
      expect(got.elements).toEqual(Array.from(set.matrixAt(i, new THREE.Matrix4()).elements, (x) => Math.fround(x)));
    }
    set.setHidden(2, true);
    expect(set.isHidden(2)).toBe(true);
    set.apply(m, c, (i) => i !== 4);
    expect(m.count).toBe(2);
    expect(set.slotOf(3)).toBe(1);
    expect(set.slotOf(4)).toBe(-1);
    // nothing left: the mesh is hidden (no draw call)
    set.apply(m, c, () => false);
    expect(m.count).toBe(0);
    expect(m.visible).toBe(false);
    // without a culler everything not hidden is drawn
    set.apply(m, null);
    expect(m.count).toBe(4);
    expect(m.visible).toBe(true);
  });

  it('cull() rewrites only when the culler recomputed or the instances changed', () => {
    const set = new CulledInstances(4);
    for (let i = 0; i < 4; i++) set.set(i, standing(new THREE.Vector3(Math.cos(i), 0, Math.sin(i)), R, 1));
    set.count = 4;
    const m = mesh(4);
    const c = new HemisphereCuller(R);
    c.update(new THREE.Vector3(0, 0, 3 * R));
    set.cull(m, c);
    const version = m.instanceMatrix.version;
    set.cull(m, c);
    expect(m.instanceMatrix.version).toBe(version);
    c.update(new THREE.Vector3(3 * R, 0, 0));
    set.cull(m, c);
    expect(m.instanceMatrix.version).toBe(version + 1);
    set.set(0, standing(new THREE.Vector3(1, 0, 0), R, 1));
    set.cull(m, c);
    expect(m.instanceMatrix.version).toBe(version + 2);
  });

  it('uses the mesh geometry as the extent: a tall model is drawn further past the horizon than a flat one', () => {
    const c = new HemisphereCuller(R);
    const cam = new THREE.Vector3(0, 0, 3.4 * R);
    c.update(cam);
    // 20° past the horizon, and straight behind
    const past = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), c.horizon + 20 * deg);
    const set = new CulledInstances(2);
    set.set(0, standing(past, R, 0.1));
    set.set(1, standing(new THREE.Vector3(0, 0, -1), R, 0.1));
    set.count = 2;
    const flat = mesh(2);
    set.apply(flat, c); // huts 0.1 high
    expect(flat.count).toBe(0);
    const tower = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 40, 1).translate(0, 20, 0), new THREE.MeshBasicMaterial(), 2);
    set.apply(tower, c); // the same instances as 4-unit towers: the top clears the horizon
    expect(tower.count).toBe(1);
    expect(set.slotOf(0)).toBe(0);
    // and it really does: the tower's top is in sight past the body itself
    expect(seen(cam, past.clone().multiplyScalar(R + 4), R)).toBe(true);
  });
});

describe('InstancedBatch with a culler', () => {
  it('takes source indices, draws the visible cap, re-culls when the camera turns, keeps it all when it grows', () => {
    const parent = new THREE.Group();
    const c = new HemisphereCuller(R);
    const b = new InstancedBatch(parent, standingBox(), new THREE.MeshBasicMaterial(), 'Test', 2, c);
    const front = new THREE.Vector3(0, 0, 1);
    const back = new THREE.Vector3(0, 0, -1);
    b.setMatrixAt(0, standing(front, R, 1));
    b.setMatrixAt(1, standing(back, R, 1));
    b.commit(2);
    expect(b.count).toBe(2);
    expect(b.drawn).toBe(2); // the culler has not seen the camera yet
    c.update(new THREE.Vector3(0, 0, 3 * R));
    b.recull();
    expect(b.count).toBe(2);
    expect(b.drawn).toBe(1);
    expect(b.slotOf(0)).toBe(0);
    expect(b.slotOf(1)).toBe(-1);
    c.update(new THREE.Vector3(0, 0, -3 * R));
    b.recull();
    expect(b.drawn).toBe(1);
    expect(b.slotOf(1)).toBe(0);
    // grow past the capacity: a new mesh, the source instances kept
    b.ensure(5);
    for (let i = 2; i < 5; i++) b.setMatrixAt(i, standing(back, R, 1));
    b.commit(5);
    expect(b.mesh.parent).toBe(parent);
    expect(parent.children).toHaveLength(1);
    expect(b.drawn).toBe(4);
    expect(b.slotOf(0)).toBe(-1);
    // all culled: no draw call
    c.update(new THREE.Vector3(3 * R, 0, 0.01));
    b.setMatrixAt(0, standing(new THREE.Vector3(-1, 0, 0), R, 1));
    for (let i = 1; i < 5; i++) b.setMatrixAt(i, standing(new THREE.Vector3(-1, 0, 0), R, 1));
    b.commit(5);
    expect(b.drawn).toBe(0);
    expect(b.mesh.visible).toBe(false);
    b.dispose();
  });

  it('instance colours (T4b proxies) travel with their matrices through the compaction and a growth', () => {
    const parent = new THREE.Group();
    const c = new HemisphereCuller(R);
    const b = new InstancedBatch(parent, standingBox(), new THREE.MeshBasicMaterial(), 'Tinted', 2, c, true);
    expect(b.mesh.instanceColor).not.toBeNull(); // from the start: one shader variant
    const dirs = [new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0.2, 0, 1).normalize()];
    const colors = [new THREE.Color(1, 0, 0), new THREE.Color(0, 1, 0), new THREE.Color(0, 0, 1)];
    b.ensure(3);
    dirs.forEach((n, i) => {
      b.setMatrixAt(i, standing(n, R, 1));
      b.setColorAt(i, colors[i]!);
    });
    c.update(new THREE.Vector3(0, 0, 3 * R));
    b.commit(3);
    expect(b.drawn).toBe(2); // 0 is behind
    for (const i of [1, 2]) expect(b.mesh.getColorAt(b.slotOf(i), new THREE.Color()).equals(colors[i]!)).toBe(true);
    c.update(new THREE.Vector3(0, 0, -3 * R));
    b.recull();
    expect(b.slotOf(0)).toBe(0);
    expect(b.mesh.getColorAt(0, new THREE.Color()).equals(colors[0]!)).toBe(true);
    b.dispose();
  });

  it('park (T4b): draws nothing and keeps the instances; commits while parked wait; unparking draws what is written', () => {
    const c = new HemisphereCuller(R);
    const b = new InstancedBatch(new THREE.Group(), standingBox(), new THREE.MeshBasicMaterial(), 'Culled', 2, c);
    b.setMatrixAt(0, standing(new THREE.Vector3(0, 0, 1), R, 1));
    b.setMatrixAt(1, standing(new THREE.Vector3(0, 0, -1), R, 1));
    c.update(new THREE.Vector3(0, 0, 3 * R));
    b.commit(2);
    expect(b.drawn).toBe(1);
    b.park(true);
    expect(b.isParked).toBe(true);
    expect(b.drawn).toBe(0);
    expect(b.mesh.visible).toBe(false);
    expect(b.slotOf(0)).toBe(-1);
    expect(b.count).toBe(2);
    c.update(new THREE.Vector3(0, 0, -3 * R));
    b.recull(); // parked: stays empty
    expect(b.drawn).toBe(0);
    b.ensure(3);
    b.setMatrixAt(2, standing(new THREE.Vector3(0.1, 0, -1).normalize(), R, 1));
    b.commit(3);
    expect(b.drawn).toBe(0);
    b.park(false); // the camera is behind now: 1 and 2
    expect(b.drawn).toBe(2);
    expect([0, 1, 2].map((i) => b.slotOf(i))).toEqual([-1, 0, 1]);
    b.dispose();

    // without a culler the mesh holds the instances: parking and a growth while parked keep them
    const p = new InstancedBatch(new THREE.Group(), standingBox(), new THREE.MeshBasicMaterial(), 'Plain', 2);
    const m = [0, 1].map((i) => standing(new THREE.Vector3(i, 1, 0).normalize(), R, 1));
    m.forEach((x, i) => p.setMatrixAt(i, x));
    p.commit(2);
    p.park(true);
    expect(p.drawn).toBe(0);
    expect(p.count).toBe(2);
    p.ensure(9);
    p.park(false);
    expect(p.drawn).toBe(2);
    for (const i of [0, 1]) expect(p.mesh.getMatrixAt(i, new THREE.Matrix4()).elements).toEqual(Array.from(m[i]!.elements, (x) => Math.fround(x)));
    p.dispose();
  });

  it('without a culler behaves as before: indices are slots, every instance drawn', () => {
    const b = new InstancedBatch(new THREE.Group(), standingBox(), new THREE.MeshBasicMaterial(), 'Plain', 2);
    b.setMatrixAt(0, standing(new THREE.Vector3(0, 0, -1), R, 1));
    b.commit(1);
    expect(b.count).toBe(1);
    expect(b.drawn).toBe(1);
    expect(b.slotOf(0)).toBe(0);
    b.recull(); // no-op
    expect(b.drawn).toBe(1);
    b.dispose();
  });
});
