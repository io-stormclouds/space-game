import { PlanetGrid } from '../models/planet-grid.model';
import { Vec3 } from '../math/vec3';

/**
 * Local frame of one tile: X/Z span the tangent plane, Y is the outward normal. `corners` are the tile's
 * vertices sorted by angle (counter-clockwise seen from outside, the order the fan and the warp use).
 */
export interface TileFrame {
  index: number;
  /** 5 for the twelve pentagons, 6 for hexagons. */
  m: number;
  center: Vec3;
  x: Vec3;
  y: Vec3;
  z: Vec3;
  corners: ReadonlyArray<Vec3>;
  /** `edgeNb[j]` = tile across the edge `corners[j] → corners[j + 1]`. */
  edgeNb: ReadonlyArray<number>;
  /** Mean centre-to-corner distance. */
  rMean: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const unit = (a: Vec3): Vec3 => {
  const l = Math.hypot(a.x, a.y, a.z) || 1;
  return { x: a.x / l, y: a.y / l, z: a.z / l };
};

/** Frames of every tile of a grid. Pure and deterministic. */
export function buildTileFrames(grid: PlanetGrid): TileFrame[] {
  return grid.tiles.map((t) => {
    const y = t.normal;
    const d0 = sub(t.vertices[0], t.center);
    const x = unit(sub(d0, { x: y.x * dot(d0, y), y: y.y * dot(d0, y), z: y.z * dot(d0, y) }));
    const z = cross(x, y);
    const corners = t.vertices
      .map((p) => {
        const d = sub(p, t.center);
        return { p, phi: Math.atan2(dot(d, z), dot(d, x)) };
      })
      .sort((a, b) => a.phi - b.phi)
      .map((c) => c.p);
    const m = corners.length;
    const edgeNb = corners.map((p, j) => {
      const q = corners[(j + 1) % m];
      const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, z: (p.z + q.z) / 2 };
      let best = -1;
      let bd = Infinity;
      for (const nb of t.neighbors) {
        const c = grid.tiles[nb].center;
        const d = (mid.x - c.x) ** 2 + (mid.y - c.y) ** 2 + (mid.z - c.z) ** 2;
        if (d < bd) {
          bd = d;
          best = nb;
        }
      }
      return best;
    });
    const rMean = corners.reduce((s, p) => s + Math.hypot(p.x - t.center.x, p.y - t.center.y, p.z - t.center.z), 0) / m;
    return { index: t.index, m, center: t.center, x, y, z, corners, edgeNb, rMean };
  });
}

/** Scale that fits the hex kit tile (corner radius 1.1547) to the grid: mean over hexagons. */
export function kitScale(frames: ReadonlyArray<TileFrame>): number {
  const hex = frames.filter((f) => f.m === 6);
  return hex.reduce((s, f) => s + f.rMean, 0) / hex.length / KIT_CORNER_RADIUS;
}

/** Hexagon of the KayKit kit: flat sides on ±X (apothem 1), corners on ±Z (radius 2/√3). */
export const KIT_CORNER_RADIUS = 2 / Math.sqrt(3);
/** Top of the kit tile; the sphere surface sits here. */
export const KIT_TOP = 1;
