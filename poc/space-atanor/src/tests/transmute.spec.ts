import { describe, expect, it } from 'vitest';
import { LEVEL_3_TRANSMUTE } from '../core/engine/levels';
import { SimulationEngine } from '../core/engine/simulation';

describe('Level 3 Transmutation Simulation', () => {
  it('should transmute LEAD into GOLD when the atom crosses the transmute glyph', () => {
    const engine = new SimulationEngine(LEVEL_3_TRANSMUTE);

    // Run enough cycles to let the atom cross the transmute glyph and be delivered.
    let sawGold = false;
    for (let i = 0; i < 6; i++) {
      engine.step();
      const atoms = engine.getGraph().getAtoms();
      if (atoms.some(a => a.element === 'GOLD')) {
        sawGold = true;
      }
    }
    expect(sawGold).toBe(true);
    // The GOLD atom should have been consumed by the output sink.
    expect(engine.productsDelivered).toBeGreaterThanOrEqual(1);
    expect(engine.hasCrashed).toBe(false);
  });
});
