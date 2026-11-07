import { BodyId, RoverId, ShipId } from '../shared/ids';
import { Vec3, vec3 } from './math/vec3';

export const TRAJECTORY_SAMPLES = 48;

/**
 * Mutable per-frame buffer of continuous values (positions, orientations, progress).
 * Written by game systems, read by the renderer. Never goes through Signals.
 */
export interface FrameSnapshot {
  time: number;
  /** Position of each body in its parent's frame — the renderer sets Group.position directly. */
  bodyLocalPos: Map<BodyId, Vec3>;
  /** World position of ships that are IN_TRANSIT. */
  shipWorldPos: Map<ShipId, Vec3>;
  /** Unit forward vector of ships IN_TRANSIT. */
  shipForward: Map<ShipId, Vec3>;
  /** Curve parameter 0..1 for ships IN_TRANSIT. */
  transitProgress: Map<ShipId, number>;
  /** Rover position in its body's local frame (surface point + lift). */
  roverLocalPos: Map<RoverId, Vec3>;
  /** Unit forward (tangent) of each rover, local frame. */
  roverForward: Map<RoverId, Vec3>;
  /** Trajectory of the ship being drawn (the selected one or the only one in transit). */
  trajectory: { shipId: ShipId; points: Vec3[] } | null;
  /** Preallocated point buffer for trajectory sampling. */
  trajectoryBuffer: Vec3[];
}

export function createSnapshot(bodyIds: Iterable<BodyId>): FrameSnapshot {
  const bodyLocalPos = new Map<BodyId, Vec3>();
  for (const id of bodyIds) bodyLocalPos.set(id, vec3());
  const trajectoryBuffer: Vec3[] = [];
  for (let i = 0; i < TRAJECTORY_SAMPLES; i++) trajectoryBuffer.push(vec3());
  return {
    time: 0,
    bodyLocalPos,
    shipWorldPos: new Map(),
    shipForward: new Map(),
    transitProgress: new Map(),
    roverLocalPos: new Map(),
    roverForward: new Map(),
    trajectory: null,
    trajectoryBuffer,
  };
}
