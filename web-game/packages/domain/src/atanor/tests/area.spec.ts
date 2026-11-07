// Extra bug fix: the PoC sampled area only at the end of a tick, after outputs had consumed
// delivered molecules, so the hexes a product was delivered on were never counted.
import { describe, expect, it } from 'vitest';
import { hexDistance } from '../grid/hex';
import { LEVEL_1_DIMER } from '../engine/levels';
import { LEVEL_A_NAD } from '../engine/recipes';
import { SimulationEngine } from '../engine/simulation';

describe('Area metric', () => {
  it('counts the hexes on which a product is delivered', () => {
    const engine = new SimulationEngine(LEVEL_A_NAD);
    for (let i = 0; i < 9; i++) engine.step(); // first NAD delivered on tick 9

    const output = { q: -1, r: 2 };
    // No gripper ever reaches the output hex: only the delivered MIE atom does.
    for (const arm of engine.getArms()) {
      expect(hexDistance(arm.basePos, output)).toBeGreaterThan(arm.length);
    }
    expect(engine.productsDelivered).toBe(1);
    expect(engine.getVisitedHexes()).toContainEqual(output);
  });

  it('level 1 area is 12 (the PoC reported 11, missing the A atom delivered at (-1,2))', () => {
    const engine = new SimulationEngine(LEVEL_1_DIMER);
    for (let i = 0; i < 60; i++) engine.step();

    expect(engine.getVisitedHexes()).toContainEqual({ q: -1, r: 2 });
    expect(engine.getStats().area).toBe(12);
  });
});
