import {
  BezierPath,
  GAME_CONSTANTS,
  INITIAL_BODIES,
  MOON_ID,
  OrbitSolver,
  PLANET_ID,
  ASTEROID_ID,
  TAU_CETI_BODIES,
  TAU_CETI_ID,
  TC_BELT,
  TC_B,
  TC_C,
  TC_D,
  TC_E,
  TC_F,
  type BodyId,
  type TransferPlan,
  type Vec3,
} from '@space-game/domain';
import { VIEW_SCALE, WORLD_SCALE, SceneMap, beltRockScale, childScale, sceneExtent, sizeScale } from './view-scale';
import { systemExtent } from './placement';

const v = (): Vec3 => ({ x: 0, y: 0, z: 0 });
const dist = (a: Vec3, b: Vec3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });

/** A flight plan from `from` to `to` like the simulation's: from its docking point at t0 to the target's at t1. */
function plan(solver: OrbitSolver, from: BodyId, to: BodyId, t0: number, duration: number): TransferPlan {
  const dock = (id: BodyId, t: number) => solver.dockingPosition(id, t, v());
  return {
    shipId: 'ship-1' as TransferPlan['shipId'],
    fromBodyId: from,
    toBodyId: to,
    startTime: t0,
    startPos: dock(from, t0),
    leadPos: dock(to, t0 + duration),
    cruiseSpeed: GAME_CONSTANTS.cruiseSpeed,
    estimatedDuration: duration,
    fuelCost: 0,
  };
}

describe('view scale (spread-out system, render only)', () => {
  it('scales bodies by kind and the offsets by the parent: the star spreads its children, a planet keeps its moons', () => {
    expect(sizeScale({ kind: 'STAR' }, VIEW_SCALE)).toBe(VIEW_SCALE.star);
    expect(sizeScale({ kind: 'PLANET' }, VIEW_SCALE)).toBe(VIEW_SCALE.body);
    expect(sizeScale({ kind: 'MOON' }, VIEW_SCALE)).toBe(VIEW_SCALE.body);
    expect(sizeScale({ kind: 'BELT' }, VIEW_SCALE)).toBe(VIEW_SCALE.orbit);
    expect(childScale({ kind: 'STAR' }, VIEW_SCALE)).toBe(VIEW_SCALE.orbit);
    expect(childScale({ kind: 'PLANET' }, VIEW_SCALE)).toBe(VIEW_SCALE.body);
    expect(beltRockScale(VIEW_SCALE)).toBeGreaterThan(VIEW_SCALE.body);
    expect(beltRockScale(VIEW_SCALE)).toBeLessThan(VIEW_SCALE.orbit);
    // the star stays the largest body
    const star = TAU_CETI_BODIES.find((b) => b.id === TAU_CETI_ID)!;
    const largest = Math.max(...TAU_CETI_BODIES.filter((b) => b.kind === 'PLANET').map((b) => b.radius));
    expect(star.radius * VIEW_SCALE.star).toBeGreaterThan(2 * largest * VIEW_SCALE.body);
  });

  it('the extent holds every scaled orbit; world units give the old extent', () => {
    expect(sceneExtent(TAU_CETI_BODIES, WORLD_SCALE)).toBeCloseTo(systemExtent(TAU_CETI_BODIES), 6);
    expect(sceneExtent(INITIAL_BODIES, WORLD_SCALE)).toBeCloseTo(systemExtent(INITIAL_BODIES), 6);
    const belt = TAU_CETI_BODIES.find((b) => b.id === TC_BELT)!;
    expect(sceneExtent(TAU_CETI_BODIES, VIEW_SCALE)).toBeCloseTo(belt.orbitRadius * VIEW_SCALE.orbit + belt.radius * VIEW_SCALE.orbit * 3, 6);
  });

  it('body centres: planets × orbit around the star, the moon × body around its planet', () => {
    const solver = new OrbitSolver(INITIAL_BODIES);
    const map = new SceneMap(INITIAL_BODIES, solver, VIEW_SCALE);
    const t = 17.3;
    const planet = solver.localPosition(PLANET_ID, t, v());
    const moon = solver.localPosition(MOON_ID, t, v());
    const at = map.bodyAt(MOON_ID, t, v());
    expect(at.x).toBeCloseTo(planet.x * VIEW_SCALE.orbit + moon.x * VIEW_SCALE.body, 9);
    expect(at.z).toBeCloseTo(planet.z * VIEW_SCALE.orbit + moon.z * VIEW_SCALE.body, 9);
    expect(map.commonFrame(PLANET_ID, MOON_ID)).toBe(PLANET_ID);
    expect(map.commonFrame(MOON_ID, ASTEROID_ID)).toBe(INITIAL_BODIES[0]!.id);
    // in world units the map is the solver
    const plain = new SceneMap(INITIAL_BODIES, solver, WORLD_SCALE);
    expect(dist(plain.bodyAt(MOON_ID, t, v()), solver.worldPosition(MOON_ID, t, v()))).toBeLessThan(1e-9);
  });

  it('a flight starts at the docked point and ends at the docking point at arrival, for every kind of trip', () => {
    for (const bodies of [INITIAL_BODIES, TAU_CETI_BODIES]) {
      const solver = new OrbitSolver(bodies);
      const map = new SceneMap(bodies, solver, VIEW_SCALE);
      const trips: Array<[BodyId, BodyId]> =
        bodies === INITIAL_BODIES
          ? [[PLANET_ID, MOON_ID], [MOON_ID, PLANET_ID], [PLANET_ID, ASTEROID_ID], [MOON_ID, ASTEROID_ID]]
          : [[TAU_CETI_ID, TC_E], [TC_E, TC_F], [TC_B, TC_D]];
      for (const [from, to] of trips) {
        const p = plan(solver, from, to, 12, 9);
        const path = BezierPath.arc(p.startPos, p.leadPos, GAME_CONSTANTS.arcLiftFactor);
        const f = map.flight(p)!;
        const start = map.pointNear(p.startPos, from, p.startTime, v());
        const end = map.pointNear(p.leadPos, to, p.startTime + p.estimatedDuration, v());
        const tol = 1e-9 * (1 + Math.hypot(start.x, start.y, start.z));
        expect(dist(f.at(path, 0, v()), start), `${from}→${to} start`).toBeLessThan(tol);
        expect(dist(f.at(path, 1, v()), end), `${from}→${to} end`).toBeLessThan(tol);
        // docked = centre + offset × the body's scale (what the units layer draws)
        const off = (id: BodyId, t: number, q: Vec3) => {
          const w = solver.worldPosition(id, t, v());
          const k = map.size(id);
          return add(map.bodyAt(id, t, v()), { x: (q.x - w.x) * k, y: (q.y - w.y) * k, z: (q.z - w.z) * k });
        };
        expect(dist(off(from, p.startTime, p.startPos), start)).toBeLessThan(tol);
        // smooth: consecutive samples never jump by more than a few times the mean step
        const pts = Array.from({ length: 49 }, (_, i) => f.at(path, i / 48, v()));
        const steps = pts.slice(1).map((q, i) => dist(q, pts[i]!));
        const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
        expect(Math.max(...steps), `${from}→${to} smooth`).toBeLessThan(mean * 3);
      }
    }
  });

  it('a flight to a moon stays in the planet frame: the curve is the world curve × body around the planet', () => {
    const solver = new OrbitSolver(INITIAL_BODIES);
    const map = new SceneMap(INITIAL_BODIES, solver, VIEW_SCALE);
    const p = plan(solver, PLANET_ID, MOON_ID, 3, 2);
    const path = BezierPath.arc(p.startPos, p.leadPos, GAME_CONSTANTS.arcLiftFactor);
    const f = map.flight(p)!;
    for (const u of [0.25, 0.5, 0.75]) {
      const w = path.pointAt(u, v());
      const expected = map.pointIn(w, PLANET_ID, p.startTime + u * p.estimatedDuration, v());
      expect(dist(f.at(path, u, v()), expected)).toBeLessThan(1e-6);
    }
  });

  it('Tau Ceti neighbours: 7–19 planet diameters apart; a neighbour passing closest stays near or under the terrain threshold', () => {
    const planets = [TC_B, TC_C, TC_D, TC_E, TC_F].map((id) => TAU_CETI_BODIES.find((b) => b.id === id)!);
    const gaps = planets.slice(1).map((b, i) => (b.orbitRadius - planets[i]!.orbitRadius) * VIEW_SCALE.orbit);
    const diameter = (b: (typeof planets)[number]) => 2 * b.radius * VIEW_SCALE.body;
    planets.slice(1).forEach((b, i) => {
      const a = planets[i]!;
      const ratio = gaps[i]! / Math.max(diameter(a), diameter(b));
      expect(ratio, `${a.id}–${b.id}`).toBeGreaterThanOrEqual(6.9); // d–e: 1380 / 200
      // before: 1–2.5 diameters
      expect((b.orbitRadius - a.orbitRadius) / (2 * Math.max(a.radius, b.radius))).toBeLessThan(2.6);
    });
    // worst case: the camera at the default 3.4 R of one planet, on the line to its neighbour at closest approach, 1080p
    const px = (r: number, d: number) => (r / d) * (540 / Math.tan((25 * Math.PI) / 180));
    let worst = 0;
    planets.slice(1).forEach((b, i) => {
      const a = planets[i]!;
      for (const [me, other] of [[a, b], [b, a]] as const) {
        const d = gaps[i]! - 3.4 * me.radius * VIEW_SCALE.body;
        worst = Math.max(worst, px(other.radius * VIEW_SCALE.body, d));
      }
    });
    expect(worst).toBeLessThan(110); // tc-e seen from tc-d; was ~600 px in world units
    expect(worst).toBeGreaterThan(80);
  });
});
