import { PLANET_ID } from '@space-game/domain';
import { MockServer } from './server';

// The tile panel of the 3D PoC on the mock: shape, deposit left, what stands there, what fits.
describe('tileInfo', () => {
  const server = () => {
    const s = new MockServer();
    s.start('planeta-matka');
    return s;
  };

  it('a free tile without a deposit: the landing pad fits, extractors need a deposit', () => {
    const s = server();
    const grid = s.simulation.grids.get(PLANET_ID)!;
    const used = new Set(s.simulation.world.structures.flatMap((x) => x.tiles));
    const free = grid.tiles.find((t) => !t.deposit && !used.has(t.id) && t.neighbors.every((n) => !used.has(grid.tiles[n]!.id)))!;
    const info = s.tileInfo(PLANET_ID, free.index)!;
    expect(info).toMatchObject({ index: free.index, kind: free.kind, deposit: null, structureId: null });
    expect(info.options.find((o) => o.kind === 'LAND')).toMatchObject({ ok: true });
    expect(info.options.find((o) => o.kind === 'MIN')).toMatchObject({ ok: false, reason: 'NO_DEPOSIT' });
  });

  it('a free deposit tile names its material, what is left, and the extractor that takes it', () => {
    const s = server();
    const grid = s.simulation.grids.get(PLANET_ID)!;
    const used = new Set(s.simulation.world.structures.flatMap((x) => x.tiles));
    const tile = grid.tiles.find((t) => t.deposit?.resource === 'FER' && !used.has(t.id))!;
    const info = s.tileInfo(PLANET_ID, tile.index)!;
    expect(info.deposit).toEqual({ material: 'FER', initial: tile.deposit!.amount, remaining: tile.deposit!.amount });
    const min = info.options.find((o) => o.kind === 'MIN')!;
    expect(min.extracts).toBe('FER');
    expect(min.reason).not.toBe('NO_DEPOSIT');
    expect(info.options.find((o) => o.kind === 'ICE')).toMatchObject({ ok: false, reason: 'NO_DEPOSIT' });
  });

  it('an occupied tile names its structure and nothing fits', () => {
    const s = server();
    const pad = s.simulation.world.structures.find((x) => x.kind === 'LAND')!;
    const index = Number(pad.tiles[0]!.split(':')[1]);
    const info = s.tileInfo(PLANET_ID, index)!;
    expect(info.structureId).toBe(pad.id);
    expect(info.options.every((o) => !o.ok)).toBe(true);
  });

  it('null outside the grid', () => {
    expect(server().tileInfo(PLANET_ID, 99_999)).toBeNull();
  });
});
