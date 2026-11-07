// Bug fix (c): a molecule held by two arms was transformed once per arm (the PoC guarded by the
// held atom ID, not by molecule). Reproduced on the verbatim port: with the setup of the
// "different centres" test the bonded pair ended at (2,0) and (1,0) — rotated around (0,0) and
// then again around (0,3) — with no JAM, and arm a1's gripper no longer on its atom.
import { describe, expect, it } from 'vitest';
import { createArm, getGripperPosition } from '../engine/arm';
import { LEVEL_1_DIMER } from '../engine/levels';
import { SimulationEngine } from '../engine/simulation';
import { ArmCommand, LevelConfig, TrackSegment } from '../engine/types';

/** Two arms holding the two atoms of one bonded pair: x at (0,1), y at (0,2). */
function twoArmPair(
  program: Record<string, (ArmCommand | null)[]>,
  options: { tracks?: TrackSegment[] } = {}
): SimulationEngine {
  const onTracks = options.tracks !== undefined;
  const level: LevelConfig = {
    id: 'test-two-arms',
    name: 'test',
    description: '',
    targetRequired: 1,
    glyphs: [],
    ...(options.tracks ? { tracks: options.tracks } : {}),
    initialArms: [
      { ...createArm({ id: 'a1', basePos: { q: 0, r: 0 }, rotation: 1 }), ...(onTracks ? { trackId: 't1' } : {}) },
      { ...createArm({ id: 'a2', basePos: { q: 0, r: 3 }, rotation: 4 }), ...(onTracks ? { trackId: 't2' } : {}) },
    ],
    defaultInstructions: program,
  };
  const engine = new SimulationEngine(level);
  const graph = engine.getGraph();
  graph.addAtom({ id: 'x', element: 'A', pos: { q: 0, r: 1 } });
  graph.addAtom({ id: 'y', element: 'B', pos: { q: 0, r: 2 } });
  graph.addBond('x', 'y');
  return engine;
}

const posOf = (engine: SimulationEngine, id: string) => engine.getGraph().getAtom(id)?.pos;

describe('Molecule held by two arms', () => {
  it('moves only once when both arms move it the same way (parallel tracks)', () => {
    const engine = twoArmPair(
      { a1: ['GRAB', 'TRACK_POS'], a2: ['GRAB', 'TRACK_POS'] },
      {
        tracks: [
          { id: 't1', path: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }] },
          { id: 't2', path: [{ q: 0, r: 3 }, { q: 1, r: 3 }, { q: 2, r: 3 }] },
        ],
      }
    );
    engine.step();
    engine.step();

    expect(engine.hasCrashed).toBe(false);
    // PoC: translated twice, to (2,1) and (2,2).
    expect(posOf(engine, 'x')).toEqual({ q: 1, r: 1 });
    expect(posOf(engine, 'y')).toEqual({ q: 1, r: 2 });
    const [a1, a2] = engine.getArms();
    expect(getGripperPosition(a1)).toEqual({ q: 1, r: 1 });
    expect(getGripperPosition(a2)).toEqual({ q: 1, r: 2 });
  });

  it('jams instead of rotating twice when two arms rotate it around different centres', () => {
    const engine = twoArmPair({ a1: ['GRAB', 'ROTATE_CW'], a2: ['GRAB', 'ROTATE_CW'] });
    engine.step();
    const result = engine.step();

    expect(result.collisionDetected).toBe(true);
    expect(result.jamReason).toBe('MOLECULE_CONFLICT');
    expect(engine.hasCrashed).toBe(true);
    expect(engine.crashMessage).toContain('CRASH');
    // The molecule is not moved at all (PoC: x (2,0), y (1,0)).
    expect(posOf(engine, 'x')).toEqual({ q: 0, r: 1 });
    expect(posOf(engine, 'y')).toEqual({ q: 0, r: 2 });
  });

  it('jams when one arm moves the molecule while another arm holds it still', () => {
    const engine = twoArmPair({ a1: ['GRAB', 'ROTATE_CW'], a2: ['GRAB', 'EMPTY'] });
    engine.step();
    engine.step();

    expect(engine.hasCrashed).toBe(true);
    expect(engine.jamReason).toBe('MOLECULE_CONFLICT');
  });

  it('lets an arm drop the molecule in the same tick another arm moves it', () => {
    const engine = twoArmPair({ a1: ['GRAB', 'ROTATE_CW'], a2: ['GRAB', 'DROP'] });
    engine.step();
    engine.step();

    expect(engine.hasCrashed).toBe(false);
    // Rotated once around a1's base (0,0).
    expect(posOf(engine, 'x')).toEqual({ q: -1, r: 1 });
    expect(posOf(engine, 'y')).toEqual({ q: -2, r: 2 });
    expect(getGripperPosition(engine.getArms()[0])).toEqual({ q: -1, r: 1 });
  });

  it('keeps every holding gripper on its atom over a whole level run', () => {
    const engine = new SimulationEngine(LEVEL_1_DIMER);
    for (let i = 0; i < 60; i++) {
      engine.step();
      for (const arm of engine.getArms()) {
        if (arm.isHolding && arm.heldAtomId) {
          expect(engine.getGraph().getAtom(arm.heldAtomId)?.pos).toEqual(getGripperPosition(arm));
        }
      }
    }
    expect(engine.hasCrashed).toBe(false);
  });
});
