// Bug fix (a): the default solution of PoC level 2 ended in a JAM (POC-4, W09 A).
import { describe, expect, it } from 'vitest';
import { LEVEL_2_POC_BROKEN_PROGRAM, LEVEL_2_WATER } from '../engine/levels';
import { SimulationEngine } from '../engine/simulation';
import { LevelConfig } from '../engine/types';

function runUntilDone(engine: SimulationEngine, maxTicks = 200): void {
  while (engine.ticksExecuted < maxTicks && !engine.isCompleted && !engine.hasCrashed) {
    engine.step();
  }
}

describe('Level 2 (Aqua Salis) default solution', () => {
  it('delivers all 6 products without a JAM', () => {
    const engine = new SimulationEngine(LEVEL_2_WATER);
    runUntilDone(engine);

    expect(engine.hasCrashed).toBe(false);
    expect(engine.isCompleted).toBe(true);
    expect(engine.productsDelivered).toBe(6);
    // First product after 4 ticks, then one every 7 ticks: 4 + 5 * 7 = 39.
    expect(engine.completedAtTick).toBe(39);
  });

  it('documents the PoC program: it jams on SALT-SALT at (1,-2) after 9 ticks with 0/6 products', () => {
    const broken: LevelConfig = {
      ...LEVEL_2_WATER,
      defaultInstructions: {
        'arm-1': [...LEVEL_2_POC_BROKEN_PROGRAM['arm-1']],
        'arm-2': [...LEVEL_2_POC_BROKEN_PROGRAM['arm-2']],
      },
    };
    const engine = new SimulationEngine(broken);
    runUntilDone(engine);

    expect(engine.hasCrashed).toBe(true);
    expect(engine.jamReason).toBe('ATOM_COLLISION');
    expect(engine.ticksExecuted).toBe(9);
    expect(engine.productsDelivered).toBe(0);
    expect(engine.crashMessage).toContain('[1,-2]');
    expect(engine.crashMessage).toContain('SALT');
  });
});
