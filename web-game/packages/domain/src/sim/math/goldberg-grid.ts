import { BodyId } from '../../shared/ids';
import { PlanetGrid, Tile, tileId } from '../models/planet-grid.model';
import { generateDeposits } from './deposit-generator';
import { geodesicSphere } from './geodesic';
import { Vec3, normalize, scale, vec3 } from './vec3';

/**
 * Goldberg polyhedron GP(n,0) on a sphere: the dual of the frequency-n geodesic sphere.
 * Tiles correspond to geodesic vertices; tile corners are the (projected) centroids of the
 * geodesic faces around that vertex. Pure TypeScript, deterministic.
 */
export function buildGoldbergGrid(bodyId: BodyId, radius: number, frequency: number, depositSeed?: number): PlanetGrid {
  const geo = geodesicSphere(frequency);
  const vertexCount = geo.vertices.length;

  // faces around each vertex, and neighbour vertex sets
  const facesAt: number[][] = Array.from({ length: vertexCount }, () => []);
  const neighborsAt: Set<number>[] = Array.from({ length: vertexCount }, () => new Set());
  geo.faces.forEach((f, fi) => {
    for (let k = 0; k < 3; k++) {
      const a = f[k];
      facesAt[a].push(fi);
      neighborsAt[a].add(f[(k + 1) % 3]);
      neighborsAt[a].add(f[(k + 2) % 3]);
    }
  });

  // centroids of faces projected to the sphere → tile corners
  const corners: Vec3[] = geo.faces.map(([a, b, c]) => {
    const va = geo.vertices[a];
    const vb = geo.vertices[b];
    const vc = geo.vertices[c];
    const m = vec3((va.x + vb.x + vc.x) / 3, (va.y + vb.y + vc.y) / 3, (va.z + vb.z + vc.z) / 3);
    return scale(m, normalize(m, m), radius);
  });

  const neighborLists = neighborsAt.map((s) => [...s]);
  const deposits = depositSeed === undefined ? new Map() : generateDeposits(neighborLists, depositSeed);

  const tiles: Tile[] = [];
  for (let i = 0; i < vertexCount; i++) {
    const normal = geo.vertices[i];
    const center = scale(vec3(), normal, radius);
    const { u, v } = tangentBasis(normal);
    const angleOf = (p: Vec3): number => {
      const dx = p.x - center.x, dy = p.y - center.y, dz = p.z - center.z;
      return Math.atan2(dx * v.x + dy * v.y + dz * v.z, dx * u.x + dy * u.y + dz * u.z);
    };
    const vertices = facesAt[i]
      .map((fi) => corners[fi])
      .sort((p, q) => angleOf(p) - angleOf(q));
    const neighbors = [...neighborsAt[i]].sort((p, q) => angleOf(geo.vertices[p]) - angleOf(geo.vertices[q]));
    tiles.push({
      id: tileId(bodyId, i),
      index: i,
      kind: vertices.length === 5 ? 'PENT' : 'HEX',
      center,
      normal,
      vertices,
      neighbors,
      deposit: deposits.get(i) ?? null,
    });
  }

  const area = (4 * Math.PI * radius * radius) / vertexCount;
  const tileEdge = Math.sqrt(area / ((3 * Math.sqrt(3)) / 2));
  return { bodyId, frequency: geo.frequency, radius, tiles, tileEdge };
}

/** Area of a tile = sum of the fan triangles from its centre. */
export function tileArea(tile: Tile): number {
  let total = 0;
  const c = tile.center;
  const n = tile.vertices.length;
  for (let k = 0; k < n; k++) {
    const p = tile.vertices[k];
    const q = tile.vertices[(k + 1) % n];
    const ax = p.x - c.x, ay = p.y - c.y, az = p.z - c.z;
    const bx = q.x - c.x, by = q.y - c.y, bz = q.z - c.z;
    total += 0.5 * Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx);
  }
  return total;
}

/** Approximate flat-to-flat width of a hexagonal tile. */
export function tileWidth(grid: PlanetGrid): number {
  return grid.tileEdge * Math.sqrt(3);
}

/** Right-handed tangent basis (u, v) with u × v = n, so increasing angle = CCW seen from outside. */
function tangentBasis(n: Vec3): { u: Vec3; v: Vec3 } {
  const ref = Math.abs(n.y) < 0.9 ? vec3(0, 1, 0) : vec3(1, 0, 0);
  // u = normalize(ref × n), v = n × u
  const u = normalize(vec3(), vec3(ref.y * n.z - ref.z * n.y, ref.z * n.x - ref.x * n.z, ref.x * n.y - ref.y * n.x));
  const v = vec3(n.y * u.z - n.z * u.y, n.z * u.x - n.x * u.z, n.x * u.y - n.y * u.x);
  return { u, v };
}
