import { INITIAL_BODIES } from '../config/initial-world';
import { bodyId } from '../../shared/ids';
import { geodesicSphere } from './geodesic';
import { buildGoldbergGrid, tileArea, tileWidth } from './goldberg-grid';
import { Vec3, length } from './vec3';

const BODY = bodyId('test-body');

describe('geodesicSphere', () => {
  it.each([1, 2, 4, 8])('frequency %i has 10n²+2 unit vertices and 20n² outward faces', (n) => {
    const g = geodesicSphere(n);
    expect(g.vertices).toHaveLength(10 * n * n + 2);
    expect(g.faces).toHaveLength(20 * n * n);
    for (const v of g.vertices) expect(length(v)).toBeCloseTo(1, 9);
    for (const [a, b, c] of g.faces) expect(outward(g.vertices[a], g.vertices[b], g.vertices[c])).toBeGreaterThan(0);
  });

  it('every edge belongs to exactly two faces (closed mesh, Euler V − E + F = 2)', () => {
    const g = geodesicSphere(4);
    const edges = new Map<string, number>();
    for (const [a, b, c] of g.faces) {
      for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        const key = p < q ? `${p}-${q}` : `${q}-${p}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    for (const count of edges.values()) expect(count).toBe(2);
    expect(g.vertices.length - edges.size + g.faces.length).toBe(2);
  });
});

describe('buildGoldbergGrid', () => {
  it.each([2, 4, 8])('GP(%i,0): 10n²+2 tiles, exactly 12 pentagons', (n) => {
    const grid = buildGoldbergGrid(BODY, 50, n);
    expect(grid.tiles).toHaveLength(10 * n * n + 2);
    expect(grid.tiles.filter((t) => t.kind === 'PENT')).toHaveLength(12);
    expect(grid.tiles.filter((t) => t.kind === 'HEX')).toHaveLength(10 * n * n + 2 - 12);
  });

  it('Euler characteristic of the dual: V − E + F = 2', () => {
    const grid = buildGoldbergGrid(BODY, 50, 4);
    const F = grid.tiles.length;
    const E = grid.tiles.reduce((s, t) => s + t.neighbors.length, 0) / 2;
    const V = grid.tiles.reduce((s, t) => s + t.vertices.length, 0) / 3; // each corner shared by 3 tiles
    expect(V - E + F).toBe(2);
  });

  it('every tile has as many neighbours as corners and adjacency is symmetric', () => {
    const grid = buildGoldbergGrid(BODY, 50, 4);
    for (const t of grid.tiles) {
      expect(t.neighbors.length).toBe(t.vertices.length);
      expect(new Set(t.neighbors).size).toBe(t.neighbors.length);
      for (const n of t.neighbors) expect(grid.tiles[n].neighbors).toContain(t.index);
    }
  });

  it('corners lie on the sphere and are ordered CCW around the outward normal', () => {
    const grid = buildGoldbergGrid(BODY, 50, 4);
    for (const t of grid.tiles) {
      expect(length(t.center)).toBeCloseTo(50, 6);
      for (const v of t.vertices) expect(length(v)).toBeCloseTo(50, 6);
      const n = t.vertices.length;
      for (let k = 0; k < n; k++) {
        // signed area of (center, v_k, v_k+1) projected on the normal must be positive
        expect(outward(t.center, t.vertices[k], t.vertices[(k + 1) % n])).toBeGreaterThan(0);
      }
    }
  });

  it('hexagon areas are reasonably uniform (min/max ≥ 0.6), pentagons ≥ 0.4 of the largest, all sum to the sphere area', () => {
    const grid = buildGoldbergGrid(BODY, 50, 8);
    const areas = grid.tiles.map(tileArea);
    const hexAreas = grid.tiles.filter((t) => t.kind === 'HEX').map(tileArea);
    const pentAreas = grid.tiles.filter((t) => t.kind === 'PENT').map(tileArea);
    const max = Math.max(...areas);
    expect(Math.min(...hexAreas) / max).toBeGreaterThanOrEqual(0.6);
    expect(Math.min(...pentAreas) / max).toBeGreaterThanOrEqual(0.4);
    const total = areas.reduce((a, b) => a + b, 0);
    expect(total / (4 * Math.PI * 50 * 50)).toBeGreaterThan(0.97);
    expect(total / (4 * Math.PI * 50 * 50)).toBeLessThan(1.0);
  });

  it('is deterministic: two builds are identical', () => {
    const a = buildGoldbergGrid(BODY, 50, 6);
    const b = buildGoldbergGrid(BODY, 50, 6);
    expect(a).toEqual(b);
    expect(a.tiles[17].id).toBe('test-body:17');
  });

  it('builds GP(8,0) in well under a second', () => {
    const t0 = performance.now();
    buildGoldbergGrid(BODY, 50, 8);
    const ms = performance.now() - t0;
    if (ms > 50) console.warn(`GP(8,0) generation took ${ms.toFixed(0)} ms`);
    expect(ms).toBeLessThan(1000);
  });

  it('world config: every body with a grid has tiles 6–8 units wide (consistent picking)', () => {
    const gridded = INITIAL_BODIES.filter((b) => b.surfaceGrid);
    expect(gridded.length).toBeGreaterThanOrEqual(2);
    for (const b of gridded) {
      const grid = buildGoldbergGrid(b.id, b.radius, b.surfaceGrid!.frequency);
      const w = tileWidth(grid);
      expect(w, `${b.name}: tile width ${w.toFixed(2)}`).toBeGreaterThanOrEqual(5.5);
      expect(w, `${b.name}: tile width ${w.toFixed(2)}`).toBeLessThanOrEqual(8.5);
    }
  });
});

function outward(a: Vec3, b: Vec3, c: Vec3): number {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const acx = c.x - a.x, acy = c.y - a.y, acz = c.z - a.z;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  return nx * a.x + ny * a.y + nz * a.z;
}
