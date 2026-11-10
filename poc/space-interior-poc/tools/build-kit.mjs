// Asset pipeline for the Molten Maps SciFi kit (CC0).
//
//   node tools/build-kit.mjs            (npm run kit)
//
// Every source .glb embeds the same 1024x1024 gradient atlas (~181 kB), so the
// 136 files weigh ~26 MB of which ~24.6 MB are copies of one PNG. This script:
//   1. strips images/textures/samplers from each GLB and compacts its BIN chunk
//      (materials keep their names and factors; the editor binds ONE shared atlas
//      texture to five shared materials by material name at load time),
//   2. writes the slim models to public/assets/molten/models/<Id>.glb,
//   3. copies the atlas once to public/assets/molten/atlas.png,
//   4. measures every model (flattened scene bounds, triangles, material names)
//      and writes src/app/domain/catalog/kit-models.generated.ts.
// No dependencies: the GLB container is parsed by hand.
import { mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const pack = resolve(root, '../../resources/Molten Maps SciFi Asset Pack/Assets');
const srcDir = join(pack, 'gtlf');
const atlasSrc = join(pack, 'Textures + Materials', 'Gradient Texture Atlas by Imphenzia.png');
const outDir = join(root, 'public/assets/molten');
const modelsOut = join(outDir, 'models');
const tableOut = join(root, 'src/app/domain/catalog/kit-models.generated.ts');

const GLB_MAGIC = 0x46546c67; // 'glTF'
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

function readGlb(buf) {
  if (buf.readUInt32LE(0) !== GLB_MAGIC) throw new Error('not a GLB');
  let offset = 12;
  let json = null;
  let bin = null;
  while (offset < buf.length) {
    const len = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const data = buf.subarray(offset + 8, offset + 8 + len);
    if (type === CHUNK_JSON) json = JSON.parse(data.toString('utf8'));
    else if (type === CHUNK_BIN) bin = data;
    offset += 8 + len;
  }
  return { json, bin };
}

const pad4 = (n) => (n + 3) & ~3;

function writeGlb(json, bin) {
  const jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonLen = pad4(jsonBuf.length);
  const binLen = pad4(bin.length);
  const total = 12 + 8 + jsonLen + 8 + binLen;
  const out = Buffer.alloc(total, 0);
  out.writeUInt32LE(GLB_MAGIC, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonLen, 12);
  out.writeUInt32LE(CHUNK_JSON, 16);
  jsonBuf.copy(out, 20);
  out.fill(0x20, 20 + jsonBuf.length, 20 + jsonLen); // JSON padding = spaces
  const binAt = 20 + jsonLen;
  out.writeUInt32LE(binLen, binAt);
  out.writeUInt32LE(CHUNK_BIN, binAt + 4);
  bin.copy(out, binAt + 8);
  return out;
}

/** Removes images/textures/samplers and the image bufferViews; repacks BIN. */
function stripTextures(json, bin) {
  const dropViews = new Set((json.images ?? []).map((img) => img.bufferView).filter((v) => v !== undefined));
  for (const m of json.materials ?? []) {
    const pbr = m.pbrMetallicRoughness;
    if (pbr) {
      delete pbr.baseColorTexture;
      delete pbr.metallicRoughnessTexture;
    }
    delete m.emissiveTexture;
    delete m.normalTexture;
    delete m.occlusionTexture;
  }
  delete json.images;
  delete json.textures;
  delete json.samplers;

  const remap = new Map();
  const parts = [];
  const views = [];
  let cursor = 0;
  json.bufferViews.forEach((view, index) => {
    if (dropViews.has(index)) return;
    const start = view.byteOffset ?? 0;
    const bytes = bin.subarray(start, start + view.byteLength);
    const aligned = pad4(cursor);
    if (aligned > cursor) parts.push(Buffer.alloc(aligned - cursor, 0));
    cursor = aligned;
    remap.set(index, views.length);
    views.push({ ...view, byteOffset: cursor });
    parts.push(bytes);
    cursor += bytes.length;
  });
  json.bufferViews = views;
  for (const acc of json.accessors ?? []) {
    if (acc.bufferView !== undefined) acc.bufferView = remap.get(acc.bufferView);
  }
  const packed = Buffer.concat(parts);
  json.buffers = [{ byteLength: packed.length }];
  return packed;
}

// ---- bounds of the flattened scene (node transforms applied) ----
function trs(t = [0, 0, 0], r = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}
function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  return o;
}
const apply = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];

function measure(json) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  let tris = 0;
  const materials = new Set();
  const visit = (ni, parent) => {
    const n = json.nodes[ni];
    const m = mul(parent, n.matrix ?? trs(n.translation, n.rotation, n.scale));
    if (n.mesh !== undefined) {
      for (const prim of json.meshes[n.mesh].primitives) {
        const acc = json.accessors[prim.attributes.POSITION];
        for (const cx of [acc.min[0], acc.max[0]])
          for (const cy of [acc.min[1], acc.max[1]])
            for (const cz of [acc.min[2], acc.max[2]]) {
              const p = apply(m, [cx, cy, cz]);
              for (let i = 0; i < 3; i++) {
                min[i] = Math.min(min[i], p[i]);
                max[i] = Math.max(max[i], p[i]);
              }
            }
        tris += prim.indices !== undefined ? json.accessors[prim.indices].count / 3 : acc.count / 3;
        if (prim.material !== undefined) materials.add(json.materials[prim.material].name);
      }
    }
    for (const c of n.children ?? []) visit(c, m);
  };
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (const r of json.scenes[json.scene ?? 0].nodes) visit(r, I);
  const r3 = (v) => v.map((x) => Math.round(x * 1000) / 1000);
  return { min: r3(min), max: r3(max), tris, materials: [...materials].sort() };
}

// ---- run ----
mkdirSync(modelsOut, { recursive: true });
copyFileSync(atlasSrc, join(outDir, 'atlas.png'));

const files = readdirSync(srcDir).filter((f) => f.endsWith('.glb')).sort();
const rows = [];
let before = 0;
let after = 0;
for (const file of files) {
  const id = file.replace(/\.glb$/, '').replace(/\s+/g, '_');
  const buf = readFileSync(join(srcDir, file));
  const { json, bin } = readGlb(buf);
  const packed = stripTextures(json, bin);
  const out = writeGlb(json, packed);
  writeFileSync(join(modelsOut, `${id}.glb`), out);
  before += buf.length;
  after += out.length;
  rows.push({ id, ...measure(json) });
}

const lines = rows.map(
  (r) =>
    `  '${r.id}': { min: [${r.min.join(', ')}], max: [${r.max.join(', ')}], tris: ${r.tris}, materials: [${r.materials.map((m) => `'${m}'`).join(', ')}] },`,
);
const ts = `// GENERATED by tools/build-kit.mjs from the Molten Maps SciFi Asset Pack — do not edit by hand.
// Bounds are of the flattened model in its own frame (metres, glTF axes: +Y up).

export interface KitModelInfo {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
  readonly tris: number;
  readonly materials: readonly string[];
}

export const KIT_MODELS = {
${lines.join('\n')}
} as const satisfies Record<string, KitModelInfo>;

export type KitModelId = keyof typeof KIT_MODELS;
`;
mkdirSync(dirname(tableOut), { recursive: true });
writeFileSync(tableOut, ts);

const mb = (n) => (n / 1024 / 1024).toFixed(2);
console.log(`${files.length} models: ${mb(before)} MB -> ${mb(after)} MB (+ atlas.png once)`);
console.log(`wrote ${tableOut}`);
