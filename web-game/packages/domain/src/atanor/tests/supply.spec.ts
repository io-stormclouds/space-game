// Finite input buffers (doc §8.5 p. 1): an atom appears only when the port's buffer holds a
// portion; with an empty port the whole machine waits and the tick does not run.
import { describe, expect, it } from 'vitest';
import { createAtanorSimulation, runAtanorSimulation } from '../api';
import { LEVEL_1_DIMER } from '../engine/levels';
import { LEVEL_A_NAD } from '../engine/recipes';
import { SimulationEngine } from '../engine/simulation';

function stepUntilStarved(engine: SimulationEngine, maxSteps = 500): void {
  for (let i = 0; i < maxSteps && !engine.hasCrashed; i++) {
    if (engine.step().starved) return;
  }
}

describe('Input supply', () => {
  it('is unlimited by default and counts consumed material', () => {
    const engine = new SimulationEngine(LEVEL_1_DIMER);
    for (let i = 0; i < 9; i++) engine.step();

    expect(engine.getSupply()).toBeNull();
    // Initial atoms + one refill per input after the first loop's pick-up.
    expect(engine.getConsumed()).toEqual({ A: 2, B: 2 });
  });

  it('waits while an input is empty and resumes on the same ticks as with unlimited inputs', () => {
    const unlimited = runAtanorSimulation(createAtanorSimulation(LEVEL_A_NAD));
    expect(unlimited.completedAtTick).toBe(69);

    // Exactly 6 × recipe (MIE 2, PLA 1, H2 10): the machine also keeps atoms waiting on its ports.
    const sim = createAtanorSimulation(LEVEL_A_NAD, { supply: { MIE: 12, PLA: 6, H2: 60 } });
    stepUntilStarved(sim);
    expect(sim.productsDelivered).toBe(5);
    expect(sim.ticksExecuted).toBe(62); // the 7th H2 atom is missing

    const waiting = sim.step();
    expect(waiting.starved).toBe(true);
    expect(waiting.tick).toBe(62);
    expect(sim.ticksExecuted).toBe(62);

    sim.addSupply('H2', 10);
    stepUntilStarved(sim);
    expect(sim.ticksExecuted).toBe(66); // now the 13th MIE atom is missing
    expect(sim.productsDelivered).toBe(5);

    sim.addSupply('MIE', 1);
    const done = runAtanorSimulation(sim);
    expect(done.completed).toBe(true);
    expect(done.completedAtTick).toBe(unlimited.completedAtTick);
    expect(done.produced).toEqual({ NAD: 6 });
    expect(done.consumed).toEqual({ PLA: 6, MIE: 13, H2: 70 });
    expect(done.starvedSteps).toBeGreaterThanOrEqual(3);

    // The next PLA is missing now.
    expect(sim.step().starved).toBe(true);
  });

  it('dispenses one atom per portion (H2: 10 units per atom)', () => {
    const sim = createAtanorSimulation(LEVEL_A_NAD, { supply: { MIE: 100, PLA: 100, H2: 25 } });
    stepUntilStarved(sim);

    expect(sim.getSupply()?.['H2']).toBe(5);
    expect(sim.getConsumed()['H2']).toBe(20);
    expect(sim.getSnapshot().starved).toBe(true);
  });

  it('waits from the first step when a buffer is empty at reset', () => {
    const sim = createAtanorSimulation(LEVEL_A_NAD, { supply: { MIE: 10, PLA: 10 } });
    const result = sim.step();

    expect(result.starved).toBe(true);
    expect(sim.ticksExecuted).toBe(0);
    expect(sim.getSnapshot().atoms.map(a => a.element).sort()).toEqual(['MIE', 'PLA']);

    sim.addSupply('H2', 10);
    expect(sim.step().starved).toBe(false);
    expect(sim.ticksExecuted).toBe(1);
  });

  it('reset() restores the initial buffers', () => {
    const sim = createAtanorSimulation(LEVEL_A_NAD, { supply: { MIE: 4, PLA: 2, H2: 20 } });
    stepUntilStarved(sim);
    sim.addSupply('PLA', 5);
    sim.reset();

    // Initial atoms already took one portion of each.
    expect(sim.getSupply()).toEqual({ MIE: 3, PLA: 1, H2: 10 });
    expect(sim.getConsumed()).toEqual({ PLA: 1, MIE: 1, H2: 10 });
    expect(sim.starvedSteps).toBe(0);
  });
});
