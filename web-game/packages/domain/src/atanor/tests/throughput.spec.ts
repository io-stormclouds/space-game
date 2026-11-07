// Steady-state throughput (doc §8.4, §8.5 p. 3): cycles per product from the machine's loop.
import { describe, expect, it } from 'vitest';
import { ATANOR_LEVELS, emptySolution, measureAtanorSolution } from '../api';
import { LEVEL_1_DIMER, LEVEL_2_POC_BROKEN_PROGRAM, LEVEL_2_WATER } from '../engine/levels';
import { SimulationEngine } from '../engine/simulation';
import { machineStateKey, measureThroughput } from '../engine/throughput';

describe('Throughput metrics', () => {
  it('level 1: one product every 9 ticks after the first on tick 5', () => {
    const metrics = measureAtanorSolution(LEVEL_1_DIMER);

    expect(metrics.ok).toBe(true);
    expect(metrics.cyclesPerOutput).toBe(9);
    expect(metrics.periodTicks).toBe(9);
    expect(metrics.outputsPerPeriod).toBe(1);
    expect(metrics.firstOutputTick).toBe(5);
    expect(metrics.ticksToTarget).toBe(50);
    expect(metrics.inputsPerOutput).toEqual({ A: 1, B: 1 });
  });

  it('level 2 (fixed program): one product every 7 ticks', () => {
    expect(measureAtanorSolution(LEVEL_2_WATER).cyclesPerOutput).toBe(7);
  });

  it('every shipped level runs in a productive loop', () => {
    for (const level of ATANOR_LEVELS) {
      const metrics = measureAtanorSolution(level);
      expect({ level: level.id, ok: metrics.ok }).toEqual({ level: level.id, ok: true });
      expect(metrics.ticksToTarget).not.toBeNull();
    }
  });

  it('reports a JAM', () => {
    const broken = {
      'arm-1': [...LEVEL_2_POC_BROKEN_PROGRAM['arm-1']],
      'arm-2': [...LEVEL_2_POC_BROKEN_PROGRAM['arm-2']],
    };
    const metrics = measureThroughput(new SimulationEngine({ ...LEVEL_2_WATER, defaultInstructions: broken }));

    expect(metrics.ok).toBe(false);
    expect(metrics.problem).toBe('JAM');
    expect(metrics.jam?.reason).toBe('ATOM_COLLISION');
    expect(metrics.cyclesPerOutput).toBeNull();
  });

  it('reports a machine that loops without output', () => {
    const metrics = measureAtanorSolution(LEVEL_1_DIMER, emptySolution());

    expect(metrics.ok).toBe(false);
    expect(metrics.problem).toBe('NO_OUTPUT');
    expect(metrics.periodTicks).toBe(16); // only the playhead moves; it wraps after 16 slots
  });

  it('state keys do not depend on atom ids', () => {
    const engine = new SimulationEngine(LEVEL_1_DIMER);
    engine.step();
    const key = machineStateKey(engine);
    const ids = engine.getGraph().getAtoms().map(a => a.id);
    for (let i = 0; i < 9; i++) engine.step(); // one full loop: same state, fresh atoms

    expect(machineStateKey(engine)).toBe(key);
    expect(engine.getGraph().getAtoms().map(a => a.id)).not.toEqual(ids);
  });
});
