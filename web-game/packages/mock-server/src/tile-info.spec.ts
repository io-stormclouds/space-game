import {
  ARK_ID,
  PLANET_ID,
  TC_B,
  TC_C,
  TC_D,
  TC_E,
  TC_F,
  findFreeFootprint,
  footprintTiles,
  roverId,
  scaleCost,
  siteTerrain,
  standingStructure,
  tileBuildable,
  tileIndexOf,
  type Tile,
} from '@space-game/domain';
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
    // on grass (100 %): the PoC storage pays the pad at the catalog cost, not on snow or rock (T5 terrain)
    const free = grid.tiles.find((t) => !t.deposit && t.terrain === 'grass' && !used.has(t.id) && t.neighbors.every((n) => !used.has(grid.tiles[n]!.id)))!;
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

  it('no terrain on a body without one (a save whose body has no terrain config)', () => {
    const s = server();
    expect(s.tileInfo(PLANET_ID, 0)!.terrain).not.toBeNull(); // the PoC planet has terrain since T5
    const file = s.save();
    const bodies = file.world.bodies.map((b) => {
      if (b.id !== PLANET_ID || !b.surfaceGrid) return b;
      const { terrain: _, ...surfaceGrid } = b.surfaceGrid;
      return { ...b, surfaceGrid };
    });
    s.load({ ...file, world: { ...file.world, bodies } });
    expect(s.tileInfo(PLANET_ID, 0)!.terrain).toBeNull();
  });
});

// T5: the automatic port placement (`suggestTile('PORT')`) finds a place on every body with terrain.
describe('port placement on every terrain body (T5)', () => {
  it('suggestTile(PORT) is never null, lands on buildable tiles, and on Tau Ceti e keeps 2 dry rings', () => {
    const s = new MockServer(); // tau-ceti
    const sim = s.simulation;
    const bodies = [...sim.grids].filter(([, g]) => g.terrain).map(([id]) => id);
    expect(bodies).toEqual([TC_B, TC_C, TC_D, TC_E, TC_F]);
    const w = sim.world;
    for (const body of bodies) {
      // Arka-1 on the orbit of the body, the body chosen as the colony site
      sim.load({
        ...w,
        scan: { state: 'DONE', at: 0 },
        colony: { siteBodyId: body, foundedAt: null },
        bodies: w.bodies.map((b) => ({ ...b, revealed: true })),
        ships: w.ships.map((x) => (x.id === ARK_ID ? { ...x, state: 'DOCKED', currentBodyId: body } : x)),
      });
      const grid = sim.grids.get(body)!;
      const at = s.suggestTile(body, 'PORT');
      expect(at, body).not.toBeNull();
      const fp = footprintTiles(grid, at!.tileIndex, 3, at!.rotation)!;
      expect(fp.every((i) => tileBuildable(grid.tiles[i]!)), body).toBe(true);
      expect(s.previewBuild(body, at!.tileIndex, 'PORT', at!.rotation).ok, body).toBe(true);
      if (body === TC_E) {
        // the start planet (T-25): the port and the two rings around it are dry
        const near = new Set([at!.tileIndex]);
        for (let ring = 0; ring < 2; ring++) for (const i of [...near]) for (const n of grid.tiles[i]!.neighbors) near.add(n);
        expect(near.size).toBeGreaterThanOrEqual(19);
        expect([...near].filter((i) => !tileBuildable(grid.tiles[i]!))).toEqual([]);
      }
    }
  });

  it('the PoC planet: the pad, the panel and the port of the preset stand on buildable tiles', () => {
    const s = new MockServer();
    s.start('planeta-matka');
    const grid = s.simulation.grids.get(PLANET_ID)!;
    expect(grid.terrain).toMatchObject({ biome: 'mixed', seed: 7 });
    for (const st of s.simulation.world.structures) expect(st.tiles.every((t) => tileBuildable(grid.tiles[tileIndexOf(t)]!)), st.id).toBe(true);
  });
});

// T8: terrain of Tau Ceti c (its lakes are dried lake beds, T-26) in the tile panel, the placement preview
// and the automatic placement.
describe('terrain on the mock (Tau Ceti c)', () => {
  const RICH = { FER: 1000, SIL: 1000, KRI: 500 };

  /** Tau Ceti c founded: port standing, one rover, a full storage; or (landing) Arka-1 on its orbit, site chosen. */
  const colony = (landing = false) => {
    const s = new MockServer(); // tau-ceti
    const sim = s.simulation;
    const grid = sim.grids.get(TC_C)!;
    const hq = standingStructure('HQ', TC_C, findFreeFootprint(grid, 3, new Set())!);
    const w = sim.world;
    sim.load({
      ...w,
      scan: { state: 'DONE', at: 0 },
      colony: { siteBodyId: TC_C, foundedAt: landing ? null : 0 },
      bodies: w.bodies.map((b) => ({ ...b, revealed: true })),
      structures: landing ? [] : [hq],
      storage: { [TC_C]: RICH },
      rovers: landing ? [] : [{ id: roverId('r-1'), name: 'Łazik R-1', bodyId: TC_C, tileIndex: Number(hq.tiles[0]!.split(':')[1]), state: 'IDLE', path: [], job: null }],
      ships: w.ships.map((x) => (x.id === ARK_ID ? { ...x, state: 'DOCKED', currentBodyId: TC_C } : x)),
    });
    const used = new Set(hq.tiles);
    const tile = (pred: (t: Tile) => boolean): Tile => grid.tiles.find((t) => t.kind === 'HEX' && !t.deposit && !used.has(t.id) && pred(t))!;
    return { s, grid, tile };
  };

  it('tile panel: class, road, cost and time %; a dried lake bed refuses every kind with BAD_TERRAIN', () => {
    const { s, tile } = colony();
    const forest = tile((t) => t.terrain === 'forest');
    expect(s.tileInfo(TC_C, forest.index)!.terrain).toEqual({ kind: 'forest', name: 'las', road: false, buildable: true, costPct: 110, timePct: 150 });
    const road = tile((t) => t.road === true);
    expect(s.tileInfo(TC_C, road.index)!.terrain).toEqual({ kind: 'grass', name: 'droga', road: true, buildable: true, costPct: 85, timePct: 75 });
    const dune = s.tileInfo(TC_C, tile((t) => t.terrain === 'dune').index)!;
    expect(dune.terrain).toEqual({ kind: 'dune', name: 'wydma', road: false, buildable: false, costPct: 100, timePct: 100 });
    expect(dune.options.every((o) => !o.ok)).toBe(true);
    const single = new Set(s.catalog().buildings.filter((b) => b.footprint === 1).map((b) => b.id));
    const singles = dune.options.filter((o) => single.has(o.kind));
    expect(singles.length).toBeGreaterThan(5);
    expect(singles.every((o) => o.reason === 'BAD_TERRAIN' && o.detail === 'wydma')).toBe(true);
    // key order of the reply: terrain right after deposit
    expect(Object.keys(dune).slice(3, 5)).toEqual(['deposit', 'terrain']);
  });

  it('placement preview: terrain cost and build time, none on a dune', () => {
    const { s, tile } = colony();
    const dune = tile((t) => t.terrain === 'dune');
    expect(s.previewBuild(TC_C, dune.index, 'SOL', 0)).toEqual({ ok: false, reason: 'BAD_TERRAIN', detail: 'wydma', tiles: [dune.index] });
    const forest = tile((t) => t.terrain === 'forest');
    expect(s.previewBuild(TC_C, forest.index, 'SOL', 0)).toEqual({ ok: true, tiles: [forest.index], cost: { SIL: 11 }, buildTime: 1.5 });
    const rock = tile((t) => t.terrain === 'rock');
    // a later rejection still carries the price
    expect(s.previewBuild(TC_C, rock.index, 'MIN', 0)).toMatchObject({ ok: false, reason: 'NO_DEPOSIT', cost: { FER: 21 }, buildTime: 2.5 });
    const road = tile((t) => t.road === true);
    expect(s.previewBuild(TC_C, road.index, 'HAB', 0)).toEqual({ ok: true, tiles: [road.index], cost: { FER: 17, SIL: 9 }, buildTime: 2.25 });
  });

  it('port preview: scaled port cost and time, dunes refused; automatic placement avoids them', () => {
    const { s, grid } = colony(true);
    const port = s.catalog().colonization;
    let wet: { anchor: number; rotation: number } | null = null;
    for (const t of grid.tiles) {
      for (let r = 0; r < t.neighbors.length && !wet; r++) {
        const fp = footprintTiles(grid, t.index, 3, r);
        if (fp && fp.every((i) => !grid.tiles[i]!.deposit) && fp.some((i) => grid.tiles[i]!.terrain === 'dune')) wet = { anchor: t.index, rotation: r };
      }
      if (wet) break;
    }
    expect(s.previewBuild(TC_C, wet!.anchor, 'PORT', wet!.rotation)).toMatchObject({ ok: false, reason: 'BAD_TERRAIN', detail: 'wydma' });
    expect(s.previewBuild(TC_C, wet!.anchor, 'PORT', wet!.rotation).cost).toBeUndefined();

    const at = s.suggestTile(TC_C, 'PORT')!;
    const fp = footprintTiles(grid, at.tileIndex, 3, at.rotation)!;
    expect(fp.every((i) => tileBuildable(grid.tiles[i]!))).toBe(true);
    const pct = siteTerrain(grid, fp);
    expect(s.previewBuild(TC_C, at.tileIndex, 'PORT', at.rotation)).toEqual({
      ok: true,
      tiles: fp,
      cost: scaleCost(port.portCost, pct.costPct),
      buildTime: pct.timePct === 100 ? port.portBuildMinutes : (port.portBuildMinutes * pct.timePct) / 100,
    });
  });

  it('suggestTile goes through the check, so it never picks an unbuildable tile', () => {
    const { s, grid } = colony();
    for (const kind of ['SOL', 'HAB', 'DEP']) {
      const at = s.suggestTile(TC_C, kind)!;
      expect(tileBuildable(grid.tiles[at.tileIndex]!), kind).toBe(true);
    }
  });
});
