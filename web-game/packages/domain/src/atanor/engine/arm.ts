// Ported from poc/space-atanor/src/core/engine/arm.ts.
// Additions (AT5): multi-gripper arms (Fabryka atanorowa L4, §8.1) — gripper positions, held atoms
// per gripper, cost of extra grippers.
import { HexCoord, hexAdd, hexDirection, hexScale } from '../grid/hex';
import { ArmState } from './types';

/** Allowed gripper counts: evenly spaced every 360° / n on the 6 hex directions. */
export const GRIPPER_COUNTS: readonly number[] = [1, 2, 3, 6];

/** PoC cost points of each gripper beyond the first (proposal, see README). */
export const EXTRA_GRIPPER_COST = 10;

/** Number of grippers (1 when `grippers` is missing or not one of 1, 2, 3, 6). */
export function gripperCount(arm: Pick<ArmState, 'grippers'>): number {
  const n = arm.grippers ?? 1;
  return GRIPPER_COUNTS.includes(n) ? n : 1;
}

/** Direction index (0..5) of each gripper; index 0 is the main gripper at `rotation`. */
export function gripperRotations(arm: Pick<ArmState, 'rotation' | 'grippers'>): number[] {
  const n = gripperCount(arm);
  const spacing = 6 / n;
  return Array.from({ length: n }, (_, i) => (((arm.rotation + i * spacing) % 6) + 6) % 6);
}

/** Position of the main gripper (index 0). */
export function getGripperPosition(arm: ArmState): HexCoord {
  const dir = hexDirection(arm.rotation);
  const offset = hexScale(dir, arm.length);
  return hexAdd(arm.basePos, offset);
}

/** Positions of all grippers, in gripper order. */
export function getGripperPositions(arm: ArmState): HexCoord[] {
  return gripperRotations(arm).map(rot => hexAdd(arm.basePos, hexScale(hexDirection(rot), arm.length)));
}

/** Atom held by each gripper (null = empty), in gripper order. */
export function getHeldAtomIds(arm: ArmState): (string | null)[] {
  const n = gripperCount(arm);
  if (n === 1) return [arm.isHolding ? arm.heldAtomId : null];
  const ids = arm.heldAtomIds ?? [];
  return Array.from({ length: n }, (_, i) => ids[i] ?? null);
}

/** Sets the atoms held by each gripper and keeps `isHolding` / `heldAtomId` consistent. */
export function setHeldAtomIds(arm: ArmState, ids: readonly (string | null)[]): void {
  const n = gripperCount(arm);
  const held = Array.from({ length: n }, (_, i) => ids[i] ?? null);
  const first = held.find(id => id !== null) ?? null;
  arm.isHolding = first !== null;
  arm.heldAtomId = first;
  if (n > 1) arm.heldAtomIds = held;
}

export function createArm(params: {
  id: string;
  basePos: HexCoord;
  rotation?: number;
  length?: number;
  isPiston?: boolean;
  /** 2, 3 or 6 for a multi-gripper arm; default 1. */
  grippers?: number;
}): ArmState {
  const grippers = params.grippers ?? 1;
  if (!GRIPPER_COUNTS.includes(grippers)) {
    throw new Error(`Arm grippers must be one of ${GRIPPER_COUNTS.join(', ')}: ${grippers}`);
  }
  return {
    id: params.id,
    basePos: { ...params.basePos },
    rotation: ((params.rotation ?? 0) % 6 + 6) % 6,
    length: params.length ?? 1,
    isPiston: params.isPiston ?? false,
    isHolding: false,
    heldAtomId: null,
    ...(grippers > 1 ? { grippers, heldAtomIds: Array.from({ length: grippers }, () => null) } : {}),
  };
}

export function cloneArm(arm: ArmState): ArmState {
  return {
    ...arm,
    basePos: { ...arm.basePos },
    ...(arm.heldAtomIds ? { heldAtomIds: [...arm.heldAtomIds] } : {}),
  };
}

export function getArmCost(arm: ArmState): number {
  let cost = 20; // Standard arm length 1
  if (arm.length === 2) cost += 10;
  if (arm.length === 3) cost += 20;
  if (arm.isPiston) cost += 10;
  cost += (gripperCount(arm) - 1) * EXTRA_GRIPPER_COST;
  return cost;
}
