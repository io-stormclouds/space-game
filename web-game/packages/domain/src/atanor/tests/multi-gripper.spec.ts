// AT5 / §8.1 L4: multi-gripper arms (2, 3 or 6 grippers spaced 180° / 120° / 60°). GRAB and DROP act
// on every gripper; each gripper carries its molecule; the molecule-conflict rule (fix c) applies.
import { describe, expect, it } from 'vitest';
import { createAtanorSimulation, getReferenceSolution } from '../api';
import {
  createArm,
  getArmCost,
  getGripperPositions,
  getHeldAtomIds,
  gripperCount,
  gripperRotations,
} from '../engine/arm';
import { machineMaterials, validateMachine } from '../engine/building';
import { createOutputGlyph } from '../engine/glyph';
import { LEVEL_A_NAD, LEVEL_A_PRO } from '../engine/recipes';
import { SimulationEngine } from '../engine/simulation';
import { ArmCommand, ArmState, Glyph, LevelConfig } from '../engine/types';
import { Atom } from '../graph/molecule';

function machine(arm: ArmState, program: (ArmCommand | null)[], atoms: Atom[], glyphs: Glyph[] = []): SimulationEngine {
  const level: LevelConfig = {
    id: 'test-multi',
    name: 'test',
    description: '',
    targetRequired: 10,
    glyphs,
    initialArms: [arm],
    defaultInstructions: { [arm.id]: program },
  };
  const engine = new SimulationEngine(level);
  for (const atom of atoms) engine.getGraph().addAtom(atom);
  return engine;
}

const posOf = (engine: SimulationEngine, id: string) => engine.getGraph().getAtom(id)?.pos;

describe('Multi-gripper arms', () => {
  it('space 2, 3 or 6 grippers evenly from the arm rotation', () => {
    const base = { q: 0, r: 0 };
    expect(gripperRotations(createArm({ id: 'a', basePos: base, rotation: 1, grippers: 2 }))).toEqual([1, 4]);
    expect(gripperRotations(createArm({ id: 'a', basePos: base, rotation: 1, grippers: 3 }))).toEqual([1, 3, 5]);
    expect(gripperRotations(createArm({ id: 'a', basePos: base, rotation: 0, grippers: 6 }))).toEqual([0, 1, 2, 3, 4, 5]);
    expect(getGripperPositions(createArm({ id: 'a', basePos: base, rotation: 0, length: 2, grippers: 2 }))).toEqual([
      { q: 2, r: 0 },
      { q: -2, r: 0 },
    ]);
    const single = createArm({ id: 'a', basePos: base });
    expect(single.grippers).toBeUndefined();
    expect(gripperCount(single)).toBe(1);
    expect(() => createArm({ id: 'a', basePos: base, grippers: 4 })).toThrow();
  });

  it('GRAB closes every gripper on its atom, ROTATE carries them all, DROP opens all', () => {
    const engine = machine(createArm({ id: 'bi', basePos: { q: 0, r: 0 }, rotation: 0, grippers: 2 }), ['GRAB', 'ROTATE_CW', 'DROP', 'ROTATE_CW'], [
      { id: 'x', element: 'A', pos: { q: 1, r: 0 } },
      { id: 'y', element: 'B', pos: { q: -1, r: 0 } },
    ]);
    engine.step();
    const arm = engine.getArms()[0];
    expect(getHeldAtomIds(arm)).toEqual(['x', 'y']);
    expect(arm.isHolding).toBe(true);
    expect(arm.heldAtomId).toBe('x');

    engine.step();
    expect(posOf(engine, 'x')).toEqual({ q: 0, r: 1 });
    expect(posOf(engine, 'y')).toEqual({ q: 0, r: -1 });

    engine.step();
    expect(getHeldAtomIds(engine.getArms()[0])).toEqual([null, null]);
    expect(engine.getArms()[0].isHolding).toBe(false);
    engine.step();
    expect(posOf(engine, 'x')).toEqual({ q: 0, r: 1 });
    expect(engine.hasCrashed).toBe(false);
  });

  it('a gripper over an empty hex stays open; the arm still holds with the other one', () => {
    const engine = machine(createArm({ id: 'tri', basePos: { q: 0, r: 0 }, rotation: 0, grippers: 3 }), ['GRAB'], [
      { id: 'x', element: 'A', pos: { q: -1, r: 1 } },
    ]);
    engine.step();
    const arm = engine.getArms()[0];
    expect(getHeldAtomIds(arm)).toEqual([null, 'x', null]);
    expect(arm.heldAtomId).toBe('x');
  });

  it('one molecule on two grippers of one arm: ROTATE moves it once, PIVOT pulls it apart (fix c)', () => {
    const pair = (): Atom[] => [
      { id: 'x', element: 'A', pos: { q: 1, r: 0 } },
      { id: 'y', element: 'B', pos: { q: 0, r: 1 } },
    ];
    const hexa = () => createArm({ id: 'hexa', basePos: { q: 0, r: 0 }, rotation: 0, grippers: 6 });

    const turning = machine(hexa(), ['GRAB', 'ROTATE_CW'], pair());
    turning.getGraph().addBond('x', 'y');
    turning.step();
    turning.step();
    expect(turning.hasCrashed).toBe(false);
    expect(posOf(turning, 'x')).toEqual({ q: 0, r: 1 });
    expect(posOf(turning, 'y')).toEqual({ q: -1, r: 1 });

    const pivoting = machine(hexa(), ['GRAB', 'PIVOT_CW'], pair());
    pivoting.getGraph().addBond('x', 'y');
    pivoting.step();
    const result = pivoting.step();
    expect(result.jamReason).toBe('MOLECULE_CONFLICT');
    expect(result.jamDetail?.armIds).toEqual(['hexa']);
    expect(posOf(pivoting, 'x')).toEqual({ q: 1, r: 0 });
  });

  it('PIVOT turns each held molecule around its own gripper', () => {
    const engine = machine(createArm({ id: 'bi', basePos: { q: 0, r: 0 }, rotation: 0, length: 1, grippers: 2 }), ['GRAB', 'PIVOT_CW'], [
      { id: 'x', element: 'A', pos: { q: 1, r: 0 } },
      { id: 'x2', element: 'A', pos: { q: 2, r: 0 } },
      { id: 'y', element: 'B', pos: { q: -1, r: 0 } },
      { id: 'y2', element: 'B', pos: { q: -2, r: 0 } },
    ]);
    engine.getGraph().addBond('x', 'x2');
    engine.getGraph().addBond('y', 'y2');
    engine.step();
    engine.step();
    expect(engine.hasCrashed).toBe(false);
    expect(posOf(engine, 'x')).toEqual({ q: 1, r: 0 });
    expect(posOf(engine, 'x2')).toEqual({ q: 1, r: 1 }); // around (1,0)
    expect(posOf(engine, 'y2')).toEqual({ q: -1, r: -1 }); // around (-1,0)
  });

  it('an output releases only the grippers on the delivered molecule', () => {
    const output = createOutputGlyph('out', { q: 0, r: 1 }, { name: 'A', elements: ['A'], relativeHexOffsets: [{ q: 0, r: 0 }], bonds: [] });
    const engine = machine(
      createArm({ id: 'bi', basePos: { q: 0, r: 0 }, rotation: 0, grippers: 2 }),
      ['GRAB', 'ROTATE_CW'],
      [
        { id: 'x', element: 'A', pos: { q: 1, r: 0 } },
        { id: 'y', element: 'B', pos: { q: -1, r: 0 } },
      ],
      [output]
    );
    engine.step();
    engine.step(); // x lands on the output (0,1)
    expect(engine.productsDelivered).toBe(1);
    const arm = engine.getArms()[0];
    expect(getHeldAtomIds(arm)).toEqual([null, 'y']);
    expect(arm.heldAtomId).toBe('y');
    expect(arm.isHolding).toBe(true);
  });

  it('A_PRO grabs UKL, UKL and NAD with one GRAB of its 3-gripper arm', () => {
    const sim = createAtanorSimulation(LEVEL_A_PRO);
    sim.step(); // turn onto the inputs
    sim.step(); // GRAB
    const tri = sim.getArms().find(a => a.id === 'arm-1')!;
    const held = getHeldAtomIds(tri).map(id => sim.getGraph().getAtom(id!)?.element);
    expect(held.sort()).toEqual(['NAD', 'UKL', 'UKL']);
  });

  it('are locked below building level 4 and need 1, 2, 3 or 6 grippers', () => {
    const pro = getReferenceSolution(LEVEL_A_PRO);
    expect(validateMachine(LEVEL_A_PRO, pro, 4)).toEqual([]);
    expect(validateMachine(LEVEL_A_PRO, pro, 3).map(i => [i.code, i.elementId ?? ''])).toEqual([
      ['RECIPE_LOCKED', ''],
      ['MULTI_GRIPPER_LOCKED', 'arm-1'],
    ]);
    const odd = { ...getReferenceSolution(LEVEL_A_NAD), arms: [{ ...createArm({ id: 'odd', basePos: { q: 0, r: 0 } }), grippers: 4 }] };
    expect(validateMachine(LEVEL_A_NAD, odd, 5).map(i => i.code)).toEqual(['GRIPPER_COUNT_INVALID']);
  });

  it('cost: each extra gripper +10 PoC points and +2 STA (proposal)', () => {
    const tri = createArm({ id: 'tri', basePos: { q: 0, r: 0 }, grippers: 3 });
    expect(getArmCost(tri)).toBe(40);
    expect(machineMaterials({ arms: [tri], glyphs: [], tracks: [], program: {} })).toEqual({ STA: 8, SLN: 1 });
    expect(getArmCost(createArm({ id: 'hexa', basePos: { q: 0, r: 0 }, grippers: 6 }))).toBe(70);
  });
});
