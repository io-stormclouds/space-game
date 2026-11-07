import { computeEconomy } from '@space-game/domain';
import { LOAD_SPECS, buildLoad } from './load';
import { MockServer } from './server';

describe('load scenarios (F5)', () => {
  const eco = computeEconomy();

  it.each(['S', 'M', 'L'] as const)('level %s has the specified buildings, ships and rovers, set in motion', (level) => {
    const spec = LOAD_SPECS[level];
    const sim = buildLoad(level, eco);
    expect(sim.world.structures.length).toBe(spec.structures);
    expect(sim.world.ships.filter((s) => s.role === 'SHIP').length).toBe(spec.ships);
    expect(sim.world.rovers.length).toBe(spec.rovers);
    expect(sim.world.ships.filter((s) => s.state === 'IN_TRANSIT').length).toBeGreaterThan(spec.ships * 0.8);
    expect(sim.world.rovers.filter((r) => r.state === 'MOVING').length).toBeGreaterThan(spec.rovers * 0.5);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(buildLoad('M', eco).world)).toBe(JSON.stringify(buildLoad('M', eco).world));
  });

  it('starts through the mock server and keeps stepping', () => {
    const s = new MockServer();
    s.start('load-m');
    s.stepMany(60);
    expect(s.snapshot().world.structures.length).toBe(300);
    expect(s.snapshot().scenarioId).toBe('load-m');
  });
});
