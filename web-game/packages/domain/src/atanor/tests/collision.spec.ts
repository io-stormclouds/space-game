import { describe, expect, it } from 'vitest';
import { MoleculeGraph } from '../graph/molecule';
import { LEVEL_1_DIMER } from '../engine/levels';
import { SimulationEngine } from '../engine/simulation';

describe('Collision and Jam Detection', () => {
  it('should detect when two atoms occupy the same hex', () => {
    const graph = new MoleculeGraph();
    graph.addAtom({ id: 'a1', element: 'A', pos: { q: 1, r: 1 } });
    graph.addAtom({ id: 'a2', element: 'B', pos: { q: 1, r: 1 } });

    const collisions = graph.getCollisions();
    expect(collisions.size).toBe(1);
    expect(collisions.get('1,1')?.length).toBe(2);
  });

  it('should halt simulation on collision during execution', () => {
    // Setup a simulation where Arm 1 moves an atom directly onto another atom
    const engine = new SimulationEngine(LEVEL_1_DIMER);

    // Intentionally configure arm 1 to move onto an existing atom
    engine.setInstruction('arm-1', 0, 'GRAB');
    // Rotate arm-1 3 times directly to bonder hex (-1, 0)
    engine.setInstruction('arm-1', 1, 'ROTATE_CW');
    engine.setInstruction('arm-1', 2, 'ROTATE_CW');
    engine.setInstruction('arm-1', 3, 'ROTATE_CW');

    // Arm 2 does nothing
    for (let i = 0; i < 4; i++) {
      engine.setInstruction('arm-2', i, 'EMPTY');
    }

    // Now manually put an atom at (-1, 0) to cause collision at cycle 3
    engine.getGraph().addAtom({ id: 'obstacle', element: 'SALT', pos: { q: -1, r: 0 } });

    // Step 0: Grab
    engine.step();
    expect(engine.hasCrashed).toBe(false);

    // Step 1: Rotate
    engine.step();
    expect(engine.hasCrashed).toBe(false);

    // Step 2: Rotate
    engine.step();
    expect(engine.hasCrashed).toBe(false);

    // Step 3: Rotate into (-1, 0) where obstacle sits!
    const res3 = engine.step();
    expect(engine.hasCrashed).toBe(true);
    expect(res3.collisionDetected).toBe(true);
    expect(engine.crashMessage).toContain('CRASH');
  });
});
