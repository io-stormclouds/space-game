import { Vec3, normalize, set, vec3 } from './vec3';

/** Triangulated unit sphere: class-I subdivision of the icosahedron (frequency n). */
export interface GeodesicSphere {
  frequency: number;
  /** Unit vectors. 10·n² + 2 of them. */
  vertices: ReadonlyArray<Vec3>;
  /** Vertex index triples, counter-clockwise seen from outside. 20·n² of them. */
  faces: ReadonlyArray<[number, number, number]>;
}

const T = (1 + Math.sqrt(5)) / 2;

const ICO_VERTICES: ReadonlyArray<Vec3> = [
  vec3(-1, T, 0), vec3(1, T, 0), vec3(-1, -T, 0), vec3(1, -T, 0),
  vec3(0, -1, T), vec3(0, 1, T), vec3(0, -1, -T), vec3(0, 1, -T),
  vec3(T, 0, -1), vec3(T, 0, 1), vec3(-T, 0, -1), vec3(-T, 0, 1),
];

const ICO_FACES: ReadonlyArray<[number, number, number]> = [
  [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
  [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
  [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
  [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
];

/**
 * Builds the geodesic sphere of the given frequency (n ≥ 1). Deterministic: the same n
 * always yields the same vertex order, which is what makes tile ids stable.
 */
export function geodesicSphere(frequency: number): GeodesicSphere {
  const n = Math.max(1, Math.floor(frequency));
  const vertices: Vec3[] = [];
  const faces: [number, number, number][] = [];
  const index = new Map<string, number>();

  const vertexFor = (p: Vec3): number => {
    const key = `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`;
    let i = index.get(key);
    if (i === undefined) {
      i = vertices.length;
      index.set(key, i);
      vertices.push(p);
    }
    return i;
  };

  const tmp = vec3();
  for (const [ia, ib, ic] of ICO_FACES) {
    const a = ICO_VERTICES[ia];
    const b = ICO_VERTICES[ib];
    const c = ICO_VERTICES[ic];
    // grid[i][j] for i + j ≤ n, barycentric (n-i-j, i, j) / n
    const grid: number[][] = [];
    for (let i = 0; i <= n; i++) {
      grid.push([]);
      for (let j = 0; i + j <= n; j++) {
        const wa = (n - i - j) / n;
        const wb = i / n;
        const wc = j / n;
        set(tmp, a.x * wa + b.x * wb + c.x * wc, a.y * wa + b.y * wb + c.y * wc, a.z * wa + b.z * wb + c.z * wc);
        grid[i].push(vertexFor(normalize(vec3(), tmp)));
      }
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; i + j < n; j++) {
        faces.push(orient([grid[i][j], grid[i + 1][j], grid[i][j + 1]], vertices));
        if (i + j + 1 < n) faces.push(orient([grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]], vertices));
      }
    }
  }
  return { frequency: n, vertices, faces };
}

/** Ensures the face normal points away from the origin (CCW seen from outside). */
function orient(f: [number, number, number], v: ReadonlyArray<Vec3>): [number, number, number] {
  const a = v[f[0]];
  const b = v[f[1]];
  const c = v[f[2]];
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const acx = c.x - a.x, acy = c.y - a.y, acz = c.z - a.z;
  const nx = aby * acz - abz * acy;
  const ny = abz * acx - abx * acz;
  const nz = abx * acy - aby * acx;
  const outward = nx * (a.x + b.x + c.x) + ny * (a.y + b.y + c.y) + nz * (a.z + b.z + c.z);
  return outward >= 0 ? f : [f[0], f[2], f[1]];
}
