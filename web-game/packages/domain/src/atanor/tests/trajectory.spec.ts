// AT5 / POC-6: collisions inside a tick. The PoC compared end positions only, so atoms and grippers
// could pass through each other. Motions are sampled at TRAJECTORY_SUBSTEPS fixed sub-steps.
import { describe, expect, it } from 'vitest';
import { createAtanorSimulation, getReferenceSolution, runAtanorSimulation } from '../api';
import { createArm } from '../engine/arm';
import { LEVEL_A_KAT, LEVEL_A_PRO } from '../engine/recipes';
import { SimulationEngine } from '../engine/simulation';
import {
  distanceSquared,
  hexToPoint,
  Motion,
  motionEnd,
  motionPoint,
  TRAJECTORY_CLEARANCE,
  TRAJECTORY_SUBSTEPS,
} from '../engine/trajectory';
import { ArmCommand, ArmState, LevelConfig, TrackSegment } from '../engine/types';
import { Atom } from '../graph/molecule';

function machine(
  arms: ArmState[],
  program: Record<string, (ArmCommand | null)[]>,
  atoms: Atom[] = [],
  tracks?: TrackSegment[]
): SimulationEngine {
  const level: LevelConfig = {
    id: 'test-trajectory',
    name: 'test',
    description: '',
    targetRequired: 1,
    glyphs: [],
    ...(tracks ? { tracks } : {}),
    initialArms: arms,
    defaultInstructions: program,
  };
  const engine = new SimulationEngine(level);
  for (const atom of atoms) engine.getGraph().addAtom(atom);
  return engine;
}

describe('Motion inside a tick', () => {
  it('ends exactly where the hex arithmetic puts it (CW = +60°, like hexRotateAround)', () => {
    const motions: Motion[] = [
      { kind: 'rotate', center: { q: 1, r: -1 }, steps: 1 },
      { kind: 'rotate', center: { q: 1, r: -1 }, steps: -1 },
      { kind: 'translate', delta: { q: 0, r: -1 } },
    ];
    for (const motion of motions) {
      for (const pos of [{ q: 3, r: -1 }, { q: -2, r: 2 }, { q: 1, r: -1 }]) {
        const start = motionPoint(motion, pos, 0);
        const end = motionPoint(motion, pos, TRAJECTORY_SUBSTEPS);
        expect(distanceSquared(start, hexToPoint(pos))).toBeLessThan(1e-12);
        expect(distanceSquared(end, hexToPoint(motionEnd(motion, pos)))).toBeLessThan(1e-12);
      }
    }
  });

  it('jams when an atom on a length-2 arm passes through an atom resting between start and end', () => {
    // Gripper (2,0) -> (0,2) around (0,0); the resting atom sits on (1,1), 0.27 from the arc.
    const engine = machine(
      [createArm({ id: 'long', basePos: { q: 0, r: 0 }, rotation: 0, length: 2 })],
      { long: ['GRAB', 'ROTATE_CW'] },
      [
        { id: 'moving', element: 'A', pos: { q: 2, r: 0 } },
        { id: 'resting', element: 'B', pos: { q: 1, r: 1 } },
      ]
    );
    engine.step();
    const result = engine.step();

    expect(result.jamReason).toBe('TRAJECTORY_COLLISION');
    expect(result.collisionMessage).toContain('CRASH');
    expect(result.jamDetail).toMatchObject({ atomIds: ['moving', 'resting'], armIds: [], hex: { q: 1, r: 1 } });
    expect(result.jamDetail!.t).toBeGreaterThan(0);
    expect(result.jamDetail!.t).toBeLessThan(1);
    // The end hexes differ: the PoC rule alone saw no collision.
    expect(engine.getGraph().getAtom('moving')?.pos).toEqual({ q: 0, r: 2 });
    expect(engine.getSnapshot().jam?.detail?.atomIds).toEqual(['moving', 'resting']);
  });

  it('lets a length-1 arm pass an atom on the outer corner hex (0.73 > clearance)', () => {
    expect(TRAJECTORY_CLEARANCE).toBeLessThan(Math.sqrt(3) - 1);
    const engine = machine(
      [createArm({ id: 'short', basePos: { q: 0, r: 0 }, rotation: 0, length: 1 })],
      { short: ['GRAB', 'ROTATE_CW', 'ROTATE_CCW'] },
      [
        { id: 'moving', element: 'A', pos: { q: 1, r: 0 } },
        { id: 'corner', element: 'B', pos: { q: 1, r: 1 } },
      ]
    );
    for (let i = 0; i < 3; i++) engine.step();
    expect(engine.hasCrashed).toBe(false);
    expect(engine.getGraph().getAtom('moving')?.pos).toEqual({ q: 1, r: 0 });
  });

  it('jams when two carried atoms swap places', () => {
    // a: (1,0) -> (0,1) around (0,0); b: (0,1) -> (1,0) around (1,1). No shared end hex.
    const engine = machine(
      [
        createArm({ id: 'a', basePos: { q: 0, r: 0 }, rotation: 0 }),
        createArm({ id: 'b', basePos: { q: 1, r: 1 }, rotation: 3 }),
      ],
      { a: ['GRAB', 'ROTATE_CW'], b: ['GRAB', 'ROTATE_CW'] },
      [
        { id: 'x', element: 'A', pos: { q: 1, r: 0 } },
        { id: 'y', element: 'B', pos: { q: 0, r: 1 } },
      ]
    );
    engine.step();
    const result = engine.step();
    expect(result.jamReason).toBe('TRAJECTORY_COLLISION');
    expect([...result.jamDetail!.atomIds].sort()).toEqual(['x', 'y']);
  });

  it('keeps ATOM_COLLISION when atoms end on the same hex (PoC rule first)', () => {
    const engine = machine(
      [createArm({ id: 'a', basePos: { q: 0, r: 0 }, rotation: 0 })],
      { a: ['GRAB', 'ROTATE_CW'] },
      [
        { id: 'x', element: 'A', pos: { q: 1, r: 0 } },
        { id: 'y', element: 'B', pos: { q: 0, r: 1 } },
      ]
    );
    engine.step();
    expect(engine.step().jamReason).toBe('ATOM_COLLISION');
    expect(engine.jamDetail).toMatchObject({ hex: { q: 0, r: 1 }, t: 1 });
  });

  it('lets an empty gripper pass over atoms', () => {
    const engine = machine(
      [createArm({ id: 'a', basePos: { q: 0, r: 0 }, rotation: 0 })],
      { a: ['ROTATE_CW', 'ROTATE_CW'] },
      [{ id: 'x', element: 'A', pos: { q: 0, r: 1 } }]
    );
    engine.step();
    engine.step();
    expect(engine.hasCrashed).toBe(false);
  });

  it('is deterministic: two runs give the same snapshots', () => {
    const run = () => {
      const sim = createAtanorSimulation(LEVEL_A_PRO);
      const ticks = [];
      for (let i = 0; i < 40; i++) ticks.push(sim.step());
      return { ticks, snapshot: sim.getSnapshot(), stats: sim.getStats() };
    };
    expect(run()).toEqual(run());
  });
});

describe('Gripper collisions', () => {
  it('jams when two empty grippers turn onto the same hex', () => {
    const engine = machine(
      [
        createArm({ id: 'a', basePos: { q: 0, r: 0 }, rotation: 0 }), // (1,0) -> (0,1)
        createArm({ id: 'b', basePos: { q: 1, r: 1 }, rotation: 2 }), // (0,2) -> (0,1)
      ],
      { a: ['ROTATE_CW'], b: ['ROTATE_CW'] }
    );
    const result = engine.step();
    expect(result.jamReason).toBe('ARM_COLLISION');
    expect(result.jamDetail?.armIds).toEqual(['a', 'b']);
    expect(result.collisionMessage).toContain('CRASH');
  });

  it('does not jam two grippers that hold the same atom and move it together', () => {
    const engine = machine(
      [
        { ...createArm({ id: 'a', basePos: { q: 0, r: 0 }, rotation: 1 }), trackId: 't1' },
        { ...createArm({ id: 'b', basePos: { q: 0, r: 2 }, rotation: 4 }), trackId: 't2' },
      ],
      { a: ['GRAB', 'TRACK_POS'], b: ['GRAB', 'TRACK_POS'] },
      [{ id: 'x', element: 'A', pos: { q: 0, r: 1 } }],
      [
        { id: 't1', path: [{ q: 0, r: 0 }, { q: 1, r: 0 }] },
        { id: 't2', path: [{ q: 0, r: 2 }, { q: 1, r: 2 }] },
      ]
    );
    engine.step();
    engine.step();
    expect(engine.hasCrashed).toBe(false);
    expect(engine.getGraph().getAtom('x')?.pos).toEqual({ q: 1, r: 1 });
  });

  it('documents the previous A_KAT program: arm-2 turned its gripper onto arm-1’s gripper', () => {
    const reference = getReferenceSolution(LEVEL_A_KAT);
    const previous = {
      ...reference,
      program: { ...reference.program, 'arm-2': ['GRAB', 'ROTATE_CW', 'EMPTY', 'ROTATE_CW', 'ROTATE_CCW', 'ROTATE_CCW', 'REPEAT'] as ArmCommand[] },
    };
    const snapshot = runAtanorSimulation(createAtanorSimulation(LEVEL_A_KAT, { solution: previous }), 50);

    expect(snapshot.jam?.reason).toBe('ARM_COLLISION');
    expect(snapshot.jam?.detail).toMatchObject({ armIds: ['arm-1', 'arm-2'], hex: { q: 0, r: 0 } });
    expect(snapshot.ticks).toBe(4);
  });
});
