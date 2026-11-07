// Bug fix (b): the PoC "CYKLE" counter showed the timeline position, which wraps to 0 on REPEAT
// (POC-5). The engine now counts executed ticks.
import { describe, expect, it } from 'vitest';
import { LEVEL_1_DIMER } from '../engine/levels';
import { SimulationEngine } from '../engine/simulation';

describe('Cycle counter', () => {
  it('counts executed ticks across REPEAT wraps; the playhead is reported separately', () => {
    const engine = new SimulationEngine(LEVEL_1_DIMER);
    while (!engine.isCompleted && engine.ticksExecuted < 200) {
      engine.step();
    }

    // Level 1 loops every 9 ticks; product 1 on tick 5, product 6 on tick 5 + 5 * 9 = 50.
    expect(engine.ticksExecuted).toBe(50);
    expect(engine.completedAtTick).toBe(50);
    // The PoC showed this value (playhead after slot 4) as "CYKLE": 5.
    expect(engine.currentCycle).toBe(5);

    const stats = engine.getStats();
    expect(stats.cycles).toBe(50);
    expect(stats.timelinePosition).toBe(5);
    expect(engine.getSnapshot().ticks).toBe(50);
    expect(engine.getSnapshot().timelinePosition).toBe(5);
    expect(engine.getDeliveryTicks()).toEqual([5, 14, 23, 32, 41, 50]);
  });

  it('numbers step results with the tick counter and keeps counting after completion', () => {
    const engine = new SimulationEngine(LEVEL_1_DIMER);
    const ticks: number[] = [];
    const slots: number[] = [];
    for (let i = 0; i < 20; i++) {
      const result = engine.step();
      ticks.push(result.tick);
      slots.push(result.cycle);
    }
    expect(ticks).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    // Slots 0..8, then REPEAT at slot 9 wraps to 0.
    expect(slots).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 1]);
  });

  it('does not count ticks after a JAM and resets to 0', () => {
    const engine = new SimulationEngine(LEVEL_1_DIMER);
    engine.getGraph().addAtom({ id: 'obstacle', element: 'SALT', pos: { q: -2, r: -1 } });
    engine.step(); // GRAB
    engine.step(); // rotate onto the obstacle -> JAM
    expect(engine.hasCrashed).toBe(true);
    const result = engine.step();
    expect(result.tick).toBe(2);
    expect(engine.ticksExecuted).toBe(2);

    engine.reset();
    expect(engine.ticksExecuted).toBe(0);
    expect(engine.completedAtTick).toBeNull();
    expect(engine.getStats().cycles).toBe(0);
  });
});
