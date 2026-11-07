import { GAME_CONSTANTS } from '../config/game-constants';
import { ASTEROID_ID, INITIAL_BODIES, INITIAL_SHIPS } from '../config/initial-world';
import { Spacecraft } from '../models/spacecraft.model';
import { MiningSystem } from './mining-system';

describe('MiningSystem', () => {
  const miner = (): Spacecraft => ({ ...INITIAL_SHIPS[0], state: 'MINING', currentBodyId: ASTEROID_ID });

  it('emits one MINING_TICK of miningRate per game second', () => {
    const sys = new MiningSystem(GAME_CONSTANTS);
    const ship = miner();
    let ticks = 0;
    for (let i = 0; i < 59; i++) expect(sys.update([ship], INITIAL_BODIES, 1 / 60)).toEqual([]);
    for (let i = 0; i < 2; i++) ticks += sys.update([ship], INITIAL_BODIES, 1 / 60).filter((e) => e.type === 'MINING_TICK').length;
    expect(ticks).toBe(1);
  });

  it('caps the tick at the remaining cargo space and signals CARGO_FULL', () => {
    const sys = new MiningSystem(GAME_CONSTANTS);
    const ship = { ...miner(), cargo: { FERRITE: 47, CRYOL: 0, SILICITE: 0 } };
    const events = sys.update([ship], INITIAL_BODIES, 1);
    expect(events).toEqual([
      { type: 'MINING_TICK', shipId: ship.id, bodyId: ASTEROID_ID, resource: 'FERRITE', amount: 3 },
      { type: 'MINING_STOPPED', shipId: ship.id, reason: 'CARGO_FULL' },
    ]);
  });

  it('stops when the body is depleted', () => {
    const sys = new MiningSystem(GAME_CONSTANTS);
    const bodies = INITIAL_BODIES.map((b) => (b.id === ASTEROID_ID ? { ...b, resources: { FERRITE: 0 } } : b));
    const events = sys.update([miner()], bodies, 1);
    expect(events).toEqual([{ type: 'MINING_STOPPED', shipId: INITIAL_SHIPS[0].id, reason: 'DEPLETED' }]);
  });

  it('ignores ships that are not mining', () => {
    const sys = new MiningSystem(GAME_CONSTANTS);
    expect(sys.update([INITIAL_SHIPS[0]], INITIAL_BODIES, 5)).toEqual([]);
  });
});
