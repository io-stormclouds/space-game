import { PLANET_ID } from '../config/initial-world';
import { INITIAL_STRUCTURES, WORLD_GRIDS, createInitialWorld, topTile } from '../config/world';
import { powerBalance } from '../economy/power';
import { tileId } from '../models/planet-grid.model';
import { WorldState, reduce } from '../reducer';
import { BuildSystem } from './build-system';

describe('BuildSystem', () => {
  const system = new BuildSystem(WORLD_GRIDS);
  const grid = WORLD_GRIDS.get(PLANET_ID)!;
  const freeTile = () => grid.tiles.find((t) => !t.deposit && !INITIAL_STRUCTURES.some((s) => s.tileId === t.id))!;
  const depositTile = (resource: 'FERRITE' | 'CRYOL' | 'SILICITE') => grid.tiles.find((t) => t.deposit?.resource === resource)!;
  const world = (): WorldState => createInitialWorld();

  it('starts with a landing pad and a solar panel on the planet: 5 power produced, 2 consumed', () => {
    const w = world();
    expect(powerBalance(w.structures, PLANET_ID)).toEqual({ produced: 5, consumed: 2, available: 3 });
    expect(INITIAL_STRUCTURES[0].tileId).toBe(topTile(grid).id);
  });

  it('builds a mine on a Ferryt deposit and charges the cost through the reducer', () => {
    const w = world();
    const tile = depositTile('FERRITE');
    const e = system.build(w, PLANET_ID, tile.id, 'MINE', 12);
    expect(e.type).toBe('STRUCTURE_BUILT');
    const after = reduce(w, e);
    expect(after.stockpile.FERRITE).toBe(w.stockpile.FERRITE - 15);
    expect(after.structures).toHaveLength(INITIAL_STRUCTURES.length + 1);
    expect(after.structures.at(-1)).toMatchObject({ kind: 'MINE', bodyId: PLANET_ID, tileId: tile.id, builtAt: 12 });
  });

  it('rejects an extractor without a matching deposit', () => {
    const w = world();
    expect(system.build(w, PLANET_ID, freeTile().id, 'MINE', 0)).toMatchObject({ type: 'COMMAND_REJECTED', reason: 'NO_DEPOSIT' });
    const cryol = depositTile('CRYOL');
    expect(system.build(w, PLANET_ID, cryol.id, 'MINE', 0)).toMatchObject({ reason: 'NO_DEPOSIT' });
    expect(system.build(w, PLANET_ID, cryol.id, 'ICE_EXTRACTOR', 0).type).toBe('STRUCTURE_BUILT');
  });

  it('rejects a second structure on the same tile', () => {
    let w = world();
    const tile = freeTile();
    w = reduce(w, system.build(w, PLANET_ID, tile.id, 'HABITAT', 0));
    const e = system.build(w, PLANET_ID, tile.id, 'HABITAT', 1);
    expect(e).toMatchObject({ type: 'COMMAND_REJECTED', reason: 'TILE_OCCUPIED' });
    expect(reduce(w, e)).toBe(w);
  });

  it('rejects when resources are short, naming what is missing', () => {
    const w: WorldState = { ...world(), stockpile: { FERRITE: 10, CRYOL: 0, SILICITE: 0 } };
    const e = system.build(w, PLANET_ID, freeTile().id, 'HABITAT', 0);
    expect(e).toMatchObject({ type: 'COMMAND_REJECTED', reason: 'NO_RESOURCES' });
    expect((e as { detail?: string }).detail).toBe('brakuje 10 Ferrytu + 10 Silicytu');
  });

  it('blocks building when power would run short, and allows it after a power plant', () => {
    let w: WorldState = { ...world(), stockpile: { FERRITE: 200, CRYOL: 50, SILICITE: 100 } };
    // 3 power available: one extractor (3) fits, a second one does not
    const a = depositTile('FERRITE');
    w = reduce(w, system.build(w, PLANET_ID, a.id, 'MINE', 0));
    const b = grid.tiles.find((t) => t.deposit?.resource === 'FERRITE' && t.id !== a.id)!;
    const rejected = system.build(w, PLANET_ID, b.id, 'MINE', 1);
    expect(rejected).toMatchObject({ reason: 'NO_POWER', detail: 'brakuje 3 mocy' });
    expect(system.availability(w, PLANET_ID, 'SOLAR').ok).toBe(true);
    w = reduce(w, system.build(w, PLANET_ID, freeTile().id, 'WIND', 2));
    expect(system.build(w, PLANET_ID, b.id, 'MINE', 3).type).toBe('STRUCTURE_BUILT');
  });

  it('rejects bodies without a grid and unknown tiles', () => {
    const w = world();
    expect(system.build(w, 'asteroid' as never, tileId('asteroid' as never, 0), 'HABITAT', 0)).toMatchObject({ reason: 'NO_GRID' });
    expect(system.build(w, PLANET_ID, tileId(PLANET_ID, 9999), 'HABITAT', 0)).toMatchObject({ reason: 'NO_GRID' });
  });
});
