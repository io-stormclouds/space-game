// Interpolated pose of the machine between two engine ticks (pure; no PixiJS).
// The PoC lerped atoms in a straight line while arms turned, so held atoms left the gripper
// mid-move. Here a held molecule rides rigidly with its gripper (rotation, piston, track and
// pivot), and the end pose is checked against the engine: if they disagree (jam, blocked move)
// the atom falls back to a straight lerp. Order inside a tick follows the engine pipeline:
// grab/drop → motion → bonds, transmutation, output → new atoms on inputs.
import { Atanor } from '@space-game/domain';
import { armAngle, hexStep, hexToScreen, type HexLayout } from './layout';

type StepResult = Atanor.SimulationStepResult;
type ArmState = Atanor.ArmState;

export interface Point {
  x: number;
  y: number;
}

export interface ArmPose {
  id: string;
  base: Point;
  /** The main gripper (index 0). */
  gripper: Point;
  /** Every gripper, in gripper order (multi-gripper arms, Fabryka atanorowa L4). */
  grippers: Point[];
  /** Screen angle of the main gripper [rad]. */
  angle: number;
  holding: boolean;
  /** Whether each gripper holds an atom. */
  held: boolean[];
  isPiston: boolean;
}

export interface AtomPose {
  id: string;
  element: string;
  x: number;
  y: number;
  alpha: number;
}

export interface BondPose {
  id: string;
  a: Point;
  b: Point;
  alpha: number;
}

export interface MachinePose {
  arms: ArmPose[];
  atoms: AtomPose[];
  bonds: BondPose[];
  /** A product left through an output on this tick. */
  delivered: boolean;
  /** Atoms to mark on a jam. */
  jamAtoms: string[];
}

const MOTION = new Set<Atanor.ArmCommand>(['ROTATE_CW', 'ROTATE_CCW', 'PIVOT_CW', 'PIVOT_CCW', 'EXTEND', 'RETRACT', 'TRACK_POS', 'TRACK_NEG']);

/** Reactions (bonds, transmutation, output) happen at the end of the tick. */
export const REACTION_T = 0.85;
/** New atoms on input ports fade in from here. */
export const SPAWN_T = 0.7;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Shortest signed difference of two direction indices (−3..3). */
export function rotationDelta(from: number, to: number): number {
  let d = (((to - from) % 6) + 6) % 6;
  if (d > 3) d -= 6;
  return d;
}

function rotate(p: Point, a: number): Point {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

/** Angle offset of gripper `i` from the main gripper [rad] (grippers spaced evenly, engine arm.ts). */
function gripperOffset(arm: ArmState, i: number): number {
  return (i * 2 * Math.PI) / Atanor.gripperCount(arm);
}

export function armPose(prev: ArmState, curr: ArmState, t: number, layout: HexLayout): ArmPose {
  const b0 = hexToScreen(prev.basePos, layout);
  const b1 = hexToScreen(curr.basePos, layout);
  const base = { x: lerp(b0.x, b1.x, t), y: lerp(b0.y, b1.y, t) };
  const angle = armAngle(prev.rotation) + rotationDelta(prev.rotation, curr.rotation) * (Math.PI / 3) * t;
  const len = lerp(prev.length, curr.length, t) * hexStep(layout);
  const grippers = Array.from({ length: Atanor.gripperCount(curr) }, (_, i) => ({ x: base.x + len * Math.cos(angle + gripperOffset(curr, i)), y: base.y + len * Math.sin(angle + gripperOffset(curr, i)) }));
  const heldIds = Atanor.getHeldAtomIds(t < 0.5 ? prev : curr);
  return {
    id: curr.id,
    base,
    gripper: grippers[0]!,
    grippers,
    angle,
    holding: t < 0.5 ? prev.isHolding : curr.isHolding,
    held: heldIds.map((h) => h !== null),
    isPiston: curr.isPiston,
  };
}

/** Atom id → ids of the atoms in its molecule (connected by bonds). */
export function moleculeIndex(atoms: ReadonlyArray<{ id: string }>, bonds: ReadonlyArray<{ atom1Id: string; atom2Id: string }>): Map<string, Set<string>> {
  const parent = new Map<string, string>(atoms.map((a) => [a.id, a.id]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r) ?? r;
    parent.set(x, r);
    return r;
  };
  for (const b of bonds) {
    if (!parent.has(b.atom1Id) || !parent.has(b.atom2Id)) continue;
    const r1 = find(b.atom1Id);
    const r2 = find(b.atom2Id);
    if (r1 !== r2) parent.set(r1, r2);
  }
  const groups = new Map<string, Set<string>>();
  for (const a of atoms) {
    const r = find(a.id);
    const g = groups.get(r) ?? new Set<string>();
    g.add(a.id);
    groups.set(r, g);
  }
  const out = new Map<string, Set<string>>();
  for (const g of groups.values()) for (const id of g) out.set(id, g);
  return out;
}

function bondKey(b: { atom1Id: string; atom2Id: string }): string {
  return b.atom1Id < b.atom2Id ? `${b.atom1Id}--${b.atom2Id}` : `${b.atom2Id}--${b.atom1Id}`;
}

/** Pose of the machine `t` (0..1) of the way from `prev` to `curr`. */
export function interpolateMachine(prev: StepResult, curr: StepResult, t: number, layout: HexLayout): MachinePose {
  const tt = Math.max(0, Math.min(1, t));
  const prevArms = new Map(prev.arms.map((a) => [a.id, a]));
  const arms = curr.arms.map((a) => armPose(prevArms.get(a.id) ?? a, a, tt, layout));

  // Rigid carriers: grippers that held something before the tick while their arm moved.
  const molecules = moleculeIndex(prev.atoms, prev.bonds);
  const carrierOf = new Map<string, { prev: ArmState; curr: ArmState; cmd: Atanor.ArmCommand; gripper: number }>();
  for (const pa of prev.arms) {
    const cmd = curr.commandsExecuted[pa.id];
    const ca = curr.arms.find((a) => a.id === pa.id);
    if (!pa.isHolding || !cmd || !MOTION.has(cmd) || !ca) continue;
    Atanor.getHeldAtomIds(pa).forEach((held, gripper) => {
      if (!held) return;
      for (const id of molecules.get(held) ?? []) if (!carrierOf.has(id)) carrierOf.set(id, { prev: pa, curr: ca, cmd, gripper });
    });
  }

  const currAtoms = new Map(curr.atoms.map((a) => [a.id, a]));
  const poses = new Map<string, AtomPose>();
  for (const a of prev.atoms) {
    const p0 = hexToScreen(a.pos, layout);
    const c = currAtoms.get(a.id);
    const p1 = c ? hexToScreen(c.pos, layout) : null;
    let pos: Point = p1 ? { x: lerp(p0.x, p1.x, tt), y: lerp(p0.y, p1.y, tt) } : p0;
    const carrier = carrierOf.get(a.id);
    if (carrier) {
      const rigid = (k: number): Point => {
        const start = armPose(carrier.prev, carrier.curr, 0, layout);
        const now = armPose(carrier.prev, carrier.curr, k, layout);
        const g0 = start.grippers[carrier.gripper] ?? start.gripper;
        const g1 = now.grippers[carrier.gripper] ?? now.gripper;
        const pivot = carrier.cmd === 'PIVOT_CW' ? (Math.PI / 3) * k : carrier.cmd === 'PIVOT_CCW' ? -(Math.PI / 3) * k : 0;
        const rel = rotate({ x: p0.x - g0.x, y: p0.y - g0.y }, -start.angle);
        const r = rotate(rel, now.angle + pivot);
        return { x: g1.x + r.x, y: g1.y + r.y };
      };
      const end = rigid(1);
      const agrees = !p1 || Math.hypot(end.x - p1.x, end.y - p1.y) < 0.5;
      if (agrees) pos = rigid(tt);
    }
    // Delivered atoms ride onto the output and vanish when the tick ends.
    const alpha = c ? 1 : tt < REACTION_T ? 1 : Math.max(0, (1 - tt) / (1 - REACTION_T));
    const element = c && tt >= REACTION_T ? c.element : a.element;
    poses.set(a.id, { id: a.id, element, x: pos.x, y: pos.y, alpha });
  }
  const prevIds = new Set(prev.atoms.map((a) => a.id));
  for (const c of curr.atoms) {
    if (prevIds.has(c.id)) continue;
    const p = hexToScreen(c.pos, layout);
    const alpha = tt <= SPAWN_T ? 0 : (tt - SPAWN_T) / (1 - SPAWN_T);
    poses.set(c.id, { id: c.id, element: c.element, x: p.x, y: p.y, alpha });
  }

  const prevBonds = new Set(prev.bonds.map(bondKey));
  const currBonds = new Set(curr.bonds.map(bondKey));
  const bonds: BondPose[] = [];
  const pushBond = (b: { id: string; atom1Id: string; atom2Id: string }, alpha: number) => {
    const p1 = poses.get(b.atom1Id);
    const p2 = poses.get(b.atom2Id);
    const a = Math.min(alpha, p1?.alpha ?? 0, p2?.alpha ?? 0);
    if (p1 && p2 && a > 0) bonds.push({ id: b.id, a: { x: p1.x, y: p1.y }, b: { x: p2.x, y: p2.y }, alpha: a });
  };
  for (const b of curr.bonds) pushBond(b, prevBonds.has(bondKey(b)) || tt >= REACTION_T ? 1 : 0);
  for (const b of prev.bonds) if (!currBonds.has(bondKey(b))) pushBond(b, tt < REACTION_T ? 1 : 0);

  // Jam marks: the atoms the engine names (trajectory, arm and off-board jams, AT5), else atoms
  // sharing a hex, else the molecules held by several arms.
  const jamAtoms: string[] = [...(curr.collisionDetected ? (curr.jamDetail?.atomIds ?? []) : [])];
  if (curr.collisionDetected && jamAtoms.length === 0) {
    const byHex = new Map<string, string[]>();
    for (const a of curr.atoms) {
      const k = `${a.pos.q},${a.pos.r}`;
      byHex.set(k, [...(byHex.get(k) ?? []), a.id]);
    }
    for (const ids of byHex.values()) if (ids.length > 1) jamAtoms.push(...ids);
    if (jamAtoms.length === 0) {
      const currMolecules = moleculeIndex(curr.atoms, curr.bonds);
      const holders = new Map<Set<string>, number>();
      for (const arm of curr.arms) {
        const m = arm.heldAtomId ? currMolecules.get(arm.heldAtomId) : undefined;
        if (m) holders.set(m, (holders.get(m) ?? 0) + 1);
      }
      for (const [m, n] of holders) if (n > 1) jamAtoms.push(...m);
    }
  }

  return {
    arms,
    atoms: [...poses.values()].filter((p) => p.alpha > 0),
    bonds,
    delivered: curr.productsDelivered > prev.productsDelivered,
    jamAtoms,
  };
}
