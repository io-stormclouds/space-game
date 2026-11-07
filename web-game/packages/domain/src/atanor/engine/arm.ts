// Ported from poc/space-atanor/src/core/engine/arm.ts (unchanged).
import { HexCoord, hexAdd, hexDirection, hexScale } from '../grid/hex';
import { ArmState } from './types';

export function getGripperPosition(arm: ArmState): HexCoord {
  const dir = hexDirection(arm.rotation);
  const offset = hexScale(dir, arm.length);
  return hexAdd(arm.basePos, offset);
}

export function createArm(params: {
  id: string;
  basePos: HexCoord;
  rotation?: number;
  length?: number;
  isPiston?: boolean;
}): ArmState {
  return {
    id: params.id,
    basePos: { ...params.basePos },
    rotation: ((params.rotation ?? 0) % 6 + 6) % 6,
    length: params.length ?? 1,
    isPiston: params.isPiston ?? false,
    isHolding: false,
    heldAtomId: null,
  };
}

export function cloneArm(arm: ArmState): ArmState {
  return {
    ...arm,
    basePos: { ...arm.basePos },
  };
}

export function getArmCost(arm: ArmState): number {
  let cost = 20; // Standard arm length 1
  if (arm.length === 2) cost += 10;
  if (arm.length === 3) cost += 20;
  if (arm.isPiston) cost += 10;
  return cost;
}
