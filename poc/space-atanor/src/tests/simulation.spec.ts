import { describe, expect, it } from 'vitest';
import { LEVEL_1_DIMER } from '../core/engine/levels';
import { SimulationEngine } from '../core/engine/simulation';

describe('Level 1 Educational Simulation Loop', () => {
  it('should initialize with inputs and arms in place', () => {
    const engine = new SimulationEngine(LEVEL_1_DIMER);

    // Should have 2 atoms spawned at inputs A and B
    expect(engine.getGraph().getAtoms().length).toBe(2);
    expect(engine.getArms().length).toBe(2);
    expect(engine.productsDelivered).toBe(0);
    expect(engine.hasCrashed).toBe(false);
  });

  it('should successfully synthesize and deliver dimer A-B in a complete cycle', () => {
    const engine = new SimulationEngine(LEVEL_1_DIMER);

    // Cycle 0: GRAB both atoms
    engine.step();
    expect(engine.getArms()[0].isHolding).toBe(true);
    expect(engine.getArms()[1].isHolding).toBe(true);

    // Cycles 1, 2, 3: Rotate towards bonder
    engine.step(); // 1
    engine.step(); // 2
    engine.step(); // 3
    // At end of step 3, atoms are at (-1, 0) and (0, 0), so bonder creates a bond!
    expect(engine.getGraph().getBonds().length).toBe(1);

    // Cycle 4: Arm 1 drops, Arm 2 rotates bonded molecule to (0, 1) [Output Sink!]
    // The molecule is at Output Sink and consumed immediately at end of cycle 4!
    engine.step(); // 4
    expect(engine.getArms()[0].isHolding).toBe(false);
    expect(engine.productsDelivered).toBe(1);
    expect(engine.hasCrashed).toBe(false);

    // Cycles 5..8: Arms rotate back to initial positions
    engine.step(); // 5
    engine.step(); // 6
    engine.step(); // 7
    engine.step(); // 8
    // Cycle 9: Repeat wraps back to 0!
    engine.step(); // 9

    // Verify stats
    const stats = engine.getStats();
    expect(stats.cost).toBeGreaterThan(0);
    expect(stats.area).toBeGreaterThan(0);
    expect(stats.productsDelivered).toBe(1);
  });
});
