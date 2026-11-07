import { describe, expect, it } from 'vitest';
import { LEVEL_4_TRACK } from '../core/engine/levels';
import { SimulationEngine } from '../core/engine/simulation';

describe('Level 4 Track Simulation', () => {
  it('should slide the arm along its track and deliver the atom', () => {
    const engine = new SimulationEngine(LEVEL_4_TRACK);
    const arm = engine.getArms()[0];
    expect(arm.trackId).toBe('track-main');
    expect(arm.trackIndex).toBe(0);
    expect(arm.basePos).toEqual({ q: -1, r: 0 });

    // Run the default program for long enough to deliver a product.
    let delivered = 0;
    for (let i = 0; i < 12; i++) {
      engine.step();
      if (engine.productsDelivered > delivered) delivered = engine.productsDelivered;
    }
    expect(delivered).toBeGreaterThanOrEqual(1);
    expect(engine.hasCrashed).toBe(false);
  });
});
