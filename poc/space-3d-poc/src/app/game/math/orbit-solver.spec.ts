import { ASTEROID_ID, INITIAL_BODIES, MOON_ID, PLANET_ID, SUN_ID } from '../config/initial-world';
import { GAME_CONSTANTS } from '../config/game-constants';
import { OrbitSolver } from './orbit-solver';
import { add, distance, vec3 } from './vec3';

describe('OrbitSolver', () => {
  const solver = new OrbitSolver(INITIAL_BODIES);

  it('keeps the central body at the origin', () => {
    const p = solver.worldPosition(SUN_ID, 123.4, vec3());
    expect(p).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('places a body at orbitRadius from its parent', () => {
    const planet = solver.body(PLANET_ID);
    for (const t of [0, 17, 99.5, 1000]) {
      const p = solver.localPosition(PLANET_ID, t, vec3());
      expect(Math.hypot(p.x, p.z)).toBeCloseTo(planet.orbitRadius, 6);
      expect(p.y).toBe(0);
    }
  });

  it('composes world position along the parent chain (moon = planet + local)', () => {
    const t = 42;
    const planetWorld = solver.worldPosition(PLANET_ID, t, vec3());
    const moonLocal = solver.localPosition(MOON_ID, t, vec3());
    const expected = add(vec3(), planetWorld, moonLocal);
    const moonWorld = solver.worldPosition(MOON_ID, t, vec3());
    expect(distance(moonWorld, expected)).toBeLessThan(1e-9);
  });

  it('is periodic with period T = 2π/ω', () => {
    const planet = solver.body(PLANET_ID);
    const T = (2 * Math.PI) / planet.orbitSpeed;
    const a = solver.worldPosition(PLANET_ID, 10, vec3());
    const b = solver.worldPosition(PLANET_ID, 10 + T, vec3());
    expect(distance(a, b)).toBeLessThan(1e-6);
  });

  it('lifts the docking position along +Y by radius × altitude factor', () => {
    const asteroid = solver.body(ASTEROID_ID);
    const centre = solver.worldPosition(ASTEROID_ID, 5, vec3());
    const dock = solver.dockingPosition(ASTEROID_ID, 5, vec3());
    expect(dock.x).toBeCloseTo(centre.x);
    expect(dock.z).toBeCloseTo(centre.z);
    expect(dock.y - centre.y).toBeCloseTo(asteroid.radius * asteroid.orbitalAltitudeFactor);
  });

  it('bounds linear speed by Σ ω·r along the chain', () => {
    const planet = solver.body(PLANET_ID);
    const moon = solver.body(MOON_ID);
    expect(solver.maxLinearSpeed(MOON_ID)).toBeCloseTo(
      planet.orbitSpeed * planet.orbitRadius + moon.orbitSpeed * moon.orbitRadius,
    );
  });

  it('world configuration keeps every body slower than half the cruise speed (lead intercept converges)', () => {
    for (const b of INITIAL_BODIES) {
      expect(solver.maxLinearSpeed(b.id)).toBeLessThan(GAME_CONSTANTS.cruiseSpeed * 0.5);
    }
  });
});
