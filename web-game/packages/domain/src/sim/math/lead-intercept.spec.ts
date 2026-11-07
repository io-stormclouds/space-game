import { bodyId } from '../../shared/ids';
import { GAME_CONSTANTS } from '../config/game-constants';
import { ASTEROID_ID, INITIAL_BODIES, MOON_ID, PLANET_ID } from '../config/initial-world';
import { CelestialBody } from '../models/celestial-body.model';
import { solveLeadIntercept } from './lead-intercept';
import { OrbitSolver } from './orbit-solver';
import { distance, vec3 } from './vec3';

describe('solveLeadIntercept', () => {
  const solver = new OrbitSolver(INITIAL_BODIES);
  const v = GAME_CONSTANTS.cruiseSpeed;

  it('reduces to distance / speed for a stationary target', () => {
    const still: CelestialBody = {
      id: bodyId('still'),
      name: 'Still',
      kind: 'ASTEROID',
      radius: 10,
      parentId: null,
      orbitRadius: 0,
      orbitSpeed: 0,
      initialAngle: 0,
      orbitalAltitudeFactor: 1,
      isHomeBase: false,
      color: 0,
    };
    const s = new OrbitSolver([still]);
    const start = vec3(300, 10, 400); // 500 units from the docking point (0,10,0)
    const r = solveLeadIntercept(start, still.id, 0, 100, s);
    expect(r.flightTime).toBeCloseTo(5, 9);
    expect(r.leadPos).toEqual({ x: 0, y: 10, z: 0 });
  });

  it('predicts where a moving target will be at arrival', () => {
    const t0 = 12;
    const start = solver.dockingPosition(PLANET_ID, t0, vec3());
    const r = solveLeadIntercept(start, ASTEROID_ID, t0, v, solver);
    const actualAtArrival = solver.dockingPosition(ASTEROID_ID, t0 + r.flightTime, vec3());
    expect(distance(r.leadPos, actualAtArrival)).toBeLessThan(1e-6);
    // and the ship covers exactly that distance in flightTime
    expect(distance(start, r.leadPos) / v).toBeCloseTo(r.flightTime, 3);
  });

  it('converges in a handful of iterations for the fastest body (moon)', () => {
    const t0 = 3;
    const start = solver.dockingPosition(ASTEROID_ID, t0, vec3());
    const r = solveLeadIntercept(start, MOON_ID, t0, v, solver);
    expect(r.iterations).toBeLessThanOrEqual(8);
    const actualAtArrival = solver.dockingPosition(MOON_ID, t0 + r.flightTime, vec3());
    expect(distance(r.leadPos, actualAtArrival)).toBeLessThan(1e-6);
  });
});
