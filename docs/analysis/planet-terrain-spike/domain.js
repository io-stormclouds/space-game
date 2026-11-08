// packages/domain/src/sim/models/planet-grid.model.ts
var tileId = (bodyId, index) => `${bodyId}:${index}`;

// packages/domain/src/sim/math/seeded-noise.ts
function hash3(seed, x, y, z) {
  let h = Math.imul(x | 0, 668265261) ^ Math.imul(y | 0, 374761393) ^ Math.imul(z | 0, 2654435761) ^ Math.imul(seed | 0, 2246822507);
  h = Math.imul(h ^ h >>> 15, 739982445);
  h = Math.imul(h ^ h >>> 12, 695872825);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
var smooth = (t) => t * t * (3 - 2 * t);
var mix = (a, b, t) => a + (b - a) * t;
function valueNoise(seed, p) {
  const x0 = Math.floor(p.x), y0 = Math.floor(p.y), z0 = Math.floor(p.z);
  const fx = smooth(p.x - x0), fy = smooth(p.y - y0), fz = smooth(p.z - z0);
  const c = (dx, dy, dz) => hash3(seed, x0 + dx, y0 + dy, z0 + dz);
  const x00 = mix(c(0, 0, 0), c(1, 0, 0), fx);
  const x10 = mix(c(0, 1, 0), c(1, 1, 0), fx);
  const x01 = mix(c(0, 0, 1), c(1, 0, 1), fx);
  const x11 = mix(c(0, 1, 1), c(1, 1, 1), fx);
  return mix(mix(x00, x10, fy), mix(x01, x11, fy), fz);
}
function fbm(seed, p, octaves = 3) {
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

// packages/domain/src/sim/math/deposit-generator.ts
var DEFAULT_DEPOSIT_OPTIONS = { seedChance: 0.035, spreadChance: 0.5 };
var POC_DEPOSIT_WEIGHTS = { FER: 1, KRI: 1, SIL: 1 };
function generateDeposits(neighbors, seed, opts = DEFAULT_DEPOSIT_OPTIONS, weights = POC_DEPOSIT_WEIGHTS) {
  const out = /* @__PURE__ */ new Map();
  const pick = picker(weights);
  const n = neighbors.length;
  for (let i = 0; i < n; i++) {
    if (hash3(seed, i, 0, 0) >= opts.seedChance) continue;
    const resource = pick(hash3(seed, i, 1, 0));
    if (!out.has(i)) out.set(i, { resource, amount: 200 + Math.round(hash3(seed, i, 2, 0) * 30) * 10 });
    for (const nb of neighbors[i]) {
      if (out.has(nb)) continue;
      if (hash3(seed, nb, 3, i) < opts.spreadChance) {
        out.set(nb, { resource, amount: 100 + Math.round(hash3(seed, nb, 4, i) * 20) * 10 });
      }
    }
  }
  return out;
}
function picker(weights) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  if (entries.length === 0) throw new Error("deposit weights are empty");
  const equal = entries.every(([, w]) => w === entries[0][1]);
  if (equal) return (h) => entries[Math.min(entries.length - 1, Math.floor(h * entries.length))][0];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  return (h) => {
    let acc = 0;
    for (const [code, w] of entries) {
      acc += w / total;
      if (h < acc) return code;
    }
    return entries[entries.length - 1][0];
  };
}

// packages/domain/src/sim/math/vec3.ts
var vec3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
function set(out, x, y, z) {
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}
function scale(out, a, s) {
  return set(out, a.x * s, a.y * s, a.z * s);
}
function length(a) {
  return Math.hypot(a.x, a.y, a.z);
}
function normalize(out, a) {
  const l = length(a);
  return l > 1e-12 ? scale(out, a, 1 / l) : set(out, 0, 0, 1);
}

// packages/domain/src/sim/math/geodesic.ts
var T = (1 + Math.sqrt(5)) / 2;
var ICO_VERTICES = [
  vec3(-1, T, 0),
  vec3(1, T, 0),
  vec3(-1, -T, 0),
  vec3(1, -T, 0),
  vec3(0, -1, T),
  vec3(0, 1, T),
  vec3(0, -1, -T),
  vec3(0, 1, -T),
  vec3(T, 0, -1),
  vec3(T, 0, 1),
  vec3(-T, 0, -1),
  vec3(-T, 0, 1)
];
var ICO_FACES = [
  [0, 11, 5],
  [0, 5, 1],
  [0, 1, 7],
  [0, 7, 10],
  [0, 10, 11],
  [1, 5, 9],
  [5, 11, 4],
  [11, 10, 2],
  [10, 7, 6],
  [7, 1, 8],
  [3, 9, 4],
  [3, 4, 2],
  [3, 2, 6],
  [3, 6, 8],
  [3, 8, 9],
  [4, 9, 5],
  [2, 4, 11],
  [6, 2, 10],
  [8, 6, 7],
  [9, 8, 1]
];
function geodesicSphere(frequency) {
  const n = Math.max(1, Math.floor(frequency));
  const vertices = [];
  const faces = [];
  const index = /* @__PURE__ */ new Map();
  const vertexFor = (p) => {
    const key = `${p.x.toFixed(6)},${p.y.toFixed(6)},${p.z.toFixed(6)}`;
    let i = index.get(key);
    if (i === void 0) {
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
    const grid = [];
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
function orient(f, v) {
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

// packages/domain/src/sim/math/goldberg-grid.ts
function buildGoldbergGrid(bodyId, radius, frequency, depositSeed, depositWeights) {
  const geo = geodesicSphere(frequency);
  const vertexCount = geo.vertices.length;
  const facesAt = Array.from({ length: vertexCount }, () => []);
  const neighborsAt = Array.from({ length: vertexCount }, () => /* @__PURE__ */ new Set());
  geo.faces.forEach((f, fi) => {
    for (let k = 0; k < 3; k++) {
      const a = f[k];
      facesAt[a].push(fi);
      neighborsAt[a].add(f[(k + 1) % 3]);
      neighborsAt[a].add(f[(k + 2) % 3]);
    }
  });
  const corners = geo.faces.map(([a, b, c]) => {
    const va = geo.vertices[a];
    const vb = geo.vertices[b];
    const vc = geo.vertices[c];
    const m = vec3((va.x + vb.x + vc.x) / 3, (va.y + vb.y + vc.y) / 3, (va.z + vb.z + vc.z) / 3);
    return scale(m, normalize(m, m), radius);
  });
  const neighborLists = neighborsAt.map((s) => [...s]);
  const deposits = depositSeed === void 0 ? /* @__PURE__ */ new Map() : generateDeposits(neighborLists, depositSeed, DEFAULT_DEPOSIT_OPTIONS, depositWeights);
  const tiles = [];
  for (let i = 0; i < vertexCount; i++) {
    const normal = geo.vertices[i];
    const center = scale(vec3(), normal, radius);
    const { u, v } = tangentBasis(normal);
    const angleOf = (p) => {
      const dx = p.x - center.x, dy = p.y - center.y, dz = p.z - center.z;
      return Math.atan2(dx * v.x + dy * v.y + dz * v.z, dx * u.x + dy * u.y + dz * u.z);
    };
    const vertices = facesAt[i].map((fi) => corners[fi]).sort((p, q) => angleOf(p) - angleOf(q));
    const neighbors = [...neighborsAt[i]].sort((p, q) => angleOf(geo.vertices[p]) - angleOf(geo.vertices[q]));
    tiles.push({
      id: tileId(bodyId, i),
      index: i,
      kind: vertices.length === 5 ? "PENT" : "HEX",
      center,
      normal,
      vertices,
      neighbors,
      deposit: deposits.get(i) ?? null
    });
  }
  const area = 4 * Math.PI * radius * radius / vertexCount;
  const tileEdge = Math.sqrt(area / (3 * Math.sqrt(3) / 2));
  return { bodyId, frequency: geo.frequency, radius, tiles, tileEdge };
}
function tileWidth(grid) {
  return grid.tileEdge * Math.sqrt(3);
}
function tangentBasis(n) {
  const ref = Math.abs(n.y) < 0.9 ? vec3(0, 1, 0) : vec3(1, 0, 0);
  const u = normalize(vec3(), vec3(ref.y * n.z - ref.z * n.y, ref.z * n.x - ref.x * n.z, ref.x * n.y - ref.y * n.x));
  const v = vec3(n.y * u.z - n.z * u.y, n.z * u.x - n.x * u.z, n.x * u.y - n.y * u.x);
  return { u, v };
}
export {
  buildGoldbergGrid,
  fbm,
  hash3,
  tileWidth,
  valueNoise
};
