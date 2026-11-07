import { BodyId, ShipId } from '../../shared/ids';
import { GameConstants } from '../config/game-constants';
import { FrameSnapshot } from '../frame-snapshot';
import { BezierPath } from '../math/bezier-path';
import { solveLeadIntercept } from '../math/lead-intercept';
import { OrbitSolver } from '../math/orbit-solver';
import { Vec3, clone, copy, distance, vec3 } from '../math/vec3';
import { DomainEvent } from '../models/domain-event.model';
import { Spacecraft } from '../models/spacecraft.model';
import { TransferPlan } from '../models/transfer.model';

interface ActiveTransfer {
  plan: TransferPlan;
  path: BezierPath;
  progress: number;
  pos: Vec3;
  forward: Vec3;
}

/**
 * Plans transfers (fuel cost, lead intercept, Bézier arc) and advances ships in flight.
 * Continuous per-frame state lives here, not in the immutable game state.
 */
export class TransferSystem {
  private readonly active = new Map<ShipId, ActiveTransfer>();
  private readonly tmpTarget = vec3();
  private readonly tmpCentre = vec3();

  constructor(
    private readonly solver: OrbitSolver,
    private readonly cfg: GameConstants,
  ) {}

  /** Fuel for a hop between two docking points at time t. */
  fuelCost(from: BodyId, to: BodyId, t: number): number {
    const a = this.solver.dockingPosition(from, t, vec3());
    const b = this.solver.dockingPosition(to, t, vec3());
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
    const startPos = this.solver.dockingPosition(from, t, vec3());
    const lead = solveLeadIntercept(startPos, to, t, this.cfg.cruiseSpeed, this.solver);
    const plan: TransferPlan = {
      shipId: ship.id,
      fromBodyId: from,
      toBodyId: to,
      startTime: t,
      startPos,
      leadPos: lead.leadPos,
      cruiseSpeed: this.cfg.cruiseSpeed,
      estimatedDuration: lead.flightTime,
      fuelCost: this.fuelCost(from, to, t),
    };
    const path = BezierPath.arc(startPos, lead.leadPos, this.cfg.arcLiftFactor);
    this.active.set(ship.id, { plan, path, progress: 0, pos: clone(startPos), forward: vec3(0, 0, 1) });
    return plan;
  }

  isActive(shipId: ShipId): boolean {
    return this.active.has(shipId);
  }

  activePath(shipId: ShipId): BezierPath | null {
    return this.active.get(shipId)?.path ?? null;
  }

  /** Advances all registered flights by dt and writes positions into the snapshot. */
  update(ships: ReadonlyArray<Spacecraft>, t: number, dt: number, snap: FrameSnapshot): DomainEvent[] {
    const events: DomainEvent[] = [];
    snap.shipWorldPos.clear();
    snap.shipForward.clear();
    snap.transitProgress.clear();

    for (const ship of ships) {
      const a = this.active.get(ship.id);
      if (!a || ship.state !== 'IN_TRANSIT') continue;

      // Re-aim at where the target will be when we get there.
      const remaining = Math.max(0, a.plan.estimatedDuration * (1 - a.progress));
      this.solver.dockingPosition(a.plan.toBodyId, t + remaining, this.tmpTarget);
      a.path.setEnd(this.tmpTarget);
      a.path.relift(this.cfg.arcLiftFactor);

      const len = Math.max(a.path.approxLength(16), 1e-6);
      a.progress = Math.min(1, a.progress + (a.plan.cruiseSpeed * dt) / len);
      a.path.pointAt(a.progress, a.pos);
      a.path.tangentAt(a.progress, a.forward);

      snap.shipWorldPos.set(ship.id, a.pos);
      snap.shipForward.set(ship.id, a.forward);
      snap.transitProgress.set(ship.id, a.progress);

      const target = this.solver.body(a.plan.toBodyId);
      this.solver.worldPosition(target.id, t, this.tmpCentre);
      const captured = distance(a.pos, this.tmpCentre) <= target.radius * this.cfg.captureRadiusFactor;

      if (a.progress >= 1 || captured) {
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
