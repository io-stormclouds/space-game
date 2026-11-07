import { tileIndexOf } from './systems/rover-system';
import { colonyObjectives, extractedMaterials } from './objectives';
import { standingStructure } from './scenario';
import { TAU_CETI_SCENARIO, TC_E } from './scenarios/tau-ceti';
import { Simulation } from './simulation';

describe('colony objectives', () => {
  // Regression (found in the F3 browser run): a Kopalnia on a Kupryt deposit counted as FER extraction.
  it('count the material under each extractor, not what the building could extract', () => {
    const sim = new Simulation(TAU_CETI_SCENARIO);
    const grid = sim.grids.get(TC_E)!;
    const kup = grid.tiles.find((t) => t.deposit?.resource === 'KUP')!;
    const fer = grid.tiles.find((t) => t.deposit?.resource === 'FER')!;
    const w = { ...sim.world, colony: { siteBodyId: TC_E, foundedAt: 10 }, scan: { state: 'DONE' as const, at: 1 } };
    const onKup = { ...w, structures: [standingStructure('MIN', TC_E, [kup.index])] };
    expect([...extractedMaterials(onKup, sim.rules, sim.grids, TC_E)]).toEqual(['KUP']);
    expect(colonyObjectives(onKup, sim.rules, sim.grids)[3]).toMatchObject({ done: false, missing: ['FER', 'SIL', 'KRI'] });

    const onFer = { ...w, structures: [standingStructure('MIN', TC_E, [fer.index])] };
    expect(colonyObjectives(onFer, sim.rules, sim.grids)[3]!.missing).toEqual(['SIL', 'KRI']);
    // the goal is "start extraction": a deposit that ran dry still counts
    const depleted = { ...onFer, deposits: { ...onFer.deposits, [fer.id]: 0 } };
    expect(extractedMaterials(depleted, sim.rules, sim.grids, TC_E).has('FER')).toBe(true);
    expect(tileIndexOf(fer.id)).toBe(fer.index);
  });
});
