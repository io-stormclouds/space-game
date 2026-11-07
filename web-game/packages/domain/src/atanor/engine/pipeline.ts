// Ported from poc/space-atanor/src/core/engine/pipeline.ts.
// Changes:
//  - Phase 2 resolves motion per molecule, not per held atom (fix: a molecule held by two arms
//    was transformed twice). Holders must agree on the result, otherwise MOLECULE_CONFLICT JAM.
//  - Phase 4c asks `takeInput` before dispensing (finite input buffers, doc §8.5 p. 1).
//  - Outputs report deliveries through `onDelivered` (economy products).
//  - `visit` reports atom positions after the motion phase (fix: area missed the hex on which
//    a product was delivered, because the output consumed it before the end-of-tick sample).
//  - Results carry `tick`, `jamReason`, `jamDetail` and `starved`.
//  - AT5: multi-gripper arms (GRAB / DROP act on every gripper, each gripper carries its molecule);
//    phase 3b samples the motion inside the tick (trajectory.ts): atoms closer than the clearance
//    -> TRAJECTORY_COLLISION, grippers of different arms -> ARM_COLLISION, a moving atom or gripper
//    outside `boardRadius` -> OFF_BOARD; sampled positions also feed the area (`visit`).
import { HexCoord, hexDirection, hexDistance, hexEquals, hexKey, hexScale, hexSubtract } from '../grid/hex';
import { Atom, MoleculeGraph } from '../graph/molecule';
import {
  ArmCommand,
  ArmState,
  Glyph,
  InputReagentGlyph,
  JamDetail,
  JamReason,
  OutputProductGlyph,
  SimulationStepResult,
  TrackSegment,
} from './types';
import { cloneArm, getGripperPositions, getHeldAtomIds, gripperCount, gripperRotations, setHeldAtomIds } from './arm';
import {
  distanceSquared,
  hexToPoint,
  Motion,
  motionEnd,
  motionPoint,
  Point,
  pointToHex,
  TRAJECTORY_CLEARANCE,
  TRAJECTORY_SUBSTEPS,
} from './trajectory';

export interface TickContext {
  /** Timeline slot to execute. */
  cycle: number;
  /** Number of this tick since reset (1-based); copied to the result. */
  tick: number;
  graph: MoleculeGraph;
  arms: ArmState[];
  instructions: Record<string, (ArmCommand | null)[]>;
  glyphs: Glyph[];
  tracks: TrackSegment[];
  atomCounter: number;
  productsDelivered: number;
  targetRequired: number;
  hasCrashed: boolean;
  crashMessage?: string;
  jamReason?: JamReason | null;
  /** Where and between what the JAM happened; set together with `jamReason`. */
  jamDetail?: JamDetail | null;
  /** Board radius around (0,0); null / missing = unlimited board (PoC). */
  boardRadius?: number | null;
  /**
   * Called before an input dispenses an atom; returns false when its buffer is empty.
   * Missing = unlimited inputs (PoC behaviour).
   */
  takeInput?: (glyph: InputReagentGlyph) => boolean;
  /** Called once per consumed molecule. */
  onDelivered?: (glyph: OutputProductGlyph) => void;
  /**
   * Called with every atom position right after the motion phase and with every sampled position
   * of moving atoms and grippers inside the tick (area metric).
   */
  visit?: (pos: HexCoord) => void;
}

interface ArmMove {
  /** Mutates the arm's own state (rotation, length, base); null = the arm does not move. */
  readonly apply: (() => void) | null;
  /** Motion of each gripper's molecule (gripper order); null = it stays where it is. */
  readonly grippers: readonly (Motion | null)[];
  /** False for PIVOT: the molecules turn, the grippers stay. */
  readonly grippersMove: boolean;
}

interface Jam {
  readonly reason: JamReason;
  readonly message: string;
  readonly detail: JamDetail;
}

const ORIGIN: HexCoord = { q: 0, r: 0 };

function noMove(arm: ArmState): ArmMove {
  return { apply: null, grippers: new Array<Motion | null>(gripperCount(arm)).fill(null), grippersMove: false };
}

/** Kinematics of one arm command, computed from the pre-tick state. */
function planArmMove(arm: ArmState, cmd: ArmCommand, tracks: TrackSegment[]): ArmMove {
  switch (cmd) {
    case 'ROTATE_CW':
    case 'ROTATE_CCW': {
      const steps = cmd === 'ROTATE_CW' ? 1 : -1;
      const motion: Motion = { kind: 'rotate', center: { ...arm.basePos }, steps };
      return {
        apply: () => {
          arm.rotation = (arm.rotation + (steps === 1 ? 1 : 5)) % 6;
        },
        grippers: new Array<Motion | null>(gripperCount(arm)).fill(motion),
        grippersMove: true,
      };
    }

    case 'PIVOT_CW':
    case 'PIVOT_CCW': {
      // Rotates each held molecule around its gripper; the arm itself does not move.
      const steps = cmd === 'PIVOT_CW' ? 1 : -1;
      return {
        apply: null,
        grippers: getGripperPositions(arm).map((center): Motion => ({ kind: 'rotate', center, steps })),
        grippersMove: false,
      };
    }

    case 'EXTEND':
    case 'RETRACT': {
      const sign = cmd === 'EXTEND' ? 1 : -1;
      if (!arm.isPiston || (sign === 1 ? arm.length >= 3 : arm.length <= 1)) return noMove(arm);
      // Every gripper slides along its own direction.
      return {
        apply: () => {
          arm.length += sign;
        },
        grippers: gripperRotations(arm).map((rot): Motion => ({ kind: 'translate', delta: hexScale(hexDirection(rot), sign) })),
        grippersMove: true,
      };
    }

    case 'TRACK_POS':
    case 'TRACK_NEG': {
      // Slide the arm's base along its track (if it is attached to one).
      if (!arm.trackId) return noMove(arm);
      const track = tracks.find(t => t.id === arm.trackId);
      if (!track || track.path.length === 0) return noMove(arm);
      const nextIdx = (arm.trackIndex ?? 0) + (cmd === 'TRACK_POS' ? 1 : -1);
      if (nextIdx < 0 || nextIdx >= track.path.length) return noMove(arm);
      const newBase = { ...track.path[nextIdx] };
      const motion: Motion = { kind: 'translate', delta: hexSubtract(newBase, arm.basePos) };
      return {
        apply: () => {
          arm.trackIndex = nextIdx;
          arm.basePos = newBase;
        },
        grippers: new Array<Motion | null>(gripperCount(arm)).fill(motion),
        grippersMove: true,
      };
    }

    default:
      // GRAB, DROP, EMPTY, REPEAT do not cause kinematic motion
      return noMove(arm);
  }
}

function buildResult(
  ctx: TickContext,
  tick: number,
  commandsExecuted: Record<string, ArmCommand>,
  jam: Jam | null
): SimulationStepResult {
  return {
    cycle: ctx.cycle,
    tick,
    commandsExecuted,
    collisionDetected: jam !== null,
    ...(jam ? { collisionMessage: jam.message, jamDetail: jam.detail } : {}),
    jamReason: jam?.reason ?? null,
    starved: false,
    productsDelivered: ctx.productsDelivered,
    isLevelCompleted: ctx.productsDelivered >= ctx.targetRequired,
    atoms: ctx.graph.getAtoms().map(a => ({ ...a, pos: { ...a.pos } })),
    bonds: ctx.graph.getBonds().map(b => ({ ...b })),
    arms: ctx.arms.map(cloneArm),
  };
}

function crash(ctx: TickContext, reason: JamReason, message: string, detail: JamDetail): Jam {
  ctx.hasCrashed = true;
  ctx.crashMessage = message;
  ctx.jamReason = reason;
  ctx.jamDetail = detail;
  return { reason, message, detail };
}

const atomName = (a: Pick<Atom, 'id' | 'element'>): string => `${a.element} (#${a.id})`;

export function executeTick(ctx: TickContext): SimulationStepResult {
  if (ctx.hasCrashed) {
    const message = ctx.crashMessage ?? 'CRASH / JAM';
    const detail = ctx.jamDetail ?? { atomIds: [], armIds: [], hex: null, t: 1 };
    return buildResult(ctx, ctx.tick - 1, {}, { reason: ctx.jamReason ?? 'ATOM_COLLISION', message, detail });
  }

  const cycle = ctx.cycle;
  const executedCommands: Record<string, ArmCommand> = {};

  // ==========================================
  // PHASE 1: DISPATCH (Read commands & Grabs/Drops)
  // ==========================================
  // GRAB closes every gripper on the atom under it (a gripper over an empty hex keeps its state);
  // DROP opens all grippers of the arm.
  for (const arm of ctx.arms) {
    const tape = ctx.instructions[arm.id] || [];
    const cmd = (tape[cycle] ?? 'EMPTY') as ArmCommand;
    executedCommands[arm.id] = cmd;

    if (cmd === 'GRAB') {
      const held = getHeldAtomIds(arm);
      getGripperPositions(arm).forEach((pos, i) => {
        const atom = ctx.graph.getAtomAt(pos);
        if (atom) held[i] = atom.id;
      });
      setHeldAtomIds(arm, held);
    } else if (cmd === 'DROP') {
      setHeldAtomIds(arm, []);
    }
  }

  // ==========================================
  // PHASE 2: KINEMATICS (Transforms)
  // ==========================================
  // All motions are planned from the pre-tick state. A molecule moves at most once per tick:
  // every gripper holding one of its atoms must produce the same end positions (a holder that does
  // not move counts as "keep in place"). Otherwise the arms pull the molecule apart -> JAM.
  // The PoC guarded per held atom ID, so two arms holding different atoms of one molecule
  // transformed it twice.
  const moves = ctx.arms.map(arm => ({ arm, move: planArmMove(arm, executedCommands[arm.id], ctx.tracks) }));

  const componentIndexByAtom = new Map<string, number>();
  const components: { atoms: Atom[]; holders: { armId: string; motion: Motion | null }[] }[] = [];
  for (const { arm, move } of moves) {
    getHeldAtomIds(arm).forEach((atomId, i) => {
      if (!atomId || !ctx.graph.getAtom(atomId)) return;
      let idx = componentIndexByAtom.get(atomId);
      if (idx === undefined) {
        const { atoms } = ctx.graph.getConnectedComponent(atomId);
        idx = components.length;
        components.push({ atoms, holders: [] });
        for (const a of atoms) componentIndexByAtom.set(a.id, idx);
      }
      components[idx].holders.push({ armId: arm.id, motion: move.grippers[i] ?? null });
    });
  }

  /** Moving atoms: start hex, motion (from the first moving holder) and end hex. */
  const atomMotions = new Map<string, { start: HexCoord; motion: Motion; end: HexCoord }>();
  let conflict: { armIds: string[]; atoms: Atom[] } | null = null;
  for (const { atoms, holders } of components) {
    const motion = holders.find(h => h.motion !== null)?.motion ?? null;
    if (!motion) continue;
    const outcomes = holders.map(h => atoms.map(a => motionEnd(h.motion, a.pos)));
    const first = outcomes[0];
    const agree = outcomes.every(o => o.every((p, i) => hexEquals(p, first[i])));
    if (!agree) {
      conflict ??= { armIds: [...new Set(holders.map(h => h.armId))], atoms };
      continue; // a conflicting molecule stays where it was
    }
    atoms.forEach((a, i) => atomMotions.set(a.id, { start: { ...a.pos }, motion, end: first[i] }));
  }

  // Gripper paths (pre-tick positions; PIVOT turns the molecules, not the grippers).
  const gripperPaths: GripperPath[] = [];
  for (const { arm, move } of moves) {
    getGripperPositions(arm).forEach((start, i) =>
      gripperPaths.push({ armId: arm.id, index: i, start, motion: move.grippersMove ? move.grippers[i] ?? null : null })
    );
  }

  for (const { move } of moves) {
    move.apply?.();
  }
  for (const [atomId, { end }] of atomMotions) {
    ctx.graph.moveAtom(atomId, end);
  }
  // Atoms reach these hexes even if an output consumes them later in this tick
  // (the PoC sampled area only at the end of the tick and missed the output hex).
  if (ctx.visit) {
    for (const atom of ctx.graph.getAtoms()) ctx.visit(atom.pos);
  }

  if (conflict) {
    const atomNames = conflict.atoms.map(atomName).join(', ');
    const jam = crash(
      ctx,
      'MOLECULE_CONFLICT',
      `CRASH / JAM: arms ${conflict.armIds.join(', ')} hold the same molecule [${atomNames}] and move it in different ways!`,
      { atomIds: conflict.atoms.map(a => a.id), armIds: conflict.armIds, hex: null, t: 0 }
    );
    return buildResult(ctx, ctx.tick, executedCommands, jam);
  }

  // ==========================================
  // PHASE 3: COLLISION DETECTION
  // ==========================================
  // 3a. Two atoms on one hex at the end of the motion (PoC rule; checked first).
  const collisions = ctx.graph.getCollisions();
  if (collisions.size > 0) {
    const [hexKeyStr, collidingAtoms] = Array.from(collisions.entries())[0];
    const atomNames = collidingAtoms.map(atomName).join(' and ');
    const jam = crash(ctx, 'ATOM_COLLISION', `CRASH / JAM at hex [${hexKeyStr}]: Atoms ${atomNames} collided!`, {
      atomIds: collidingAtoms.map(a => a.id),
      armIds: [],
      hex: { ...collidingAtoms[0].pos },
      t: 1,
    });
    return buildResult(ctx, ctx.tick, executedCommands, jam);
  }

  // 3b. Inside the tick: trajectories, grippers, board (sampled sub-steps).
  const sweepJam = sweepTick(ctx, atomMotions, gripperPaths);
  if (sweepJam) {
    return buildResult(ctx, ctx.tick, executedCommands, sweepJam);
  }

  // ==========================================
  // PHASE 4: REACTIONS & GLYPH INTERACTIONS
  // ==========================================
  // 4a. Bonder, Unbonder and Transmute glyphs (in glyph order)
  for (const glyph of ctx.glyphs) {
    if (glyph.type === 'BONDER') {
      const atom1 = ctx.graph.getAtomAt(glyph.pos);
      const atom2 = ctx.graph.getAtomAt(glyph.pos2);
      if (atom1 && atom2) {
        ctx.graph.addBond(atom1.id, atom2.id, 1);
      }
    } else if (glyph.type === 'UNBONDER') {
      const atom1 = ctx.graph.getAtomAt(glyph.pos);
      const atom2 = ctx.graph.getAtomAt(glyph.pos2);
      if (atom1 && atom2) {
        ctx.graph.removeBondBetween(atom1.id, atom2.id);
      }
    } else if (glyph.type === 'TRANSMUTE') {
      // Convert any atom of fromElement resting on this glyph into toElement,
      // preserving its ID, position and existing bonds.
      const atom = ctx.graph.getAtomAt(glyph.pos);
      if (atom && atom.element === glyph.fromElement) {
        ctx.graph.transmuteAtom(atom.id, glyph.toElement);
      }
    }
  }

  // 4b. Output Product Glyphs (Sink)
  for (const glyph of ctx.glyphs) {
    if (glyph.type === 'OUTPUT') {
      const rootAtom = ctx.graph.getAtomAt(glyph.pos);
      if (rootAtom) {
        const { atoms, bonds } = ctx.graph.getConnectedComponent(rootAtom.id);
        const matches = ctx.graph.matchesTarget(atoms, bonds, glyph.targetPattern);
        if (matches) {
          // Release every gripper holding an atom of this consumed molecule
          const consumedIds = new Set(atoms.map(a => a.id));
          for (const arm of ctx.arms) {
            const held = getHeldAtomIds(arm);
            if (held.some(id => id !== null && consumedIds.has(id))) {
              setHeldAtomIds(arm, held.map(id => (id !== null && consumedIds.has(id) ? null : id)));
            }
          }
          // Remove from graph
          for (const a of atoms) {
            ctx.graph.removeAtom(a.id);
          }
          ctx.productsDelivered += 1;
          ctx.onDelivered?.(glyph);
        }
      }
    }
  }

  // 4c. Input Reagent Glyphs (Generator)
  // If an input hex is vacant, dispense a fresh atom (if its buffer has a portion).
  for (const glyph of ctx.glyphs) {
    if (glyph.type === 'INPUT') {
      spawnAtInput(ctx, glyph);
    }
  }

  return buildResult(ctx, ctx.tick, executedCommands, null);
}

interface GripperPath {
  readonly armId: string;
  readonly index: number;
  readonly start: HexCoord;
  /** Null when the gripper does not move this tick. */
  readonly motion: Motion | null;
}

/**
 * Samples the tick's motion at TRAJECTORY_SUBSTEPS sub-steps (k = 1..N). At each sub-step, in
 * this order: moving atoms and grippers must stay on the board; two atoms (at least one moving)
 * must keep TRAJECTORY_CLEARANCE (k < N; the end is phase 3a); two grippers of different arms (at
 * least one moving) must keep it too, unless they already overlapped before the tick (e.g. two
 * grippers on one atom). Empty grippers pass over atoms, and arm bodies are not checked.
 * The first violation jams; sampled positions of moving atoms and grippers are reported to `visit`.
 */
function sweepTick(
  ctx: TickContext,
  atomMotions: ReadonlyMap<string, { start: HexCoord; motion: Motion }>,
  grippers: readonly GripperPath[]
): Jam | null {
  const N = TRAJECTORY_SUBSTEPS;
  const clearance2 = TRAJECTORY_CLEARANCE * TRAJECTORY_CLEARANCE;
  const moving = [...atomMotions.entries()].map(([id, m]) => ({ atom: ctx.graph.getAtom(id)!, ...m }));
  const movingGrippers = grippers.filter(g => g.motion !== null);
  if (moving.length === 0 && movingGrippers.length === 0) return null;
  const resting = ctx.graph
    .getAtoms()
    .filter(a => !atomMotions.has(a.id))
    .map(a => ({ atom: a, point: hexToPoint(a.pos) }));

  const gripperPairs: [GripperPath, GripperPath][] = [];
  for (let i = 0; i < grippers.length; i++) {
    for (let j = i + 1; j < grippers.length; j++) {
      const a = grippers[i];
      const b = grippers[j];
      if (a.armId === b.armId || (a.motion === null && b.motion === null)) continue;
      if (distanceSquared(hexToPoint(a.start), hexToPoint(b.start)) < clearance2) continue;
      gripperPairs.push([a, b]);
    }
  }
  const radius = ctx.boardRadius ?? null;
  const offBoard = (hex: HexCoord) => radius !== null && hexDistance(hex, ORIGIN) > radius;

  for (let k = 1; k <= N; k++) {
    const atomPoints = moving.map(m => motionPoint(m.motion, m.start, k));
    const gripperPoint = new Map<GripperPath, Point>(grippers.map(g => [g, motionPoint(g.motion, g.start, k)]));

    if (ctx.visit && k < N) {
      for (const p of atomPoints) ctx.visit(pointToHex(p));
      for (const g of movingGrippers) ctx.visit(pointToHex(gripperPoint.get(g)!));
    }

    if (radius !== null) {
      for (let i = 0; i < moving.length; i++) {
        const hex = pointToHex(atomPoints[i]);
        if (offBoard(hex)) {
          return crash(ctx, 'OFF_BOARD', `CRASH / JAM: atom ${atomName(moving[i].atom)} left the board at hex [${hexKey(hex)}] (radius ${radius})!`, {
            atomIds: [moving[i].atom.id],
            armIds: [],
            hex,
            t: k / N,
          });
        }
      }
      for (const g of movingGrippers) {
        const hex = pointToHex(gripperPoint.get(g)!);
        if (offBoard(hex)) {
          return crash(ctx, 'OFF_BOARD', `CRASH / JAM: gripper of arm ${g.armId} left the board at hex [${hexKey(hex)}] (radius ${radius})!`, {
            atomIds: [],
            armIds: [g.armId],
            hex,
            t: k / N,
          });
        }
      }
    }

    if (k < N) {
      for (let i = 0; i < moving.length; i++) {
        const p = atomPoints[i];
        const others: { atom: Atom; point: Point }[] = [
          ...moving.slice(i + 1).map((m, j) => ({ atom: m.atom, point: atomPoints[i + 1 + j] })),
          ...resting,
        ];
        for (const other of others) {
          if (distanceSquared(p, other.point) < clearance2) {
            const hex = pointToHex(p);
            return crash(
              ctx,
              'TRAJECTORY_COLLISION',
              `CRASH / JAM near hex [${hexKey(hex)}]: Atoms ${atomName(moving[i].atom)} and ${atomName(other.atom)} collided while moving!`,
              { atomIds: [moving[i].atom.id, other.atom.id], armIds: [], hex, t: k / N }
            );
          }
        }
      }
    }

    for (const [a, b] of gripperPairs) {
      const pa = gripperPoint.get(a)!;
      if (distanceSquared(pa, gripperPoint.get(b)!) < clearance2) {
        const hex = pointToHex(pa);
        return crash(ctx, 'ARM_COLLISION', `CRASH / JAM near hex [${hexKey(hex)}]: grippers of arms ${a.armId} and ${b.armId} collided!`, {
          atomIds: [],
          armIds: [a.armId, b.armId],
          hex,
          t: k / N,
        });
      }
    }
  }
  return null;
}

/**
 * Dispense an atom on a vacant input hex. Returns true when the hex is occupied afterwards
 * (it already was, or an atom was dispensed).
 */
export function spawnAtInput(
  ctx: Pick<TickContext, 'graph' | 'atomCounter' | 'takeInput'>,
  glyph: InputReagentGlyph
): boolean {
  if (ctx.graph.getAtomAt(glyph.pos)) return true;
  if (ctx.takeInput && !ctx.takeInput(glyph)) return false;
  ctx.atomCounter += 1;
  ctx.graph.addAtom({
    id: `atom_${ctx.atomCounter}`,
    element: glyph.element,
    pos: { ...glyph.pos },
  });
  return true;
}
