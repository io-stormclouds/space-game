import * as THREE from 'three';
import { OrbitSolver, TAU_CETI_BODIES, TC_BELT, vec3 } from '@space-game/domain';
import { BELT_HALF_HEIGHT, BELT_HALF_WIDTH, beltRocks, mulberry32 } from './belt-view';
import { CameraRig, TRANSITION_SECONDS, shortestAngle, type CameraGoal } from './camera-rig';
import { pixelRadius, projectPoint, ringHit, writeBracket, writeDiamond, type ScreenPoint } from './screen-overlay';

describe('screen overlay helpers', () => {
  it('brackets: 8 segments, corners at ±half, arms pointing inwards', () => {
    const out: number[] = [];
    expect(writeBracket(out, 0, 100, 50, 20, 6)).toBe(32);
    const xs = new Set<number>();
    const ys = new Set<number>();
    for (let i = 0; i < 32; i += 4) {
      // every segment starts at a corner
      expect([80, 120]).toContain(out[i]);
      expect([30, 70]).toContain(out[i + 1]);
      xs.add(out[i + 2]!);
      ys.add(out[i + 3]!);
      expect(Math.hypot(out[i + 2]! - out[i]!, out[i + 3]! - out[i + 1]!)).toBeCloseTo(6, 9);
    }
    // arms end inside the square
    for (const x of xs) expect(x).toBeGreaterThanOrEqual(80);
    for (const x of xs) expect(x).toBeLessThanOrEqual(120);
    for (const y of ys) expect(y).toBeGreaterThanOrEqual(30);
  });

  it('diamonds: 4 closed segments of radius r', () => {
    const out: number[] = [];
    expect(writeDiamond(out, 0, 10, 10, 5)).toBe(16);
    expect(out.slice(0, 4)).toEqual([10, 5, 15, 10]);
    expect(out.slice(12, 16)).toEqual([5, 10, 10, 5]);
  });

  it('projects points and apparent sizes like the camera does', () => {
    const cam = new THREE.PerspectiveCamera(50, 2, 0.5, 1000);
    cam.position.set(0, 0, 100);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    const sp: ScreenPoint = { x: 0, y: 0, depth: 0, visible: false };
    projectPoint(new THREE.Vector3(0, 0, 0), cam, 800, 400, new THREE.Vector3(), sp);
    expect(sp).toMatchObject({ x: 400, y: 200, depth: 100, visible: true });
    projectPoint(new THREE.Vector3(0, 0, 200), cam, 800, 400, new THREE.Vector3(), sp);
    expect(sp.visible).toBe(false); // behind the camera
    // a sphere filling half the view height: r = d·tan(fov/2)/2
    const r = 100 * Math.tan((25 * Math.PI) / 180) * 0.5;
    expect(pixelRadius(r, 100, cam, 400)).toBeCloseTo(100, 6);
  });

  it('ring hit: inside the annulus only, in front of the ray', () => {
    const ray = new THREE.Ray(new THREE.Vector3(1000, 500, 0), new THREE.Vector3(0, -1, 0));
    const c = new THREE.Vector3();
    expect(ringHit(ray, c, 950, 1050)).toBeCloseTo(500, 9);
    expect(ringHit(ray, c, 1100, 1200)).toBeNull();
    expect(ringHit(new THREE.Ray(new THREE.Vector3(1000, 500, 0), new THREE.Vector3(0, 1, 0)), c, 950, 1050)).toBeNull();
    expect(ringHit(new THREE.Ray(new THREE.Vector3(1000, 0, 0), new THREE.Vector3(1, 0, 0)), c, 950, 1050)).toBeNull();
  });
});

describe('belt', () => {
  const belt = TAU_CETI_BODIES.find((b) => b.id === TC_BELT)!;

  it('rocks are deterministic and lie in the annulus around the orbit', () => {
    const a = beltRocks(belt, 300);
    expect(beltRocks(belt, 300)).toEqual(a);
    for (const r of a) {
      const d = Math.hypot(r.x, r.z);
      expect(d).toBeGreaterThanOrEqual(belt.orbitRadius - BELT_HALF_WIDTH * belt.radius - 1e-9);
      expect(d).toBeLessThanOrEqual(belt.orbitRadius + BELT_HALF_WIDTH * belt.radius + 1e-9);
      expect(Math.abs(r.y)).toBeLessThanOrEqual(BELT_HALF_HEIGHT * belt.radius);
      expect(r.size).toBeGreaterThan(0);
    }
    expect(new Set(a.map((r) => r.model))).toEqual(new Set([0, 1]));
    expect(mulberry32(1)()).toBe(mulberry32(1)());
  });

  it('the ring turns with the analytic orbit (rotation.y = −ωt)', () => {
    const solver = new OrbitSolver(TAU_CETI_BODIES);
    const t = 137;
    const at0 = solver.localPosition(belt.id, 0, vec3());
    const atT = solver.localPosition(belt.id, t, vec3());
    const g = new THREE.Group();
    g.rotation.y = -belt.orbitSpeed * t;
    g.updateMatrixWorld(true);
    const moved = new THREE.Vector3(at0.x, at0.y, at0.z).applyMatrix4(g.matrixWorld);
    expect(moved.x).toBeCloseTo(atT.x, 6);
    expect(moved.z).toBeCloseTo(atT.z, 6);
  });
});

describe('CameraRig (no DOM: OrbitControls skipped)', () => {
  const goal = (key: string, x: number, distance: number): CameraGoal => ({
    target: new THREE.Vector3(x, 0, 0),
    key,
    distance,
    phi: 1,
    theta: 0.5,
    minDistance: 1,
    maxDistance: 1e5,
  });

  it('wraps angles the short way', () => {
    expect(shortestAngle(0.1, 0.3)).toBeCloseTo(0.2, 9);
    expect(shortestAngle(3, -3)).toBeCloseTo(2 * Math.PI - 6, 9);
    expect(shortestAngle(-3, 3)).toBeCloseTo(6 - 2 * Math.PI, 9);
  });

  it('jumps on the first frame, then follows a moving target keeping the offset', () => {
    const rig = new CameraRig(null);
    rig.update(0.016, goal('planet:a', 900, 170));
    expect(rig.distance).toBeCloseTo(170, 6);
    const before = rig.camera.position.clone().sub(rig.target);
    rig.update(0.016, goal('planet:a', 950, 170));
    expect(rig.target.x).toBe(950);
    expect(rig.camera.position.clone().sub(rig.target).distanceTo(before)).toBeLessThan(1e-9);
  });

  it('switching mode flies to the other preset and back restores the player view', () => {
    const rig = new CameraRig(null);
    rig.update(0.016, goal('planet:a', 900, 170));
    rig.setMode('system');
    rig.update(0.016, goal('system', 0, 5000));
    expect(rig.transitioning).toBe(true);
    for (let t = 0; t < TRANSITION_SECONDS + 0.1; t += 0.05) rig.update(0.05, goal('system', 0, 5000));
    expect(rig.transitioning).toBe(false);
    expect(rig.distance).toBeCloseTo(5000, 3);
    expect(rig.target.x).toBe(0);
    rig.setMode('planet');
    for (let t = 0; t < TRANSITION_SECONDS + 0.2; t += 0.05) rig.update(0.05, goal('planet:a', 900, 170));
    expect(rig.distance).toBeCloseTo(170, 3);
    expect(rig.target.x).toBe(900);
  });

  it('refocusing on another body flies there with its default distance', () => {
    const rig = new CameraRig(null);
    rig.update(0.016, goal('planet:a', 900, 170));
    for (let t = 0; t < TRANSITION_SECONDS + 0.1; t += 0.05) rig.update(0.05, goal('planet:b', 1400, 50));
    expect(rig.distance).toBeCloseTo(50, 3);
    expect(rig.target.x).toBe(1400);
  });
});
