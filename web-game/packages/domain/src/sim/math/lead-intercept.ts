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

  solver.dockingPosition(targetId, t, leadPos);
  let dt = distance(start, leadPos) / cruiseSpeed;
  let iterations = 1;

  for (; iterations <= maxIter; iterations++) {
    solver.dockingPosition(targetId, t + dt, leadPos);
    const next = distance(start, leadPos) / cruiseSpeed;
    const converged = Math.abs(next - dt) < eps;
    dt = next;
    if (converged) break;
  }

  solver.dockingPosition(targetId, t + dt, leadPos);
  return { leadPos, flightTime: dt, iterations: Math.min(iterations, maxIter) };
}
