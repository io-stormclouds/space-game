// Ported from poc/space-atanor/src/core/engine/pipeline.ts.
// Changes:
//  - Phase 2 resolves motion per molecule, not per held atom (fix: a molecule held by two arms
//    was transformed twice). Holders must agree on the result, otherwise MOLECULE_CONFLICT JAM.
//  - Phase 4c asks `takeInput` before dispensing (finite input buffers, doc §8.5 p. 1).
//  - Outputs report deliveries through `onDelivered` (economy products).
//  - `visit` reports atom positions after the motion phase (fix: area missed the hex on which
//    a product was delivered, because the output consumed it before the end-of-tick sample).
//  - Results carry `tick`, `jamReason` and `starved`.
import { HexCoord, hexAdd, hexDirection, hexEquals, hexRotateAround, hexScale, hexSubtract } from '../grid/hex';
import { Atom, MoleculeGraph } from '../graph/molecule';
import {
  ArmCommand,
  ArmState,
  Glyph,
  InputReagentGlyph,
  JamReason,
  OutputProductGlyph,
  SimulationStepResult,
  TrackSegment,
} from './types';
import { cloneArm, getGripperPosition } from './arm';

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
  /**
   * Called before an input dispenses an atom; returns false when its buffer is empty.
   * Missing = unlimited inputs (PoC behaviour).
   */
  takeInput?: (glyph: InputReagentGlyph) => boolean;
  /** Called once per consumed molecule. */
  onDelivered?: (glyph: OutputProductGlyph) => void;
  /** Called with every atom position right after the motion phase (area metric). */
  visit?: (pos: HexCoord) => void;
}

type AtomTransform = (pos: HexCoord) => HexCoord;

interface ArmMove {
  /** Mutates the arm's own state (rotation, length, base); null = the arm does not move. */
  readonly apply: (() => void) | null;
  /** Where the held molecule goes with the arm; null = it stays where it is. */
  readonly transform: AtomTransform | null;
}

const NO_MOVE: ArmMove = { apply: null, transform: null };

/** Kinematics of one arm command, computed from the pre-tick state. */
function planArmMove(arm: ArmState, cmd: ArmCommand, tracks: TrackSegment[]): ArmMove {
  switch (cmd) {
    case 'ROTATE_CW':
    case 'ROTATE_CCW': {
      const steps = cmd === 'ROTATE_CW' ? 1 : -1;
      const center = { ...arm.basePos };
      return {
        apply: () => {
          arm.rotation = (arm.rotation + (steps === 1 ? 1 : 5)) % 6;
        },
        transform: pos => hexRotateAround(pos, center, steps),
      };
    }

    case 'PIVOT_CW':
    case 'PIVOT_CCW': {
      // Rotates the held molecule around the gripper; the arm itself does not move.
      const steps = cmd === 'PIVOT_CW' ? 1 : -1;
      const center = getGripperPosition(arm);
      return { apply: null, transform: pos => hexRotateAround(pos, center, steps) };
    }

    case 'EXTEND': {
      if (!arm.isPiston || arm.length >= 3) return NO_MOVE;
      const delta = hexDirection(arm.rotation);
      return {
        apply: () => {
          arm.length += 1;
        },
        transform: pos => hexAdd(pos, delta),
      };
    }

    case 'RETRACT': {
      if (!arm.isPiston || arm.length <= 1) return NO_MOVE;
      const delta = hexScale(hexDirection(arm.rotation), -1);
      return {
        apply: () => {
          arm.length -= 1;
        },
        transform: pos => hexAdd(pos, delta),
      };
    }

    case 'TRACK_POS':
    case 'TRACK_NEG': {
      // Slide the arm's base along its track (if it is attached to one).
      if (!arm.trackId) return NO_MOVE;
      const track = tracks.find(t => t.id === arm.trackId);
      if (!track || track.path.length === 0) return NO_MOVE;
      const nextIdx = (arm.trackIndex ?? 0) + (cmd === 'TRACK_POS' ? 1 : -1);
      if (nextIdx < 0 || nextIdx >= track.path.length) return NO_MOVE;
      const newBase = { ...track.path[nextIdx] };
      const delta = hexSubtract(newBase, arm.basePos);
      return {
        apply: () => {
          arm.trackIndex = nextIdx;
          arm.basePos = newBase;
        },
        transform: pos => hexAdd(pos, delta),
      };
    }

    default:
      // GRAB, DROP, EMPTY, REPEAT do not cause kinematic motion
      return NO_MOVE;
  }
}

function buildResult(
  ctx: TickContext,
  tick: number,
  commandsExecuted: Record<string, ArmCommand>,
  jam: { reason: JamReason; message: string } | null
): SimulationStepResult {
  return {
    cycle: ctx.cycle,
    tick,
    commandsExecuted,
    collisionDetected: jam !== null,
    ...(jam ? { collisionMessage: jam.message } : {}),
    jamReason: jam?.reason ?? null,
    starved: false,
    productsDelivered: ctx.productsDelivered,
    isLevelCompleted: ctx.productsDelivered >= ctx.targetRequired,
    atoms: ctx.graph.getAtoms().map(a => ({ ...a, pos: { ...a.pos } })),
    bonds: ctx.graph.getBonds().map(b => ({ ...b })),
    arms: ctx.arms.map(cloneArm),
  };
}

function crash(ctx: TickContext, reason: JamReason, message: string): { reason: JamReason; message: string } {
  ctx.hasCrashed = true;
  ctx.crashMessage = message;
  ctx.jamReason = reason;
  return { reason, message };
}

export function executeTick(ctx: TickContext): SimulationStepResult {
  if (ctx.hasCrashed) {
    const message = ctx.crashMessage ?? 'CRASH / JAM';
    return buildResult(ctx, ctx.tick - 1, {}, { reason: ctx.jamReason ?? 'ATOM_COLLISION', message });
  }

  const cycle = ctx.cycle;
  const executedCommands: Record<string, ArmCommand> = {};

  // ==========================================
  // PHASE 1: DISPATCH (Read commands & Grabs/Drops)
  // ==========================================
  for (const arm of ctx.arms) {
    const tape = ctx.instructions[arm.id] || [];
    const cmd = (tape[cycle] ?? 'EMPTY') as ArmCommand;
    executedCommands[arm.id] = cmd;

    if (cmd === 'GRAB') {
      const gripPos = getGripperPosition(arm);
      const atom = ctx.graph.getAtomAt(gripPos);
      if (atom) {
        arm.isHolding = true;
        arm.heldAtomId = atom.id;
      }
    } else if (cmd === 'DROP') {
      arm.isHolding = false;
      arm.heldAtomId = null;
    }
  }

  // ==========================================
  // PHASE 2: KINEMATICS (Transforms)
  // ==========================================
  // All motions are planned from the pre-tick state. A molecule moves at most once per tick:
  // every arm holding one of its atoms must produce the same end positions (a holder that does
  // not move counts as "keep in place"). Otherwise the arms pull the molecule apart -> JAM.
  // The PoC guarded per held atom ID, so two arms holding different atoms of one molecule
  // transformed it twice.
  const moves = ctx.arms.map(arm => ({ arm, move: planArmMove(arm, executedCommands[arm.id], ctx.tracks) }));

  const componentIndexByAtom = new Map<string, number>();
  const components: { atoms: Atom[]; holders: { armId: string; transform: AtomTransform | null }[] }[] = [];
  for (const { arm, move } of moves) {
    if (!arm.isHolding || !arm.heldAtomId || !ctx.graph.getAtom(arm.heldAtomId)) continue;
    let idx = componentIndexByAtom.get(arm.heldAtomId);
    if (idx === undefined) {
      const { atoms } = ctx.graph.getConnectedComponent(arm.heldAtomId);
      idx = components.length;
      components.push({ atoms, holders: [] });
      for (const a of atoms) componentIndexByAtom.set(a.id, idx);
    }
    components[idx].holders.push({ armId: arm.id, transform: move.transform });
  }

  const plannedPositions: { atomId: string; pos: HexCoord }[] = [];
  let conflict: { armIds: string[]; atoms: Atom[] } | null = null;
  for (const { atoms, holders } of components) {
    if (holders.every(h => h.transform === null)) continue;
    const outcomes = holders.map(h => atoms.map(a => (h.transform ? h.transform(a.pos) : { ...a.pos })));
    const first = outcomes[0];
    const agree = outcomes.every(o => o.every((p, i) => hexEquals(p, first[i])));
    if (!agree) {
      conflict ??= { armIds: holders.map(h => h.armId), atoms };
      continue; // a conflicting molecule stays where it was
    }
    atoms.forEach((a, i) => plannedPositions.push({ atomId: a.id, pos: first[i] }));
  }

  for (const { move } of moves) {
    move.apply?.();
  }
  for (const { atomId, pos } of plannedPositions) {
    ctx.graph.moveAtom(atomId, pos);
  }
  // Atoms reach these hexes even if an output consumes them later in this tick
  // (the PoC sampled area only at the end of the tick and missed the output hex).
  if (ctx.visit) {
    for (const atom of ctx.graph.getAtoms()) ctx.visit(atom.pos);
  }

  if (conflict) {
    const atomNames = conflict.atoms.map(a => `${a.element} (#${a.id})`).join(', ');
    const jam = crash(
      ctx,
      'MOLECULE_CONFLICT',
      `CRASH / JAM: arms ${conflict.armIds.join(', ')} hold the same molecule [${atomNames}] and move it in different ways!`
    );
    return buildResult(ctx, ctx.tick, executedCommands, jam);
  }

  // ==========================================
  // PHASE 3: COLLISION DETECTION
  // ==========================================
  const collisions = ctx.graph.getCollisions();
  if (collisions.size > 0) {
    const [hexKeyStr, collidingAtoms] = Array.from(collisions.entries())[0];
    const atomNames = collidingAtoms.map(a => `${a.element} (#${a.id})`).join(' and ');
    const jam = crash(ctx, 'ATOM_COLLISION', `CRASH / JAM at hex [${hexKeyStr}]: Atoms ${atomNames} collided!`);
    return buildResult(ctx, ctx.tick, executedCommands, jam);
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
          // Release any arms holding an atom in this consumed molecule
          const consumedIds = new Set(atoms.map(a => a.id));
          for (const arm of ctx.arms) {
            if (arm.heldAtomId && consumedIds.has(arm.heldAtomId)) {
              arm.isHolding = false;
              arm.heldAtomId = null;
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
