import { GAME_CONSTANTS } from '../config/game-constants';
import { ASTEROID_ID, INITIAL_BODIES, INITIAL_SHIPS, MOON_ID, PLANET_ID } from '../config/initial-world';
import { createSnapshot } from '../frame-snapshot';
import { OrbitSolver } from '../math/orbit-solver';
import { distance, vec3 } from '../math/vec3';
import { Spacecraft } from '../models/spacecraft.model';
import { TransferSystem } from './transfer-system';

describe('TransferSystem', () => {
  const solver = new OrbitSolver(INITIAL_BODIES);
  const makeSystem = () => new TransferSystem(solver, GAME_CONSTANTS);
  const ship = (): Spacecraft => ({ ...INITIAL_SHIPS[0] });

  it('charges fuel proportional to the distance between docking points', () => {
    const sys = makeSystem();
    const t = 7;
    const a = solver.dockingPosition(PLANET_ID, t, vec3());
    const b = solver.dockingPosition(MOON_ID, t, vec3());
    expect(sys.fuelCost(PLANET_ID, MOON_ID, t)).toBeCloseTo(distance(a, b) * GAME_CONSTANTS.fuelRate);
    // planet → moon is a short hop
    expect(sys.fuelCost(PLANET_ID, MOON_ID, t)).toBeLessThan(10);
  });

  it('return reserve bounds any real hop back home', () => {
    const sys = makeSystem();
    const reserve = sys.returnReserve(ASTEROID_ID, PLANET_ID);
    for (let t = 0; t < 600; t += 7.3) {
      expect(sys.fuelCost(ASTEROID_ID, PLANET_ID, t)).toBeLessThanOrEqual(reserve + 1e-9);
    }
  });

  it('a full tank always covers planet→asteroid plus the worst-case return', () => {
    const sys = makeSystem();
    const reserve = sys.returnReserve(ASTEROID_ID, PLANET_ID);
    for (let t = 0; t < 600; t += 11) {
      expect(sys.fuelCost(PLANET_ID, ASTEROID_ID, t) + reserve).toBeLessThanOrEqual(INITIAL_SHIPS[0].maxFuel);
    }
  });

  it('plans a transfer starting at the current docking point aimed at the lead position', () => {
    const sys = makeSystem();
    const t = 20;
    const plan = sys.plan(ship(), MOON_ID, t);
    expect(plan.fromBodyId).toBe(PLANET_ID);
    expect(plan.toBodyId).toBe(MOON_ID);
    expect(distance(plan.startPos, solver.dockingPosition(PLANET_ID, t, vec3()))).toBeLessThan(1e-9);
    const atArrival = solver.dockingPosition(MOON_ID, t + plan.estimatedDuration, vec3());
    expect(distance(plan.leadPos, atArrival)).toBeLessThan(1e-6);
    expect(sys.isActive(plan.shipId)).toBe(true);
  });

  it('flies the ship to the moving target and emits TRANSFER_ARRIVED near it', () => {
    const sys = makeSystem();
    const snap = createSnapshot(INITIAL_BODIES.map((b) => b.id));
    let t = 0;
    const plan = sys.plan(ship(), ASTEROID_ID, t);
    const inTransit: Spacecraft = { ...ship(), state: 'IN_TRANSIT', currentBodyId: null, transfer: plan };

    const dt = 1 / 60;
    let arrived = false;
    let lastPos = vec3();
    for (let i = 0; i < 60 * 60 && !arrived; i++) {
      t += dt;
      const events = sys.update([inTransit], t, dt, snap);
      const pos = snap.shipWorldPos.get(inTransit.id);
      if (pos) lastPos = { ...pos };
      arrived = events.some((e) => e.type === 'TRANSFER_ARRIVED');
    }
    expect(arrived).toBe(true);
    const centre = solver.worldPosition(ASTEROID_ID, t, vec3());
    const asteroid = solver.body(ASTEROID_ID);
    const dockingDistance = Math.max(asteroid.radius * GAME_CONSTANTS.captureRadiusFactor, solver.dockingAltitude(asteroid));
    expect(distance(lastPos, centre)).toBeLessThanOrEqual(dockingDistance + 2);
    // flight time is in the same ballpark as the plan's estimate
    expect(Math.abs(t - plan.estimatedDuration) / plan.estimatedDuration).toBeLessThan(0.25);
    expect(sys.isActive(inTransit.id)).toBe(false);
  });

  // W09 + TECH-1: the PoC advanced by speed × dt / length of a curve re-aimed every frame, so the
  // arrival time depended on the frame rate. Now it is fixed at the order.
  it('arrives at the planned time whatever the step size', () => {
    const arrival = (dt: number) => {
      const sys = makeSystem();
      const snap = createSnapshot(INITIAL_BODIES.map((b) => b.id));
      const plan = sys.plan(ship(), ASTEROID_ID, 0);
      const inTransit: Spacecraft = { ...ship(), state: 'IN_TRANSIT', currentBodyId: null, transfer: plan };
      for (let t = dt; t < 1000; t += dt) {
        if (sys.update([inTransit], t, dt, snap).some((e) => e.type === 'TRANSFER_ARRIVED')) return { t, plan };
      }
      throw new Error('no arrival');
    };
    const fine = arrival(1 / 60);
    const coarse = arrival(0.5);
    expect(fine.t).toBeGreaterThanOrEqual(fine.plan.estimatedDuration - 1e-9);
    expect(fine.t - fine.plan.estimatedDuration).toBeLessThan(1 / 60 + 1e-9);
    expect(coarse.t - coarse.plan.estimatedDuration).toBeLessThan(0.5 + 1e-9);
    expect(coarse.plan.estimatedDuration).toBeCloseTo(fine.plan.estimatedDuration, 9);
  });

  it('writes a trajectory for an active ship and clears it otherwise', () => {
    const sys = makeSystem();
    const snap = createSnapshot(INITIAL_BODIES.map((b) => b.id));
    const s = ship();
    sys.writeTrajectory(s.id, snap);
    expect(snap.trajectory).toBeNull();
    sys.plan(s, MOON_ID, 0);
    sys.writeTrajectory(s.id, snap);
    expect(snap.trajectory?.points.length).toBeGreaterThan(2);
  });
});
