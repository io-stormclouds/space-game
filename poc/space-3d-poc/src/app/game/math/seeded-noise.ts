import { Vec3 } from './vec3';

/** Deterministic integer hash → [0, 1). */
export function hash3(seed: number, x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x9e3779b1) ^ Math.imul(seed | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

const smooth = (t: number): number => t * t * (3 - 2 * t);
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Trilinear value noise in [0, 1]. */
export function valueNoise(seed: number, p: Vec3): number {
  const x0 = Math.floor(p.x), y0 = Math.floor(p.y), z0 = Math.floor(p.z);
  const fx = smooth(p.x - x0), fy = smooth(p.y - y0), fz = smooth(p.z - z0);
  const c = (dx: number, dy: number, dz: number): number => hash3(seed, x0 + dx, y0 + dy, z0 + dz);
  const x00 = mix(c(0, 0, 0), c(1, 0, 0), fx);
  const x10 = mix(c(0, 1, 0), c(1, 1, 0), fx);
  const x01 = mix(c(0, 0, 1), c(1, 0, 1), fx);
  const x11 = mix(c(0, 1, 1), c(1, 1, 1), fx);
  return mix(mix(x00, x10, fy), mix(x01, x11, fy), fz);
}

/** Fractal sum of value noise, normalised to [0, 1]. */
export function fbm(seed: number, p: Vec3, octaves = 3): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = 1;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(seed + o * 101, { x: p.x * freq, y: p.y * freq, z: p.z * freq });
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}
