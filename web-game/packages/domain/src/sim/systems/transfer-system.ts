import { BodyId, ShipId } from '../../shared/ids';
import { GameConstants } from '../config/game-constants';
import { FrameSnapshot } from '../frame-snapshot';
import { BezierPath } from '../math/bezier-path';
import { solveLeadIntercept } from '../math/lead-intercept';
import { OrbitSolver } from '../math/orbit-solver';
import { Vec3, clone, copy, distance, vec3 } from '../math/vec3';
import { DomainEvent } from '../models/domain-event.model';
import { Spacecraft } from '../models/spacecraft.model';
import { TransferPlan, arrivalTime } from '../models/transfer.model';

interface ActiveTransfer {
  plan: TransferPlan;
  path: BezierPath;
  pos: Vec3;
  forward: Vec3;
}

/**
 * Plans transfers (fuel cost, lead intercept, Bézier arc) and moves ships in flight.
 *
 * Unified rule (TECH-1, W09): arrival time and the intercept point are fixed at the order. The PoC
 * re-aimed the curve every frame and advanced by speed × dt / length, so the flight time depended on
 * the frame rate; here the position is a pure function of (plan, t) and the ship arrives exactly at
 * `startTime + estimatedDuration`, whatever the step size.
 */
export class TransferSystem {
  private readonly active = new Map<ShipId, ActiveTransfer>();

  constructor(
    private readonly solver: OrbitSolver,
    private readonly cfg: GameConstants,
  ) {}

  /** Fuel for a hop between two stations at time t (docking points; parking orbits for the mothership). */
  fuelCost(from: BodyId, to: BodyId, t: number, mothership = false): number {
    const a = this.solver.stationPosition(from, t, vec3(), mothership);
    const b = this.solver.stationPosition(to, t, vec3(), mothership);
    return distance(a, b) * this.cfg.fuelRate;
  }

  /** Worst-case fuel to get from `from` back to `home`, independent of time. */
  returnReserve(from: BodyId, home: BodyId): number {
    return this.solver.maxDistanceBetween(from, home) * this.cfg.fuelRate;
  }

  /** Builds the plan and registers the flight. The ship must be docked at plan.fromBodyId. */
  plan(ship: Spacecraft, to: BodyId, t: number): TransferPlan {
    if (!ship.currentBodyId) throw new Error(`Ship ${ship.id} is not docked`);
    const from = ship.currentBodyId;
    // the mothership never lands on a pad: it flies between parking orbits (canvas, D33)
    const orbit = ship.role === 'MOTHERSHIP';
    const startPos = this.solver.stationPosition(from, t, vec3(), orbit);
    const lead = solveLeadIntercept(startPos, to, t, this.cfg.cruiseSpeed, this.solver, { orbit });
    const plan: TransferPlan = {
      shipId: ship.id,
      fromBodyId: from,
      toBodyId: to,
      startTime: t,
      startPos,
      leadPos: lead.leadPos,
      cruiseSpeed: this.cfg.cruiseSpeed,
      estimatedDuration: lead.flightTime,
      fuelCost: this.fuelCost(from, to, t, orbit),
    };
    this.register(plan);
    return plan;
  }

  /** Re-creates the in-flight state of a plan (after loading a saved game). */
  register(plan: TransferPlan): void {
    const path = BezierPath.arc(plan.startPos, plan.leadPos, this.cfg.arcLiftFactor);
    this.active.set(plan.shipId, { plan, path, pos: clone(plan.startPos), forward: vec3(0, 0, 1) });
  }

  isActive(shipId: ShipId): boolean {
    return this.active.has(shipId);
  }

  activePath(shipId: ShipId): BezierPath | null {
    return this.active.get(shipId)?.path ?? null;
  }

  /** Moves all flights to time t and writes positions into the snapshot. */
  update(ships: ReadonlyArray<Spacecraft>, t: number, _dt: number, snap: FrameSnapshot): DomainEvent[] {
    const events: DomainEvent[] = [];
    snap.shipWorldPos.clear();
    snap.shipForward.clear();
    snap.transitProgress.clear();

    for (const ship of ships) {
      if (ship.state !== 'IN_TRANSIT' || !ship.transfer) continue;
      if (!this.active.has(ship.id)) this.register(ship.transfer);
      const a = this.active.get(ship.id)!;
      const duration = Math.max(a.plan.estimatedDuration, 1e-9);
      const u = Math.max(0, Math.min(1, (t - a.plan.startTime) / duration));
      a.path.pointAt(u, a.pos);
      a.path.tangentAt(u, a.forward);
      snap.shipWorldPos.set(ship.id, a.pos);
      snap.shipForward.set(ship.id, a.forward);
      snap.transitProgress.set(ship.id, u);

      if (t >= arrivalTime(a.plan) - 1e-9) {
        this.active.delete(ship.id);
        events.push({ type: 'TRANSFER_ARRIVED', shipId: ship.id, bodyId: a.plan.toBodyId });
      }
    }
    return events;
  }

  /** Fills snap.trajectory for the given ship, or clears it. */
  writeTrajectory(shipId: ShipId | null, snap: FrameSnapshot): void {
    const a = shipId ? this.active.get(shipId) : undefined;
    if (!a) {
      snap.trajectory = null;
      return;
    }
    a.path.sample(snap.trajectoryBuffer);
    snap.trajectory = { shipId: a.plan.shipId, points: snap.trajectoryBuffer };
  }

  /** Current world position of a ship in flight, or null. */
  positionOf(shipId: ShipId, out: Vec3): Vec3 | null {
    const a = this.active.get(shipId);
    return a ? copy(out, a.pos) : null;
  }
}
