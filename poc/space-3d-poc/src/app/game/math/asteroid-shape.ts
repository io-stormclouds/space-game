import { BodyId } from '../../shared/ids';
import { CelestialBody } from '../models/celestial-body.model';
import { geodesicSphere } from './geodesic';
import { fbm } from './seeded-noise';
import { Vec3, scale, vec3 } from './vec3';

/** Irregular closed mesh for an asteroid, in the body's local frame. */
export interface AsteroidShape {
  bodyId: BodyId;
  seed: number;
  /** 10·detail² + 2 points, radii within radius × (1 ± roughness). */
  vertices: ReadonlyArray<Vec3>;
  /** CCW seen from outside. */
  faces: ReadonlyArray<[number, number, number]>;
}

/** Spatial frequency of the noise over the unit sphere; larger = lumpier. */
const NOISE_SCALE = 1.8;
const NOISE_OFFSET = 37.3;

export function asteroidShape(body: CelestialBody, detail = 4): AsteroidShape {
  const seed = body.shape?.seed ?? 1;
  const roughness = body.shape?.roughness ?? 0.3;
  const geo = geodesicSphere(detail);
  const p = vec3();
  const vertices = geo.vertices.map((dir) => {
    p.x = dir.x * NOISE_SCALE + NOISE_OFFSET;
    p.y = dir.y * NOISE_SCALE + NOISE_OFFSET;
    p.z = dir.z * NOISE_SCALE + NOISE_OFFSET;
    const n = fbm(seed, p) * 2 - 1; // [-1, 1]
    return scale(vec3(), dir, body.radius * (1 + roughness * n));
  });
  return { bodyId: body.id, seed, vertices, faces: geo.faces };
}

/**
 * Visual scale of a body whose minerals are being extracted: volume ∝ remaining minerals,
 * never below `floor` so the rock stays a target.
 */
export function depletionScale(minerals: number, initial: number, floor = 0.4): number {
  if (initial <= 0) return 1;
  const ratio = Math.min(1, Math.max(0, minerals / initial));
  return Math.max(floor, Math.cbrt(ratio));
}
