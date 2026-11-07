// Continuous motion inside a tick (AT5; POC-6 trajectory collisions, POC-5 swept area).
// New in web-game: the PoC only compared end positions.
//
// A tick's motion is a rigid move per arm: a 60° turn around a fixed point (ROTATE around the arm
// base, PIVOT around the gripper) or a straight translation (EXTEND / RETRACT along the gripper
// direction, TRACK_* along the track step). The engine samples it at TRAJECTORY_SUBSTEPS fixed
// fractions of the tick in cartesian hex space. Deterministic: fixed sub-step count, fixed
// clearance, precomputed rotation table, no randomness.
import { HexCoord, hexAdd, hexCreate, hexRotateAround, hexRound } from '../grid/hex';

/** Sub-steps per tick: a 60° turn is sampled every 5°. */
export const TRAJECTORY_SUBSTEPS = 12;

/**
 * Minimum distance (in hex spacings, neighbours are 1 apart) between two atoms, or two grippers of
 * different arms, while they move. With 0.5 an atom on a length-1 arc never touches a resting atom
 * (closest lattice point 0.73 away), while a length-2 arc hits the hex between its start and end
 * (0.27 away). Atoms are drawn with a radius of about 0.21 spacing, so a JAM is never shown as a
 * near miss.
 */
export const TRAJECTORY_CLEARANCE = 0.5;

export type Motion =
  /** Turn by `steps` × 60° around `center` (positive = clockwise, as `hexRotateAround`). */
  | { readonly kind: 'rotate'; readonly center: HexCoord; readonly steps: number }
  /** Straight move by `delta`. */
  | { readonly kind: 'translate'; readonly delta: HexCoord };

/** Cartesian point in hex spacings: neighbours are 1 apart (y grows like r, as on screen). */
export interface Point {
  readonly x: number;
  readonly y: number;
}

const SQRT3_2 = Math.sqrt(3) / 2;

/** Cosine and sine of k × (60° / TRAJECTORY_SUBSTEPS), k = 0..TRAJECTORY_SUBSTEPS. */
const TURN_TABLE: readonly { readonly cos: number; readonly sin: number }[] = Array.from(
  { length: TRAJECTORY_SUBSTEPS + 1 },
  (_, k) => {
    const angle = (Math.PI / 3) * (k / TRAJECTORY_SUBSTEPS);
    return { cos: Math.cos(angle), sin: Math.sin(angle) };
  }
);

export function hexToPoint(hex: HexCoord): Point {
  return { x: hex.q + hex.r / 2, y: hex.r * SQRT3_2 };
}

/** Hex containing a point (cube rounding). */
export function pointToHex(p: Point): HexCoord {
  const r = p.y / SQRT3_2;
  const q = p.x - r / 2;
  const h = hexRound(q, r);
  return hexCreate(h.q, h.r);
}

/** Where `pos` ends after the whole motion (exact hex arithmetic). */
export function motionEnd(motion: Motion | null, pos: HexCoord): HexCoord {
  if (!motion) return { ...pos };
  return motion.kind === 'rotate' ? hexRotateAround(pos, motion.center, motion.steps) : hexAdd(pos, motion.delta);
}

/**
 * Position of `pos` after sub-step `k` of TRAJECTORY_SUBSTEPS (k = 0: start, k = TRAJECTORY_SUBSTEPS: end).
 * Rotations of more than one step (not produced by arm commands) are scaled linearly.
 */
export function motionPoint(motion: Motion | null, pos: HexCoord, k: number): Point {
  const p = hexToPoint(pos);
  if (!motion) return p;
  const t = k / TRAJECTORY_SUBSTEPS;
  if (motion.kind === 'translate') {
    const d = hexToPoint(motion.delta);
    return { x: p.x + d.x * t, y: p.y + d.y * t };
  }
  const c = hexToPoint(motion.center);
  let cos: number;
  let sin: number;
  if (Math.abs(motion.steps) === 1) {
    ({ cos, sin } = TURN_TABLE[k]);
    sin *= motion.steps;
  } else {
    const angle = (Math.PI / 3) * motion.steps * t;
    cos = Math.cos(angle);
    sin = Math.sin(angle);
  }
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * cos - dy * sin, y: c.y + dx * sin + dy * cos };
}

export function distanceSquared(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Hexes `pos` passes through during the motion (sampled sub-steps, start and end included). */
export function sweptHexes(motion: Motion | null, pos: HexCoord): HexCoord[] {
  const seen = new Map<string, HexCoord>();
  for (let k = 0; k <= TRAJECTORY_SUBSTEPS; k++) {
    const hex = pointToHex(motionPoint(motion, pos, k));
    seen.set(`${hex.q},${hex.r}`, hex);
  }
  return [...seen.values()];
}
