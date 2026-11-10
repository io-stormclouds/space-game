import type { BodyId, CatalogBuilding, TileTerrainInfo } from '@space-game/api';
import { MockServer } from '@space-game/mock-server';
import { PL } from '../i18n/pl';
import { pctChange, terrainCost, terrainLine, tileBuildCost } from './format';
import { placementPreview } from './ui-state';

const TC_C = 'tc-c' as BodyId;
const terrain = (kind: TileTerrainInfo['kind'], name: string, costPct: number, timePct: number, extra: Partial<TileTerrainInfo> = {}): TileTerrainInfo => ({
  kind,
  name,
  road: false,
  buildable: true,
  costPct,
  timePct,
  ...extra,
});
const FOREST = terrain('forest', 'las', 110, 150);
const ROAD = terrain('grass', 'droga', 85, 75, { road: true });
const GRASS = terrain('grass', 'trawa', 100, 100);
const WATER = terrain('water', 'woda', 100, 100, { buildable: false });
const building = (id: string, footprint: number, cost: Record<string, number>, buildTime: number): CatalogBuilding =>
  ({ id, name: id, era: 0, category: 'E', footprint, maxLevel: 1, buildable: true, levels: [{ level: 1, cost, buildTime, power: 0, crew: 0, storage: {}, outputFactor: 1 }], extracts: [], recipes: [] });

describe('terrain in the tile panel and the build prices (T8)', () => {
  it('terrain row: class with its cost and time change, the road, plain grass, water, no terrain', () => {
    expect(terrainLine(PL, FOREST)).toBe('las · koszt +10 %, czas +50 %');
    expect(terrainLine(PL, ROAD)).toBe('droga · koszt −15 %, czas −25 %');
    expect(terrainLine(PL, GRASS)).toBe('trawa');
    expect(terrainLine(PL, WATER)).toBe('woda · nie można budować');
    expect(terrainLine(PL, null)).toBe('');
    // only what differs from the catalog is listed
    expect(terrainLine(PL, terrain('rock', 'skała', 140, 100))).toBe('skała · koszt +40 %');
    expect(terrainLine(PL, terrain('snow', 'śnieg', 100, 140))).toBe('śnieg · czas +40 %');
  });

  it('percent change against the catalog, Polish signs', () => {
    expect([110, 150, 85, 75, 140].map(pctChange)).toEqual(['+10 %', '+50 %', '−15 %', '−25 %', '+40 %']);
  });

  it('cost after the terrain rounds every material up, like BUILD (SIL 10 → 11 forest, 14 rock, 12 snow, 9 road)', () => {
    expect([110, 140, 120, 85, 100].map((p) => terrainCost({ SIL: 10 }, p))).toEqual([{ SIL: 11 }, { SIL: 14 }, { SIL: 12 }, { SIL: 9 }, { SIL: 10 }]);
    expect(terrainCost({ STA: 120, BET: 80, UKL: 10 }, 85)).toEqual({ STA: 102, BET: 68, UKL: 9 });
  });

  it('a 1-tile building pays the tile %; a 3- or 7-tile one keeps the catalog price "zależy od pól"; no terrain, no change', () => {
    const sol = building('SOL', 1, { SIL: 10 }, 1);
    const smt = building('SMT', 3, { FER: 40, SIL: 20 }, 10);
    expect(tileBuildCost(sol, FOREST)).toEqual({ cost: { SIL: 11 }, minutes: 1.5, perTiles: false });
    expect(tileBuildCost(sol, ROAD)).toEqual({ cost: { SIL: 9 }, minutes: 0.75, perTiles: false });
    expect(tileBuildCost(sol, GRASS)).toEqual({ cost: { SIL: 10 }, minutes: 1, perTiles: false });
    expect(tileBuildCost(sol, null)).toEqual({ cost: { SIL: 10 }, minutes: 1, perTiles: false });
    expect(tileBuildCost(smt, FOREST)).toEqual({ cost: { FER: 40, SIL: 20 }, minutes: 10, perTiles: true });
    expect(tileBuildCost(smt, null)).toEqual({ cost: { FER: 40, SIL: 20 }, minutes: 10, perTiles: false });
  });

  it('on Tau Ceti c the slot price of every 1-tile building is what the placement check asks', () => {
    const s = new MockServer(); // tau-ceti
    const singles = s.catalog().buildings.filter((b) => b.buildable && b.footprint === 1);
    const seen = new Set<string>();
    let checked = 0;
    for (let i = 0; ; i++) {
      const ti = s.tileInfo(TC_C, i);
      if (!ti) break;
      const key = ti.terrain ? (ti.terrain.road ? 'road' : ti.terrain.kind) : 'none';
      if (seen.has(key) || ti.deposit || !ti.terrain?.buildable) continue;
      seen.add(key);
      for (const b of singles) {
        const p = s.previewBuild(TC_C, i, b.id, 0);
        if (!p.cost) continue;
        const here = tileBuildCost(b, ti.terrain);
        expect(here.cost, `${b.id} on ${key}`).toEqual(p.cost);
        expect(here.minutes, `${b.id} on ${key}`).toBe(p.buildTime);
        checked++;
      }
    }
    expect(seen).toContain('forest');
    expect(seen).toContain('road');
    expect(seen).not.toContain('none');
    expect(checked).toBeGreaterThan(10);
  });

  it('the ghost keeps the price of the check, and only when the check got that far', () => {
    expect(placementPreview('SOL', 7, { ok: true, tiles: [7], cost: { SIL: 11 }, buildTime: 1.5 })).toEqual({ kind: 'SOL', tiles: [7], valid: true, tileIndex: 7, cost: { SIL: 11 }, buildTime: 1.5 });
    expect(placementPreview('SOL', 8, { ok: false, reason: 'BAD_TERRAIN', detail: 'woda', tiles: [8] })).toEqual({ kind: 'SOL', tiles: [8], valid: false, tileIndex: 8, reason: 'BAD_TERRAIN', detail: 'woda' });
  });
});
