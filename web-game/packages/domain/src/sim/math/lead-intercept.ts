import { BodyId } from '../../shared/ids';
import { OrbitSolver } from './orbit-solver';
import { Vec3, distance, vec3 } from './vec3';

export interface LeadResult {
  leadPos: Vec3;
  flightTime: number;
  iterations: number;
}

export interface LeadOptions {
  maxIter?: number;
  eps?: number;
  /** Aim at the parking orbit instead of the docking point (the mothership). */
  orbit?: boolean;
}

/**
 * Fixed-point iteration for the intercept point of a moving target:
 *   Δt₀   = |target(t) − start| / v
 *   Δtₙ₊₁ = |target(t + Δtₙ) − start| / v
 * Converges when the target's linear speed is well below the cruise speed.
 */
export function solveLeadIntercept(
  start: Vec3,
  targetId: BodyId,
  t: number,
  cruiseSpeed: number,
  solver: OrbitSolver,
  opts: LeadOptions = {},
): LeadResult {
  const maxIter = opts.maxIter ?? 8;
  const eps = opts.eps ?? 1e-3;
  const leadPos = vec3();
  const target = (time: number) => solver.stationPosition(targetId, time, leadPos, opts.orbit === true);

  target(t);
  let dt = distance(start, leadPos) / cruiseSpeed;
  let iterations = 1;

  for (; iterations <= maxIter; iterations++) {
    target(t + dt);
    const next = distance(start, leadPos) / cruiseSpeed;
    const converged = Math.abs(next - dt) < eps;
    dt = next;
    if (converged) break;
  }

  target(t + dt);
  return { leadPos, flightTime: dt, iterations: Math.min(iterations, maxIter) };
}
