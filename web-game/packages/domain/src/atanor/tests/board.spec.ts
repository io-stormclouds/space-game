// AT5 / A8: an atom or gripper leaving the board jams (OFF_BOARD). The board is optional
// (engine option or LevelConfig.boardRadius); without it the board is unlimited, as in the PoC.
import { describe, expect, it } from 'vitest';
import { createAtanorSimulation, getReferenceSolution, listRecipeLevels, measureAtanorSolution, runAtanorSimulation } from '../api';
import { createArm } from '../engine/arm';
import { ATANOR_BUILDING_LEVELS, getAtanorBuildingLevel, validateMachine } from '../engine/building';
import { LEVEL_A_NAD } from '../engine/recipes';
import { SimulationEngine } from '../engine/simulation';
import { LevelConfig } from '../engine/types';

/** Arm on (2,-1) (board edge for radius 2): gripper (1,-1) -> (2,-2) -> (3,-2), off a radius-2 board. */
function edgeLevel(boardRadius?: number): LevelConfig {
  return {
    id: 'test-board',
    name: 'test',
    description: '',
    targetRequired: 1,
    glyphs: [],
    ...(boardRadius !== undefined ? { boardRadius } : {}),
    initialArms: [createArm({ id: 'a', basePos: { q: 2, r: -1 }, rotation: 3, length: 1 })],
    defaultInstructions: { a: ['ROTATE_CW', 'ROTATE_CW', 'REPEAT'] },
  };
}

describe('Board radius', () => {
  it('is unlimited by default (PoC)', () => {
    const engine = new SimulationEngine(edgeLevel());
    for (let i = 0; i < 6; i++) engine.step();
    expect(engine.boardRadius).toBeNull();
    expect(engine.hasCrashed).toBe(false);
  });

  it('jams when a gripper leaves the board (LevelConfig.boardRadius)', () => {
    const engine = new SimulationEngine(edgeLevel(2));
    expect(engine.step().jamReason).toBeNull(); // (1,-1) -> (2,-2): still on the board
    const result = engine.step(); // (2,-2) -> (3,-2)
    expect(result.jamReason).toBe('OFF_BOARD');
    expect(result.jamDetail).toMatchObject({ atomIds: [], armIds: ['a'], hex: { q: 3, r: -2 } });
    expect(result.collisionMessage).toContain('left the board');
    expect(engine.getSnapshot().jam?.reason).toBe('OFF_BOARD');
  });

  it('jams when a carried atom leaves the board; the option overrides the level', () => {
    const level: LevelConfig = {
      id: 'test-board-atom',
      name: 'test',
      description: '',
      targetRequired: 1,
      glyphs: [],
      boardRadius: 9,
      initialArms: [createArm({ id: 'a', basePos: { q: 1, r: 0 }, rotation: 3 })], // gripper (0,0)
      defaultInstructions: { a: ['GRAB', 'ROTATE_CW', 'ROTATE_CW'] },
    };
    const make = (boardRadius?: number) => {
      const engine = new SimulationEngine(level, boardRadius !== undefined ? { boardRadius } : {});
      // Pair (0,0)-(-1,0): the far atom is 2 hexes from the arm base (1,0).
      engine.getGraph().addAtom({ id: 'near', element: 'A', pos: { q: 0, r: 0 } });
      engine.getGraph().addAtom({ id: 'far', element: 'B', pos: { q: -1, r: 0 } });
      engine.getGraph().addBond('near', 'far');
      return engine;
    };

    const roomy = make();
    for (let i = 0; i < 3; i++) roomy.step();
    expect(roomy.boardRadius).toBe(9);
    expect(roomy.hasCrashed).toBe(false);

    const tight = make(1);
    tight.step(); // GRAB
    const result = tight.step(); // far (-1,0) -> (1,-2); the gripper (near) stays within radius 1
    expect(result.jamReason).toBe('OFF_BOARD');
    expect(result.jamDetail?.atomIds).toEqual(['far']);
  });

  it('createAtanorSimulation and measureAtanorSolution accept boardRadius', () => {
    const level = edgeLevel();
    expect(runAtanorSimulation(createAtanorSimulation(level), 10).jam).toBeNull();
    expect(runAtanorSimulation(createAtanorSimulation(level, { boardRadius: 2 }), 10).jam?.reason).toBe('OFF_BOARD');
    expect(measureAtanorSolution(level, undefined, 100, { boardRadius: 2 }).jam?.reason).toBe('OFF_BOARD');
  });

  it('every recipe reference solution stays on the board of its building level', () => {
    for (const level of listRecipeLevels()) {
      const boardRadius = getAtanorBuildingLevel(level.recipe!.buildingLevel)!.boardRadius;
      const metrics = measureAtanorSolution(level, undefined, 2000, { boardRadius });
      expect({ id: level.id, ok: metrics.ok, jam: metrics.jam?.reason ?? null }).toEqual({ id: level.id, ok: true, jam: null });
    }
    expect(ATANOR_BUILDING_LEVELS.map(l => l.boardRadius)).toEqual([2, 3, 4, 5, 6]);
  });

  it('validateMachine reports a gripper that starts off the board', () => {
    const solution = { ...getReferenceSolution(LEVEL_A_NAD), arms: [createArm({ id: 'edge', basePos: { q: 2, r: 0 }, rotation: 0 })] };
    expect(validateMachine(LEVEL_A_NAD, solution, 1)).toContainEqual({
      code: 'OFF_BOARD',
      message: 'Gripper 3,0 is off the board',
      elementId: 'edge',
    });
  });
});
