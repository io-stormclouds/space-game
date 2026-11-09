import { buildWorldGrids } from '../scenario';
import { TAU_CETI_BODIES, TC_C } from '../scenarios/tau-ceti';
import { buildGoldbergGrid } from '../math/goldberg-grid';
import { Vec3, vec3 } from '../math/vec3';
import { MAX_ROCKS, MAX_TREES, dressTerrain, generateTerrain } from './terrain-generator';
import { KIT_CORNER_RADIUS, buildTileFrames, kitScale } from './tile-frame';
import { ROAD_MASKS } from './tile-variant';
import { warpPoint } from './tile-warp';

const MEDIEVAL_ID = TC_C;
const body = TAU_CETI_BODIES.find((b) => b.id === MEDIEVAL_ID)!;
const grids = buildWorldGrids(TAU_CETI_BODIES);
const grid = grids.get(MEDIEVAL_ID)!;
const plan = dressTerrain(grid);
const frames = buildTileFrames(grid);
const R = grid.radius;
const s = kitScale(frames);
const len = (a: Vec3): number => Math.hypot(a.x, a.y, a.z);
const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

describe('tile frames', () => {
  it('sort corners and find the neighbour across every edge', () => {
    for (const f of frames) {
      const t = grid.tiles[f.index];
      expect(f.m).toBe(t.kind === 'PENT' ? 5 : 6);
      expect(f.corners.length).toBe(f.m);
      expect(f.edgeNb.length).toBe(f.m);
      for (const nb of f.edgeNb) expect(t.neighbors).toContain(nb);
      expect(new Set(f.edgeNb).size).toBe(f.m); // each side faces a different tile
      // the neighbour across the edge also lists this tile across one of its edges
      for (const nb of f.edgeNb) expect(frames[nb].edgeNb).toContain(f.index);
    }
  });

  it('scales the kit so a hexagon corner radius matches the grid', () => {
    expect(s).toBeGreaterThan(3.4);
    expect(s).toBeLessThan(4.1);
    expect(KIT_CORNER_RADIUS).toBeCloseTo(1.1547, 4);
  });
});

describe('warpPoint', () => {
  const out = vec3();
  it('puts the kit top centre on the tile centre at the body radius', () => {
    for (const f of frames) {
      warpPoint(f, 0, 0, 1, 0, R, s, out);
      expect(len(out)).toBeCloseTo(R, 6);
      expect(dist(out, f.center)).toBeLessThan(1e-6);
    }
  });

  it('maps the six kit corners onto the tile corners for every rotation k0', () => {
    for (const f of frames.filter((x) => x.m === 6)) {
      for (const k0 of [0, 2, 5]) {
        for (let c = 0; c < 6; c++) {
          const a = ((30 + 60 * c) * Math.PI) / 180;
          warpPoint(f, k0, KIT_CORNER_RADIUS * Math.cos(a), 1, KIT_CORNER_RADIUS * Math.sin(a), R, s, out);
          expect(dist(out, f.corners[(k0 + c) % 6])).toBeLessThan(1e-6);
        }
      }
    }
  });

  it('lets neighbouring tiles meet: their shared outline points coincide', () => {
    for (const f of frames.filter((x) => x.m === 6).slice(0, 80)) {
      for (let j = 0; j < 6; j++) {
        const nb = frames[f.edgeNb[j]];
        if (nb.m !== 6) continue;
        // kit side j is the flat at angle (j - 5) * 60 deg (k0 = 0): its mid-point is the apothem point
        const side = (j + 1) % 6;
        const a = (side * 60 * Math.PI) / 180;
        warpPoint(f, 0, Math.cos(a), 0.95, Math.sin(a), R, s, out);
        // the same physical point seen from the neighbour: the midpoint of the shared edge
        const mid = { x: 0, y: 0, z: 0 };
        mid.x = (f.corners[j].x + f.corners[(j + 1) % 6].x) / 2;
        mid.y = (f.corners[j].y + f.corners[(j + 1) % 6].y) / 2;
        mid.z = (f.corners[j].z + f.corners[(j + 1) % 6].z) / 2;
        const k = (R - 0.05 * s) / len(mid);
        expect(dist(out, vec3(mid.x * k, mid.y * k, mid.z * k))).toBeLessThan(1e-6);
      }
    }
  });
});

describe('terrain plan of the medieval planet', () => {
  it('is deterministic', () => {
    const again = generateTerrain(buildGoldbergGrid(MEDIEVAL_ID, body.radius, body.surfaceGrid!.frequency, body.surfaceGrid!.depositSeed, body.surfaceGrid!.depositWeights), { biome: 'medieval', seed: 2, aim: vec3(-Math.cos(body.initialAngle), 0.9, -Math.sin(body.initialAngle)) });
    expect(again.kinds).toEqual(plan.kinds);
    expect(again.variants).toEqual(plan.variants);
    expect(again.decor).toEqual(plan.decor);
    expect([...again.road]).toEqual([...plan.road]);
  });

  it('gives hexagons a kit tile and pentagons none', () => {
    grid.tiles.forEach((t, i) => {
      if (t.kind === 'PENT') expect(plan.variants[i]).toBeNull();
      else expect(plan.variants[i]).not.toBeNull();
    });
    expect(plan.variants.filter((v) => v === null).length).toBe(12);
  });

  it('uses only kit files that exist in the asset folder and a valid rotation', () => {
    const known = new Set([
      'hex_forest', 'hex_water', 'hex_forest_transitionA', 'hex_forest_transitionB',
      ...'ABCD'.split('').map((l) => `hex_forest_water${l}`),
      'hex_forest_roadA', ...Object.keys(ROAD_MASKS).map((l) => `hex_forest_road${l}`),
    ]);
    for (const v of plan.variants) {
      if (!v) continue;
      expect(known.has(v.id), v.id).toBe(true);
      expect(v.k0).toBeGreaterThanOrEqual(0);
      expect(v.k0).toBeLessThan(6);
    }
  });

  it('keeps water, roads, buildings and raised transitions off deposits; water and roads off pentagons', () => {
    grid.tiles.forEach((t, i) => {
      if (t.kind === 'PENT') {
        expect(plan.kinds[i]).not.toBe('water');
        expect(plan.road.has(i)).toBe(false);
      }
      if (t.deposit) {
        expect(plan.kinds[i]).not.toBe('water');
        expect(plan.road.has(i)).toBe(false);
        expect(plan.variants[i]?.id.startsWith('hex_forest_transition')).toBeFalsy();
        expect(plan.decor.filter((d) => d.tile === i)).toEqual([]);
      }
    });
  });

  it('builds a castle with roads, houses and workshops far from every pentagon', () => {
    const c = plan.settlementCenter!;
    expect(c).not.toBeNull();
    expect(grid.tiles[c].kind).toBe('HEX');
    expect(plan.decor.some((d) => d.model === 'castle' && d.tile === c)).toBe(true);
    const models = new Set(plan.decor.map((d) => d.model));
    for (const m of ['castle', 'watchtower', 'market', 'barracks', 'house', 'farm_plot']) expect(models.has(m), m).toBe(true);
    // every building (not the scattered trees and rocks) sits on a hexagon
    for (const d of plan.decor.filter((x) => !/^(detail_|mountain)/.test(x.model))) expect(grid.tiles[d.tile].kind).toBe('HEX');
    // roads form a network: most road tiles touch another road tile
    const linked = [...plan.road].filter((i) => grid.tiles[i].neighbors.some((n) => plan.road.has(n)));
    expect(plan.road.size).toBeGreaterThan(10);
    expect(linked.length / plan.road.size).toBeGreaterThan(0.8);
    for (const i of plan.road) expect(plan.variants[i]!.id).toMatch(/^hex_forest_road[A-M]$/);
  });

  it('mixes the classes and respects the decor budget', () => {
    const share = (k: string): number => plan.kinds.filter((x) => x === k).length / plan.kinds.length;
    expect(share('grass')).toBeGreaterThan(0.2);
    expect(share('water')).toBeGreaterThan(0.05);
    expect(share('water')).toBeLessThan(0.4);
    expect(share('forest')).toBeGreaterThan(0.05);
    const trees = plan.decor.filter((d) => d.model.startsWith('detail_tree')).length;
    const rocks = plan.decor.filter((d) => ['detail_rocks', 'detail_rocks_small', 'mountain'].includes(d.model)).length;
    expect(trees).toBeLessThanOrEqual(MAX_TREES);
    expect(rocks).toBeLessThanOrEqual(MAX_ROCKS);
    expect(trees).toBeGreaterThan(20);
  });
});
