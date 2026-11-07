import { asSaveFile } from './file-tab';
import { paramDiff } from './designer';
import { diffPct, measuredRates, niceTicks, pct, pushSample, timeLabel, type Sample } from './series';

const sample = (t: number): Sample => ({ t, stock: {}, powerProduced: 0, powerConsumed: 0, crewDemand: 0, crewCapacity: 0 });

describe('designer helpers (F6)', () => {
  it('keeps at most max samples by halving and doubling the interval, always keeping the latest', () => {
    let state = { samples: [] as Sample[], interval: 1 };
    for (let t = 0; t < 9; t++) state = pushSample(state.samples, sample(t), state.interval, 8);
    expect(state.interval).toBe(2);
    expect(state.samples.length).toBeLessThanOrEqual(8);
    expect(state.samples.at(-1)!.t).toBe(8);
  });

  it('axis ticks are round and reach the maximum', () => {
    expect(niceTicks(15)).toEqual([0, 5, 10, 15]);
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(7.3).at(-1)).toBeGreaterThanOrEqual(7.3);
  });

  it('measured rates average whole minutes in the window and shorten it at the start', () => {
    const buckets = [0, 1, 2, 3].map((minute) => ({ minute, extraction: { FER: 2 }, production: {}, consumption: {} }));
    expect(measuredRates(buckets, 4.5, 30, 0)).toMatchObject({ window: 4, extraction: { FER: 2 } });
    expect(measuredRates(buckets, 4.5, 2, 0)).toMatchObject({ window: 2, extraction: { FER: 2 } });
    expect(measuredRates(buckets, 0.5, 30, 0).window).toBe(0);
  });

  it('differences and labels in Polish', () => {
    expect(diffPct(10, 12)).toBeCloseTo(20);
    expect(diffPct(0, 3)).toBeNull();
    expect(pct(12.34)).toBe('+12,3%');
    expect(pct(-3)).toBe('−3%');
    expect(timeLabel(65)).toBe('01:05');
    expect(timeLabel(1440 * 2 + 30)).toBe('D3 00:30');
  });

  it('compares parameters by value, arrays and Atanor overrides included', () => {
    const a = { energyPrice: 0.1, paybackTargetMin: [8, 30] } as never;
    const b = { energyPrice: 0.1, paybackTargetMin: [8, 31], atanor: { A_NAD: { cycles: 12, area: 12, arms: 2 } } } as never;
    expect(paramDiff(a, b).sort()).toEqual(['atanor', 'paybackTargetMin']);
    expect(paramDiff(a, a)).toEqual([]);
  });

  it('accepts only web-game save files', () => {
    expect(asSaveFile({ a: 1 })).toBeNull();
    expect(asSaveFile({ format: 'space-game-save', version: 2 })).toBeNull();
    const ok = { format: 'space-game-save', version: 1, scenarioId: 'tau-ceti', step: 3, world: {}, commands: [], tempos: [], stepSeconds: 1 / 60, meta: null };
    expect(asSaveFile(ok)).toBe(ok);
  });
});
