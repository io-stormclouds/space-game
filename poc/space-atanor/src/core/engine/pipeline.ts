import { HexCoord, hexAdd, hexDirection, hexEquals, hexKey, hexScale, hexSubtract } from '../grid/hex';
import { Atom, AtomType, MoleculeGraph } from '../graph/molecule';
import { ArmCommand, ArmState, Glyph, LevelConfig, SimulationStepResult, TrackSegment } from './types';
import { cloneArm, getGripperPosition } from './arm';

export interface TickContext {
  cycle: number;
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
}

export function executeTick(ctx: TickContext): SimulationStepResult {
  if (ctx.hasCrashed) {
    return {
      cycle: ctx.cycle,
      commandsExecuted: {},
      collisionDetected: true,
      collisionMessage: ctx.crashMessage,
      productsDelivered: ctx.productsDelivered,
      isLevelCompleted: ctx.productsDelivered >= ctx.targetRequired,
      atoms: ctx.graph.getAtoms().map(a => ({ ...a, pos: { ...a.pos } })),
      bonds: ctx.graph.getBonds().map(b => ({ ...b })),
      arms: ctx.arms.map(cloneArm),
    };
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
  // We record transformed molecules to prevent double transformation
  const transformedMolecules = new Set<string>();

  for (const arm of ctx.arms) {
    const cmd = executedCommands[arm.id];

    switch (cmd) {
      case 'ROTATE_CW': {
        const oldBase = { ...arm.basePos };
        arm.rotation = (arm.rotation + 1) % 6;
        if (arm.isHolding && arm.heldAtomId) {
          if (!transformedMolecules.has(arm.heldAtomId)) {
            ctx.graph.rotateMoleculeAround(arm.heldAtomId, oldBase, 1);
            transformedMolecules.add(arm.heldAtomId);
          }
        }
        break;
      }

      case 'ROTATE_CCW': {
        const oldBase = { ...arm.basePos };
        arm.rotation = (arm.rotation + 5) % 6;
        if (arm.isHolding && arm.heldAtomId) {
          if (!transformedMolecules.has(arm.heldAtomId)) {
            ctx.graph.rotateMoleculeAround(arm.heldAtomId, oldBase, -1);
            transformedMolecules.add(arm.heldAtomId);
          }
        }
        break;
      }

      case 'PIVOT_CW': {
        if (arm.isHolding && arm.heldAtomId) {
          const pivotCenter = getGripperPosition(arm);
          if (!transformedMolecules.has(arm.heldAtomId)) {
            ctx.graph.rotateMoleculeAround(arm.heldAtomId, pivotCenter, 1);
            transformedMolecules.add(arm.heldAtomId);
          }
        }
        break;
      }

      case 'PIVOT_CCW': {
        if (arm.isHolding && arm.heldAtomId) {
          const pivotCenter = getGripperPosition(arm);
          if (!transformedMolecules.has(arm.heldAtomId)) {
            ctx.graph.rotateMoleculeAround(arm.heldAtomId, pivotCenter, -1);
            transformedMolecules.add(arm.heldAtomId);
          }
        }
        break;
      }

      case 'EXTEND': {
        if (arm.isPiston && arm.length < 3) {
          const delta = hexDirection(arm.rotation);
          arm.length += 1;
          if (arm.isHolding && arm.heldAtomId) {
            if (!transformedMolecules.has(arm.heldAtomId)) {
              ctx.graph.translateMolecule(arm.heldAtomId, delta);
              transformedMolecules.add(arm.heldAtomId);
            }
          }
        }
        break;
      }

      case 'RETRACT': {
        if (arm.isPiston && arm.length > 1) {
          const delta = hexScale(hexDirection(arm.rotation), -1);
          arm.length -= 1;
          if (arm.isHolding && arm.heldAtomId) {
            if (!transformedMolecules.has(arm.heldAtomId)) {
              ctx.graph.translateMolecule(arm.heldAtomId, delta);
              transformedMolecules.add(arm.heldAtomId);
            }
          }
        }
        break;
      }

      case 'TRACK_POS':
      case 'TRACK_NEG': {
        // Slide the arm's base along its track (if it is attached to one).
        if (arm.trackId) {
          const track = ctx.tracks.find(t => t.id === arm.trackId);
          if (track && track.path.length > 0) {
            let idx = arm.trackIndex ?? 0;
            const step = cmd === 'TRACK_POS' ? 1 : -1;
            const nextIdx = idx + step;
            if (nextIdx >= 0 && nextIdx < track.path.length) {
              const oldBase = { ...arm.basePos };
              idx = nextIdx;
              arm.trackIndex = idx;
              arm.basePos = { ...track.path[idx] };
              // If holding an atom, translate the whole molecule with the base.
              if (arm.isHolding && arm.heldAtomId) {
                if (!transformedMolecules.has(arm.heldAtomId)) {
                  const delta = hexSubtract(arm.basePos, oldBase);
                  ctx.graph.translateMolecule(arm.heldAtomId, delta);
                  transformedMolecules.add(arm.heldAtomId);
                }
              }
            }
          }
        }
        break;
      }

      default:
        // GRAB, DROP, EMPTY, REPEAT do not cause kinematic motion
        break;
    }
  }

  // ==========================================
  // PHASE 3: COLLISION DETECTION
  // ==========================================
  const collisions = ctx.graph.getCollisions();
  if (collisions.size > 0) {
    ctx.hasCrashed = true;
    const firstCollision = Array.from(collisions.entries())[0];
    const [hexKeyStr, collidingAtoms] = firstCollision;
    const atomNames = collidingAtoms.map(a => `${a.element} (#${a.id})`).join(' and ');
    ctx.crashMessage = `CRASH / JAM at hex [${hexKeyStr}]: Atoms ${atomNames} collided!`;

    return {
      cycle: ctx.cycle,
      commandsExecuted: executedCommands,
      collisionDetected: true,
      collisionMessage: ctx.crashMessage,
      productsDelivered: ctx.productsDelivered,
      isLevelCompleted: ctx.productsDelivered >= ctx.targetRequired,
      atoms: ctx.graph.getAtoms().map(a => ({ ...a, pos: { ...a.pos } })),
      bonds: ctx.graph.getBonds().map(b => ({ ...b })),
      arms: ctx.arms.map(cloneArm),
    };
  }

  // ==========================================
  // PHASE 4: REACTIONS & GLYPH INTERACTIONS
  // ==========================================
  // 4a. Bonder Glyphs
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
        }
      }
    }
  }

  // 4c. Input Reagent Glyphs (Generator)
  // If an input hex is vacant, dispense a fresh atom!
  for (const glyph of ctx.glyphs) {
    if (glyph.type === 'INPUT') {
      const existing = ctx.graph.getAtomAt(glyph.pos);
      if (!existing) {
        ctx.atomCounter += 1;
        const newAtom: Atom = {
          id: `atom_${ctx.atomCounter}`,
          element: glyph.element,
          pos: { ...glyph.pos },
        };
        ctx.graph.addAtom(newAtom);
      }
    }
  }

  return {
    cycle: ctx.cycle,
    commandsExecuted: executedCommands,
    collisionDetected: false,
    productsDelivered: ctx.productsDelivered,
    isLevelCompleted: ctx.productsDelivered >= ctx.targetRequired,
    atoms: ctx.graph.getAtoms().map(a => ({ ...a, pos: { ...a.pos } })),
    bonds: ctx.graph.getBonds().map(b => ({ ...b })),
    arms: ctx.arms.map(cloneArm),
  };
}
