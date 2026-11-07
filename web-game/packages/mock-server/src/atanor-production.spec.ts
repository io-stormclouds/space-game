import { describe, expect, it } from 'vitest';
import { Atanor, TC_E, computeEconomy, powerBalance, type DomainEvent, type Simulation } from '@space-game/domain';
import { buildFactory } from './factory';

// AT4 (A17): the Fabryka atanorowa produces with the player's machine, on the Atanor engine.

const eco = computeEconomy();
const level = Atanor.findRecipeLevel('A_NAD')!;
const reference = () => Atanor.getReferenceSolution(level);

function setup(): { sim: Simulation; atn: string } {
  const sim = buildFactory(eco);
  return { sim, atn: sim.world.structures.find((s) => s.kind === 'ATN')!.id };
}

function run(sim: Simulation, minutes: number, dt = 0.5): DomainEvent[] {
  const all: DomainEvent[] = [];
  for (let t = 0; t < minutes; t += dt) all.push(...sim.step(dt));
  return all;
}

const stock = (sim: Simulation, code: string) => sim.world.storage[TC_E]?.[code] ?? 0;

function deployed(sim: Simulation, atn: string): void {
  const events = sim.dispatch({ type: 'DEPLOY_ATANOR', structureId: atn, solution: reference() });
  expect(events[0]?.type).toBe('ATANOR_DEPLOY_STARTED');
  const deploy = sim.world.machines![atn]!.deploy!;
  run(sim, deploy.total + 1);
  expect(sim.world.machines![atn]!.program).not.toBeNull();
}

describe('Fabryka atanorowa production from the machine (AT4)', () => {
  it('a batch recipe no longer runs: without a program the factory makes nothing', () => {
    const { sim } = setup();
    const before = { MIE: stock(sim, 'MIE'), NAD: stock(sim, 'NAD') };
    run(sim, 60);
    expect({ MIE: stock(sim, 'MIE'), NAD: stock(sim, 'NAD') }).toEqual(before);
  });

  it('deploying pays the machine materials and takes time proportional to their value (A19)', () => {
    const { sim, atn } = setup();
    const bill = Atanor.machineMaterials(reference());
    const before = Object.fromEntries(Object.keys(bill).map((k) => [k, stock(sim, k)]));
    const e = sim.dispatch({ type: 'DEPLOY_ATANOR', structureId: atn, solution: reference() })[0]!;
    expect(e.type).toBe('ATANOR_DEPLOY_STARTED');
    if (e.type !== 'ATANOR_DEPLOY_STARTED') return;
    for (const [k, q] of Object.entries(bill)) expect(stock(sim, k)).toBeCloseTo(before[k]! - q, 6);
    const kr = Object.entries(bill).reduce((s, [k, q]) => s + q * eco.values.get(k)!.V, 0);
    expect(e.deployment.total).toBeCloseTo(Math.max(1, kr * eco.params.atanorDeployMinPerKr), 2);
    expect(e.deployment.metrics).toMatchObject({ cyclesPerOutput: 12, area: 13, arms: 2 });
    // a second deployment while one runs is refused
    expect(sim.dispatch({ type: 'DEPLOY_ATANOR', structureId: atn, solution: reference() })[0]).toMatchObject({ type: 'COMMAND_REJECTED', reason: 'BUSY' });
  });

  it('produces NAD at the measured rate: one per 12 cycles × takt 1,0 min at L1, inputs per product as the recipe', () => {
    const { sim, atn } = setup();
    deployed(sim, atn);
    const nad0 = stock(sim, 'NAD');
    const mie0 = stock(sim, 'MIE');
    run(sim, 240);
    const m = sim.world.machines![atn]!;
    const made = stock(sim, 'NAD') - nad0;
    expect(m.state).toBe('RUNNING');
    expect(made).toBe(m.delivered);
    expect(made).toBeGreaterThanOrEqual(18); // 240 / 12 = 20, minus the warm-up
    expect(made).toBeLessThanOrEqual(20);
    expect(m.ticks).toBeGreaterThanOrEqual(238);
    // atoms that entered = products × recipe + what is inside the machine (at most a few atoms)
    const used = mie0 - stock(sim, 'MIE');
    expect(used).toBeGreaterThanOrEqual(2 * made);
    expect(used).toBeLessThanOrEqual(2 * made + 4);
  });

  it('the machine draws power for its area and arms on top of the building (§8.1)', () => {
    const { sim, atn } = setup();
    const idle = powerBalance(sim.world, sim.rules, TC_E).consumed;
    deployed(sim, atn);
    const m = sim.world.machines![atn]!;
    expect(m.metrics!.extraPower).toBeCloseTo(0.5 * 13 + 2, 6);
    expect(powerBalance(sim.world, sim.rules, TC_E).consumed).toBeCloseTo(idle + m.metrics!.extraPower, 6);
  });

  it('refuses machines outside the building limits, machines that do not produce and missing materials', () => {
    const { sim, atn } = setup();
    const tooLong = reference();
    tooLong.arms[0]!.length = 3; // L1 allows arms up to 2
    expect(sim.dispatch({ type: 'DEPLOY_ATANOR', structureId: atn, solution: tooLong })[0]).toMatchObject({ type: 'COMMAND_REJECTED', reason: 'MACHINE_INVALID' });
    expect(sim.dispatch({ type: 'DEPLOY_ATANOR', structureId: atn, solution: Atanor.hintSolution(reference()) })[0]).toMatchObject({ type: 'COMMAND_REJECTED', reason: 'MACHINE_NOT_PRODUCING' });
    sim.load({ ...sim.world, storage: { ...sim.world.storage, [TC_E]: { ...sim.world.storage[TC_E], STA: 0 } } });
    expect(sim.dispatch({ type: 'DEPLOY_ATANOR', structureId: atn, solution: reference() })[0]).toMatchObject({ type: 'COMMAND_REJECTED', reason: 'NO_RESOURCES' });
  });

  it('waits without PLA (min(design, supply), §8.5 p. 1) and goes on when PLA comes back', () => {
    const { sim, atn } = setup();
    deployed(sim, atn);
    run(sim, 30);
    sim.load({ ...sim.world, storage: { ...sim.world.storage, [TC_E]: { ...sim.world.storage[TC_E], PLA: 0 } } });
    run(sim, 60);
    const waiting = sim.world.machines![atn]!;
    expect(waiting.state).toBe('WAITING');
    const ticks = waiting.ticks;
    run(sim, 30);
    expect(sim.world.machines![atn]!.ticks).toBe(ticks); // time passes, the program does not
    sim.load({ ...sim.world, storage: { ...sim.world.storage, [TC_E]: { ...sim.world.storage[TC_E], PLA: 10 } } });
    run(sim, 30);
    expect(sim.world.machines![atn]!.state).toBe('RUNNING');
    expect(sim.world.machines![atn]!.ticks).toBeGreaterThan(ticks);
  });

  it('a loaded world rebuilds the engine from the ticks: both continue identically', () => {
    const { sim, atn } = setup();
    deployed(sim, atn);
    run(sim, 37);
    const copy = buildFactory(eco);
    copy.load(structuredClone(sim.world));
    run(sim, 50);
    run(copy, 50);
    expect(JSON.stringify(copy.world.machines)).toBe(JSON.stringify(sim.world.machines));
    expect(copy.world.storage[TC_E]).toEqual(sim.world.storage[TC_E]);
    expect(sim.world.machines![atn]!.ticks).toBeGreaterThan(80);
  });

  it('redeploying returns the atoms inside the machine (A23) and refunds removed elements (A18)', () => {
    const { sim, atn } = setup();
    deployed(sim, atn);
    run(sim, 41);
    const m = sim.world.machines![atn]!;
    const inside = Object.fromEntries(Object.entries(m.consumed).map(([k, q]) => [k, q - (level.recipe!.inputs[k] ?? 0) * m.delivered]));
    const sameMachine = reference();
    const before = { MIE: stock(sim, 'MIE'), PRZ: stock(sim, 'PRZ') };
    expect(sim.dispatch({ type: 'DEPLOY_ATANOR', structureId: atn, solution: sameMachine })[0]?.type).toBe('ATANOR_DEPLOY_STARTED');
    // the same machine costs nothing and takes the minimum time
    expect(sim.world.machines![atn]!.deploy!.total).toBe(1);
    const nadBefore = stock(sim, 'NAD');
    run(sim, 0.5);
    run(sim, 1);
    expect(sim.world.machines![atn]!.ticks).toBeLessThan(5); // the new program started from tick 0
    expect(stock(sim, 'MIE')).toBeGreaterThanOrEqual(before.MIE + (inside['MIE'] ?? 0) - 4);
    expect(stock(sim, 'PRZ')).toBe(before.PRZ);
    expect(stock(sim, 'NAD')).toBeGreaterThanOrEqual(nadBefore);
  });
});
