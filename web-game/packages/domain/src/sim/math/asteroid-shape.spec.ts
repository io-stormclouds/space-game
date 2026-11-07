import { ASTEROID_ID, INITIAL_BODIES } from '../config/initial-world';
import { asteroidShape, depletionScale } from './asteroid-shape';
import { fbm, hash3, valueNoise } from './seeded-noise';
import { length, vec3 } from './vec3';

const asteroid = INITIAL_BODIES.find((b) => b.id === ASTEROID_ID)!;

describe('seeded noise', () => {
  it('hash is deterministic and in [0, 1)', () => {
    expect(hash3(7, 1, 2, 3)).toBe(hash3(7, 1, 2, 3));
    expect(hash3(7, 1, 2, 3)).not.toBe(hash3(8, 1, 2, 3));
    for (let i = 0; i < 1000; i++) {
      const h = hash3(3, i, i * 7, -i);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });

  it('value noise and fbm stay within [0, 1] and are continuous', () => {
    for (let i = 0; i < 500; i++) {
      const p = vec3(Math.sin(i) * 10, Math.cos(i * 1.3) * 10, i * 0.01);
      const v = valueNoise(5, p);
      const f = fbm(5, p);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThanOrEqual(1);
      const near = valueNoise(5, vec3(p.x + 1e-4, p.y, p.z));
      expect(Math.abs(near - v)).toBeLessThan(1e-2);
    }
  });
});

describe('asteroidShape', () => {
  it('is deterministic for the same seed and differs for another seed', () => {
    const a = asteroidShape(asteroid);
    const b = asteroidShape(asteroid);
    expect(a).toEqual(b);
    const c = asteroidShape({ ...asteroid, shape: { seed: 99, roughness: 0.3 } });
    expect(c.vertices).not.toEqual(a.vertices);
  });

  it('has 162 vertices / 320 faces at detail 4, radii within R × (1 ± roughness)', () => {
    const s = asteroidShape(asteroid, 4);
    expect(s.vertices).toHaveLength(162);
    expect(s.faces).toHaveLength(320);
    const R = asteroid.radius;
    let min = Infinity;
    let max = 0;
    for (const v of s.vertices) {
      const r = length(v);
      min = Math.min(min, r);
      max = Math.max(max, r);
      expect(r).toBeGreaterThanOrEqual(R * 0.7 - 1e-9);
      expect(r).toBeLessThanOrEqual(R * 1.3 + 1e-9);
    }
    // actually lumpy, not a sphere
    expect(max - min).toBeGreaterThan(R * 0.1);
  });

  it('is a closed, outward-oriented mesh', () => {
    const s = asteroidShape(asteroid);
    const edges = new Map<string, number>();
    for (const [a, b, c] of s.faces) {
      const va = s.vertices[a], vb = s.vertices[b], vc = s.vertices[c];
      const abx = vb.x - va.x, aby = vb.y - va.y, abz = vb.z - va.z;
      const acx = vc.x - va.x, acy = vc.y - va.y, acz = vc.z - va.z;
      const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
      expect(nx * va.x + ny * va.y + nz * va.z).toBeGreaterThan(0);
      for (const [p, q] of [[a, b], [b, c], [c, a]]) {
        const key = p < q ? `${p}-${q}` : `${q}-${p}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    for (const n of edges.values()) expect(n).toBe(2);
    expect(s.vertices.length - edges.size + s.faces.length).toBe(2);
  });
});

describe('depletionScale', () => {
  it('follows the cube root of the remaining fraction with a floor', () => {
    expect(depletionScale(500, 500)).toBe(1);
    expect(depletionScale(250, 500)).toBeCloseTo(0.7937, 3);
    expect(depletionScale(450, 500)).toBeCloseTo(0.9655, 3);
    expect(depletionScale(0, 500)).toBe(0.4);
    expect(depletionScale(10, 500)).toBe(0.4); // cbrt(0.02) = 0.27 < floor
    expect(depletionScale(600, 500)).toBe(1);
    expect(depletionScale(0, 0)).toBe(1);
  });
});
