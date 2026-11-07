import { BUILDINGS, MATERIALS, VEHICLES } from './catalog-data';
import { DEFAULT_ECONOMY_PARAMS, computeEconomy } from './economy-model';

// Numbers checked against docs/economy-expansion-design.md (generated from this model) and the canvas.

describe('economy model', () => {
  const eco = computeEconomy();

  it('holds the full catalog: 37 materials, 45 buildings, 10 vehicles', () => {
    expect(MATERIALS).toHaveLength(37);
    expect(BUILDINGS).toHaveLength(45);
    expect(VEHICLES).toHaveLength(10);
    expect(eco.values.size).toBe(37);
  });

  it('derives the era multipliers k from payback targets (doc 5.1: ×1, ×4, ×2, ×1,5, ×2)', () => {
    expect(eco.eraK).toEqual([1, 4, 2, 1.5, 2]);
  });

  it('keeps the PoC L1 values for E0 buildings (Z6: same numbers, unit = minute)', () => {
    const mine = eco.building('MIN');
    expect(eco.cost(mine, 1)).toEqual({ FER: 15 });
    expect(eco.power(mine, 1)).toBe(-3);
    expect(eco.recipe('X_FER')).toMatchObject({ out: { FER: 2 }, time: 1 });
    expect(eco.cost(eco.building('SOL'), 1)).toEqual({ SIL: 10 });
  });

  it('matches the canvas: port L3 upgrade, construction rover', () => {
    const hq = eco.building('HQ');
    expect(eco.cost(hq, 3)).toEqual({ FER: 2400, SIL: 1200, STA: 600, BEL: 300, UKL: 60 });
    expect(eco.buildTime(hq, 3)).toBe(120); // "Rozbudowa do L3 · 2 h"
    const rov = eco.building('ROV');
    expect(eco.cost(rov, 1)).toEqual({ FER: 20, SIL: 5 });
    expect(eco.buildTime(rov, 1)).toBe(3);
  });

  it('grows levels as in doc 5.1: cost ×2 (era k applied), time ×1,8, panel power ×1,7, living space ×1,7', () => {
    const smt = eco.building('SMT');
    expect(eco.cost(smt, 1)).toEqual({ FER: 160, SIL: 80 });
    expect(eco.buildTime(smt, 2)).toBeCloseTo(18, 9);
    expect(eco.power(eco.building('SOL'), 5)).toBeCloseTo(41.76, 2);
    expect(eco.crew(eco.building('HAB'), 2)).toBeCloseTo(-17, 9);
    expect(eco.crew(eco.building('SMT'), 2)).toBeCloseTo(4 * 1.3, 9);
  });

  it('resolves Atanor recipes from their machine spec (tick × cycles, base power + hexes + arms)', () => {
    expect(eco.recipe('A_NAD')).toMatchObject({ time: 12, power: 12.5 });
  });

  it('recomputes everything when a parameter changes (F6 designer panel)', () => {
    const cheap = computeEconomy({ ...DEFAULT_ECONOMY_PARAMS, paybackTargetMin: [8, 8, 120, 240, 480] });
    expect(cheap.eraK[1]).toBeLessThan(eco.eraK[1]!);
    expect(cheap.cost(cheap.building('SMT'), 1)['FER']).toBeLessThan(160);
    expect(computeEconomy().cost(eco.building('SMT'), 1)).toEqual({ FER: 160, SIL: 80 });
  });
});
