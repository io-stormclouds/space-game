import { describe, expect, it } from 'vitest';
import { TC_E, computeEconomy, crewBalance, powerBalance } from '@space-game/domain';
import { FACTORY_STORAGE, buildFactory } from './factory';
import { MockServer } from './server';

describe('scenario "fabryka" (AT1)', () => {
  const eco = computeEconomy();

  it('has a founded colony on Tau Ceti e with a working Fabryka atanorowa L1 on 7 tiles', () => {
    const sim = buildFactory(eco);
    const w = sim.world;
    expect(w.colony).toEqual({ siteBodyId: TC_E, foundedAt: 0 });
    const atn = w.structures.find((s) => s.kind === 'ATN')!;
    expect(atn).toMatchObject({ bodyId: TC_E, level: 1, state: 'ACTIVE', recipe: 'A_NAD' });
    expect(atn.tiles).toHaveLength(7);
    expect(w.structures.find((s) => s.kind === 'HQ')?.level).toBe(3);
    expect(w.storage[TC_E]).toEqual(FACTORY_STORAGE);
    // no overlapping footprints
    const tiles = w.structures.flatMap((s) => s.tiles);
    expect(new Set(tiles).size).toBe(tiles.length);
    // enough power and crew for the factory
    expect(powerBalance(w, sim.rules, TC_E).efficiency[2]).toBe(1);
    expect(crewBalance(w, sim.rules, TC_E).available).toBeGreaterThanOrEqual(0);
  });

  it('is deterministic and starts through the mock server', () => {
    expect(JSON.stringify(buildFactory(eco).world)).toBe(JSON.stringify(buildFactory(eco).world));
    const server = new MockServer();
    const snap = server.start('fabryka');
    expect(snap.scenarioId).toBe('fabryka');
    expect(snap.world.structures.some((s) => s.kind === 'ATN')).toBe(true);
  });
});
