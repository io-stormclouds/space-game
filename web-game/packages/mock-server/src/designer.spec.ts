import { DEFAULT_ECONOMY_PARAMS, TC_E, computeEconomy, economyTables } from '@space-game/domain';
import { MockServer } from './server';

// F6: queries of the designer panel.
describe('designer queries (F6)', () => {
  it('the report at default parameters equals the document tables', () => {
    const s = new MockServer();
    const r = s.economyReport();
    expect(r.current).toEqual(r.doc);
    expect(r.params).toEqual(DEFAULT_ECONOMY_PARAMS);
    expect(r.doc.eras.map((e) => e.k)).toEqual([1, 4, 2, 1.5, 2]);
  });

  it('other parameters change the current tables only, without restarting the game', () => {
    const s = new MockServer();
    const step = s.snapshot().step;
    const r = s.economyReport({ ...DEFAULT_ECONOMY_PARAMS, energyPrice: 0.2 });
    const doc = new Map(r.doc.materials.map((m) => [m.id, m.V]));
    const changed = r.current.materials.filter((m) => m.V !== doc.get(m.id));
    expect(changed.length).toBeGreaterThan(10);
    expect(s.snapshot().step).toBe(step);
  });

  it('a game started with other parameters reports them as current', () => {
    const s = new MockServer();
    s.start('tau-ceti', { ...DEFAULT_ECONOMY_PARAMS, costGrowth: 3 });
    expect(s.economyReport().params.costGrowth).toBe(3);
    const hab = s.catalog().buildings.find((b) => b.id === 'HAB')!;
    const doc = economyTables(computeEconomy()).buildings.find((b) => b.id === 'HAB')!;
    expect(hab.levels[1]!.cost).not.toEqual(computeEconomy().cost(computeEconomy().building('HAB'), 2));
    expect(doc.costKr).toBeGreaterThan(0);
  });

  it('measured Atanor numbers (A3) replace the doc’s provisional ones in recipe time and power', () => {
    const doc = economyTables(computeEconomy()).atanor.find((a) => a.recipeId === 'A_NAD')!;
    const spec = { cycles: doc.cycles * 2, area: doc.area + 4, arms: doc.arms + 1 };
    const measured = economyTables(computeEconomy({ ...DEFAULT_ECONOMY_PARAMS, atanor: { A_NAD: spec } })).atanor.find((a) => a.recipeId === 'A_NAD')!;
    expect(measured).toMatchObject({ ...spec, level: doc.level });
    expect(measured.time).toBeCloseTo(doc.time * 2, 1);
    expect(measured.power).toBeCloseTo(doc.power + 4 * DEFAULT_ECONOMY_PARAMS.atanorPowerPerHex + DEFAULT_ECONOMY_PARAMS.atanorPowerPerArm, 1);
    expect(measured.productValue).toBeGreaterThan(doc.productValue);
  });

  it('nominal flows of the colony follow its working extractors', () => {
    const s = new MockServer();
    s.start('load-m');
    const flows = s.nominalFlows(TC_E);
    const extractors = (flows.buildings['MIN'] ?? 0) + (flows.buildings['ICE'] ?? 0) + (flows.buildings['SIT'] ?? 0);
    expect(extractors).toBeGreaterThan(0);
    expect(Object.values(flows.extraction).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(flows.efficiency[1]).toBeGreaterThanOrEqual(0);
  });
});
