import { Vec3 } from '../math/vec3';
import { TileFrame } from './tile-frame';

const DEG = Math.PI / 180;

/**
 * Warps a point of the regular kit hexagon (x, z in kit units, y up with the top at 1) onto the tile of
 * a Goldberg grid so that the hexagon's outline becomes the tile's outline: a point at fraction `f` of
 * the apothem lands at fraction `f` of the way from the centre to the matching boundary point, then is
 * pushed radially to `R + (y − 1)·s`. `k0` rotates the kit hexagon by whole sides. Pentagons (m = 5)
 * work with the same mapping (six kit sectors squeeze into five) but the terrain layer does not use it
 * for them.
 */
export function warpPoint(frame: TileFrame, k0: number, x: number, y: number, z: number, radius: number, s: number, out: Vec3): Vec3 {
  const { corners: S, m, center: C } = frame;
  const r = Math.hypot(x, z);
  const theta = Math.atan2(z, x);
  const kFlat = Math.round(theta / (60 * DEG));
  const delta = theta - kFlat * 60 * DEG;
  const frac = Math.min(r * Math.cos(delta), 1);
  const sector = ((((theta / DEG - 30) % 360) + 360) % 360) / 60; // 0..6 between corners
  const st = (sector * m) / 6;
  const j = Math.floor(st) % m;
  const g = st - Math.floor(st);
  const a = S[(k0 + j) % m];
  const b = S[(k0 + j + 1) % m];
  const bx = a.x + (b.x - a.x) * g;
  const by = a.y + (b.y - a.y) * g;
  const bz = a.z + (b.z - a.z) * g;
  const px = C.x + (bx - C.x) * frac;
  const py = C.y + (by - C.y) * frac;
  const pz = C.z + (bz - C.z) * frac;
  const k = (radius + (y - 1) * s) / Math.hypot(px, py, pz);
  out.x = px * k;
  out.y = py * k;
  out.z = pz * k;
  return out;
}
