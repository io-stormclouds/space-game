import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildGoldbergGrid, tileWidth, hash3, fbm } from './domain.js';

const Q = new URLSearchParams(location.search);
const preset = Q.get('preset') || 'mixed';
const mode = Q.get('mode') || 'warp';
const N = +(Q.get('n') || 8);
const CATALOG = Q.has('catalog');
const W = 1440, H = 900;

// ---- palette (muted KayKit tones, see palette.mjs) ----
const T = { grass:0x629a88, forest:0x47767a, sand:0xad9a87, rock:0x997c6d, soil:0x765a54, snow:0xc4c6c9, ice:0xaec1c8, water:0x6aafb8, stone:0x6e757b, stoneDark:0x555c60, wood:0x765a54, roof:0x997c6d, thatch:0xc3a562, road:0xad9a87, metal:0x969fa5, white:0xc4c6c9, dark:0x31383d, dune:0x8f7d6c };
const GROUND = {
  mixed:    { grass:T.grass, forest:T.grass, rock:T.rock, snow:T.snow, sand:T.sand, water:T.water, road:T.road },
  medieval: { grass:T.grass, forest:T.grass, rock:T.rock, snow:T.snow, sand:T.sand, water:T.water, road:T.road },
  winter:   { grass:T.snow, forest:T.snow, rock:T.stone, snow:T.snow, sand:T.snow, water:T.ice, road:T.soil },
  dry:      { grass:T.sand, forest:T.sand, rock:T.rock, snow:T.sand, sand:T.sand, dune:T.dune, water:T.water, road:T.soil },
}[preset];
function tileTone(mat, cls) {
  switch (mat) {
    case 'Green': return GROUND[cls] ?? GROUND.grass;
    case 'Water': return GROUND.water;
    case 'Beige': return GROUND.road;
    case 'BrownDark': return T.soil;
    case 'Brown': return preset === 'winter' ? T.stone : T.rock;
    case 'White': return T.snow;
    default: return T.stone;
  }
}
function objTone(mat) {
  switch (mat) {
    case 'Stone': return T.stone; case 'StoneDark': return T.stoneDark; case 'BrownDark': return T.wood; case 'WoodDark': return T.wood;
    case 'Brown': return T.roof; case 'Beige': return T.sand; case 'White': return T.white; case 'Yellow': return T.thatch; case 'Red': return T.thatch;
    case 'GreenDark': return preset === 'winter' ? T.ice : preset === 'dry' ? 0x6f7f5e : T.forest; case 'Green': return GROUND.grass;
    case 'Metal': return T.metal; case 'Black': return T.dark; case 'Water': return GROUND.water; default: return T.stone;
  }
}

// ---- assets ----
const TILE_IDS = ['hex_forest','hex_forest_detail','hex_water','hex_water_detail','hex_forest_transitionA','hex_forest_transitionB',
  ...'ABCD'.split('').flatMap(l=>[`hex_forest_water${l}`,`hex_forest_water${l}_detail`,`hex_forest_water${l}_empty`]),
  ...'ABCDEFGHIJKLM'.split('').flatMap(l=>[`hex_forest_road${l}`,`hex_forest_road${l}_detail`])];
const OBJ_IDS = ['detail_treeA','detail_treeB','detail_treeC','detail_rocks','detail_rocks_small','mountain','castle','watchtower','house','market','mill','farm_plot','well','lumbermill','mine','barracks','wall_straight','wall_corner','forest'];
// road exit masks measured in geo4.mjs (road surface at y = 0.9, apothem projection >= 0.9): e_k = flat at k*60deg from +X (XZ plane)
const ROAD_MASKS = { B:'100100', C:'110000', D:'101000', E:'110100', F:'100101', G:'101010', H:'111000', I:'111010', J:'110110', K:'111100', L:'011111', M:'111111' };
// shore variants: which edges the WATER part reaches (geo4.mjs, land edges inverted): A = 2 adjacent water edges, B/C = 1 water edge, D = pond (none)
const SHORE_MASKS = { A:'110000', B:'000100', C:'000100' };

const loader = new GLTFLoader();
/** gltf scene -> [{mat, pos:Float32Array(non-indexed, baked)}] */
function flatten(scene) {
  scene.updateMatrixWorld(true);
  const parts = [];
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(o.matrixWorld);
    parts.push({ mat: o.material.name, pos: g.getAttribute('position').array.slice() });
  });
  return parts;
}
async function loadAll(ids, dir) {
  const out = new Map();
  await Promise.all(ids.map(async (id) => {
    const g = await loader.loadAsync(`/assets/${dir}/${id}.gltf.glb`);
    const parts = flatten(g.scene);
    const box = new THREE.Box3();
    for (const p of parts) for (let i = 0; i < p.pos.length; i += 3) box.expandByPoint(new THREE.Vector3(p.pos[i], p.pos[i + 1], p.pos[i + 2]));
    out.set(id, { parts, box, size: box.getSize(new THREE.Vector3()), tris: parts.reduce((a, p) => a + p.pos.length / 9, 0) });
  }));
  return out;
}

// ---- scene ----
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H, false); renderer.setPixelRatio(1);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x0b0c10);
const camera = new THREE.PerspectiveCamera(38, W / H, 1, 5000);
scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const sun = new THREE.DirectionalLight(0xffffff, 1.6); scene.add(sun);
const MAT = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

const tiles = await loadAll(TILE_IDS, 'tiles/hex/gltf');
const objs = CATALOG ? new Map() : await loadAll(OBJ_IDS, 'objects/gltf');

if (CATALOG) catalog(); else planet();

function catalog() {
  const ids = TILE_IDS; const cols = 8; const pitch = 2.8;
  const geo = { pos: [], col: [] }; const c = new THREE.Color();
  const labels = [];
  ids.forEach((id, i) => {
    const x = (i % cols) * pitch, z = Math.floor(i / cols) * pitch;
    for (const p of tiles.get(id).parts) { c.setHex(tileTone(p.mat, 'grass')); for (let k = 0; k < p.pos.length; k += 3) { geo.pos.push(p.pos[k] + x, p.pos[k + 1], p.pos[k + 2] + z); geo.col.push(c.r, c.g, c.b); } }
    labels.push({ id, p: new THREE.Vector3(x, 0, z + 1.3) });
  });
  scene.add(new THREE.Mesh(build(geo), MAT));
  const cx = (cols - 1) * pitch / 2, cz = (Math.ceil(ids.length / cols) - 1) * pitch / 2;
  camera.position.set(cx, 22, cz + 14); camera.lookAt(cx, 0, cz); sun.position.set(cx - 10, 30, cz + 20);
  renderer.render(scene, camera);
  for (const l of labels) { const v = l.p.clone().project(camera); const d = document.createElement('div'); d.className = 'lbl'; d.textContent = l.id.replace('hex_forest_', '').replace('hex_', ''); d.style.left = `${(v.x + 1) / 2 * W}px`; d.style.top = `${(1 - v.y) / 2 * H}px`; document.body.appendChild(d); }
  done({ tiles: ids.length });
}

function build(geo) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(geo.pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(geo.col, 3));
  g.computeVertexNormals();
  return g;
}

function planet() {
  const R = 50 * N / 8;
  const grid = buildGoldbergGrid('spike', R, N, 11);
  const tw = tileWidth(grid);
  const seed = { mixed: 1, medieval: 2, winter: 3, dry: 4 }[preset] ?? 5;
  // --- per-tile frame: vertices sorted by angle in a right-handed tangent frame ---
  const frames = grid.tiles.map((t) => {
    const C = new THREE.Vector3(t.center.x, t.center.y, t.center.z);
    const Y = new THREE.Vector3(t.normal.x, t.normal.y, t.normal.z);
    const v0 = new THREE.Vector3(t.vertices[0].x, t.vertices[0].y, t.vertices[0].z).sub(C);
    const X = v0.clone().addScaledVector(Y, -v0.dot(Y)).normalize();
    const Z = new THREE.Vector3().crossVectors(X, Y);
    const verts = t.vertices.map((v, i) => { const d = new THREE.Vector3(v.x, v.y, v.z).sub(C); return { i, p: new THREE.Vector3(v.x, v.y, v.z), phi: Math.atan2(d.dot(Z), d.dot(X)) }; }).sort((a, b) => a.phi - b.phi);
    const S = verts.map((v) => v.p);
    const m = S.length;
    // neighbour across edge j = (S[j], S[j+1])
    const edgeNb = S.map((p, j) => { const mid = p.clone().add(S[(j + 1) % m]).multiplyScalar(0.5); let best = -1, bd = Infinity; for (const nb of t.neighbors) { const c2 = grid.tiles[nb].center; const d = mid.distanceToSquared(new THREE.Vector3(c2.x, c2.y, c2.z)); if (d < bd) { bd = d; best = nb; } } return best; });
    const rMean = S.reduce((a, p) => a + p.distanceTo(C), 0) / m;
    return { C, X, Y, Z, S, m, edgeNb, rMean };
  });
  const hexFrames = frames.filter((f) => f.m === 6);
  const sBody = hexFrames.reduce((a, f) => a + f.rMean, 0) / hexFrames.length / 1.1547;

  // --- terrain classes ---
  const cls = grid.tiles.map((t) => {
    const n = t.normal; const p = (k) => ({ x: n.x * k + 7, y: n.y * k + 7, z: n.z * k + 7 });
    const f1 = fbm(seed, p(2.6)), f2 = fbm(seed + 11, p(3.4)), f3 = fbm(seed + 23, p(4.2));
    const lat = Math.abs(n.y);
    if (preset === 'mixed') { if (f1 < 0.42) return 'water'; if (lat > 0.84) return 'snow'; if (f2 > 0.64) return 'rock'; if (f3 > 0.57) return 'forest'; return 'grass'; }
    if (preset === 'medieval') { if (f1 < 0.36) return 'water'; if (lat > 0.88) return 'snow'; if (f2 > 0.67) return 'rock'; if (f3 > 0.55) return 'forest'; return 'grass'; }
    if (preset === 'winter') { if (f1 < 0.40) return 'water'; if (f2 > 0.66) return 'rock'; if (f3 > 0.60 && lat < 0.7) return 'forest'; return 'snow'; }
    /* dry */ if (f2 > 0.62) return 'rock'; if (f1 < 0.36) return 'dune'; if (f3 > 0.74) return 'forest'; return 'sand';
  });
  const isLand = (i) => cls[i] !== 'water';

  // --- medieval settlement: roads + buildings ---
  const road = new Set(); const decor = []; // {id, tile, yaw, fill, ox, oz, sm}
  let settlement = null;
  if (preset === 'medieval') {
    const aim = new THREE.Vector3(0.35, 0.45, 0.82).normalize();
    let center = -1, bd = -1;
    grid.tiles.forEach((t, i) => { if (t.kind !== 'HEX') return; const d = aim.dot(new THREE.Vector3(t.normal.x, t.normal.y, t.normal.z)); if (d > bd) { bd = d; center = i; } });
    settlement = center;
    const ring1 = grid.tiles[center].neighbors.filter((i) => grid.tiles[i].kind === 'HEX');
    const ring2 = [...new Set(ring1.flatMap((i) => grid.tiles[i].neighbors))].filter((i) => i !== center && !ring1.includes(i) && grid.tiles[i].kind === 'HEX');
    const ring3 = [...new Set(ring2.flatMap((i) => grid.tiles[i].neighbors))].filter((i) => i !== center && !ring1.includes(i) && !ring2.includes(i) && grid.tiles[i].kind === 'HEX');
    for (const i of [center, ...ring1, ...ring2]) if (cls[i] === 'water' || cls[i] === 'rock') cls[i] = 'grass';
    for (const i of ring1) if (cls[i] === 'forest') cls[i] = 'grass';
    decor.push({ id: 'castle', tile: center, fill: 0.95 });
    ring1.forEach((i, k) => { road.add(i); if (k === 0 || k === 3) decor.push({ id: 'watchtower', tile: i, fill: 0.5, ox: 0.28, oz: 0.1 }); if (k === 1) decor.push({ id: 'market', tile: i, fill: 0.6, ox: -0.25, oz: 0.15 }); if (k === 4) decor.push({ id: 'barracks', tile: i, fill: 0.62, ox: -0.22, oz: -0.12 }); });
    ring2.forEach((i, k) => { const h = hash3(seed, i, 9, 0); if (cls[i] === 'forest' && k % 2) return; if (k % 3 === 0) { road.add(i); decor.push({ id: 'house', tile: i, fill: 0.55, ox: 0.25, oz: 0.2 }); } else if (k % 3 === 1) decor.push({ id: 'farm_plot', tile: i, fill: 0.8, yaw: h * 6.28 }); else if (k === 2) decor.push({ id: 'mill', tile: i, fill: 0.6 }); else if (k === 5) decor.push({ id: 'well', tile: i, fill: 0.35 }); else decor.push({ id: 'house', tile: i, fill: 0.55, yaw: h * 6.28 }); });
    const lumber = ring3.find((i) => cls[i] === 'forest'); if (lumber !== undefined) decor.push({ id: 'lumbermill', tile: lumber, fill: 0.7 });
    const mine = ring3.find((i) => cls[i] === 'rock'); if (mine !== undefined) decor.push({ id: 'mine', tile: mine, fill: 0.75 });
    // road spokes: from a few ring3 tiles inwards to the ring around the castle
    ring3.filter((_, k) => k % 4 === 0).slice(0, 4).forEach((target) => {
      let cur = target;
      for (let step = 0; step < 4; step++) {
        road.add(cur);
        const nb = grid.tiles[cur].neighbors.filter((i) => isLand(i) && grid.tiles[i].kind === 'HEX');
        if (!nb.length) break;
        const cc = grid.tiles[center].center;
        cur = nb.reduce((b, i) => { const d = grid.tiles[i].center; const dd = (d.x - cc.x) ** 2 + (d.y - cc.y) ** 2 + (d.z - cc.z) ** 2; return dd < b.d ? { i, d: dd } : b; }, { i: cur, d: Infinity }).i;
        if (ring1.includes(cur)) { road.add(cur); break; }
      }
    });
    for (const i of road) if (cls[i] === 'water') cls[i] = 'grass';
  }
  // trees and rocks everywhere (except road tiles)
  grid.tiles.forEach((t, i) => {
    if (road.has(i)) return;
    const h = hash3(seed, i, 5, 0);
    if (cls[i] === 'forest') {
      if (preset === 'dry') decor.push({ id: 'detail_treeC', tile: i, fill: 0.22, ox: 0.1, oz: -0.1, sm: 0.7 });
      else { decor.push({ id: 'detail_treeA', tile: i, fill: 0.3, ox: -0.2, oz: 0.1 }); decor.push({ id: 'detail_treeC', tile: i, fill: 0.3, ox: 0.15, oz: -0.18 }); if (h > 0.6) decor.push({ id: 'detail_treeB', tile: i, fill: 0.28, ox: 0.18, oz: 0.2 }); }
    } else if (cls[i] === 'rock') {
      if (h > 0.62) decor.push({ id: 'mountain', tile: i, fill: 0.8, yaw: h * 6.28 });
      else decor.push({ id: h > 0.3 ? 'detail_rocks' : 'detail_rocks_small', tile: i, fill: h > 0.3 ? 0.75 : 0.35, yaw: h * 6.28 });
    } else if ((cls[i] === 'sand' || cls[i] === 'dune') && h > 0.9) decor.push({ id: 'detail_rocks_small', tile: i, fill: 0.3, yaw: h * 6.28 });
    else if (cls[i] === 'snow' && h > 0.93 && preset !== 'mixed') decor.push({ id: 'detail_rocks_small', tile: i, fill: 0.3, yaw: h * 6.28 });
  });

  // --- variant per tile ---
  function variantFor(i) {
    const f = frames[i];
    if (cls[i] === 'water') return { id: 'hex_water', k0: 0 };
    if (f.m === 5) return { id: 'hex_forest', k0: 0 };
    if (road.has(i)) {
      const want = f.edgeNb.map((nb) => (road.has(nb) ? 1 : 0));
      if (want.every((w) => !w)) return { id: 'hex_forest_roadA', k0: 0 };
      let best = null;
      for (const [L, mask] of Object.entries(ROAD_MASKS)) for (let k0 = 0; k0 < 6; k0++) {
        // KayKit edge e_k lies between corners k-1 and k; corner k -> S[(k0 + k) % 6]; so e_k -> tile edge (k0 + k - 1) % 6
        let score = 0, bad = 0;
        for (let k = 0; k < 6; k++) { const te = (k0 + k + 5) % 6; const m = +mask[k]; if (m && want[te]) score++; else if (m !== want[te]) bad++; }
        const s = score * 3 - bad * 2;
        if (!best || s > best.s) best = { id: `hex_forest_road${L}`, k0, s };
      }
      return best;
    }
    // shores: a land tile next to water takes a shore variant whose water edges face the water neighbours
    const waterEdges = f.edgeNb.map((nb) => (cls[nb] === 'water' ? 1 : 0));
    const nWater = waterEdges.reduce((a, b) => a + b, 0);
    if (nWater > 0 && nWater <= 2) {
      for (const [L, mask] of Object.entries(SHORE_MASKS)) {
        if (+mask.split('').reduce((a, b) => +a + +b) !== nWater) continue;
        if (L === 'C' && hash3(seed, i, 12, 0) < 0.5) continue; // B and C are alternatives for one water edge
        for (let k0 = 0; k0 < 6; k0++) { let ok = true; for (let k = 0; k < 6; k++) if (+mask[k] !== waterEdges[(k0 + k + 5) % 6]) { ok = false; break; } if (ok) return { id: `hex_forest_water${L}`, k0 }; }
      }
    }
    if (nWater === 0 && cls[i] === 'grass' && preset !== 'dry' && hash3(seed, i, 13, 0) > 0.96) return { id: 'hex_forest_waterD', k0: Math.floor(hash3(seed, i, 14, 0) * 6) }; // pond
    // transitions: a land tile next to rock (A) or snow (B) raises the half facing that neighbour.
    // The raised half faces KayKit edge e0 (flat at 0deg) = between corners 5 and 0 -> tile edge (k0+5)%6 -> k0 = edge+1
    const land = cls[i] === 'grass' || cls[i] === 'forest' || cls[i] === 'sand';
    const eRock = land ? f.edgeNb.findIndex((nb) => cls[nb] === 'rock') : -1;
    const eSnow = land && preset !== 'winter' ? f.edgeNb.findIndex((nb) => cls[nb] === 'snow') : -1;
    if (eSnow >= 0 && hash3(seed, i, 6, 0) > 0.3) return { id: 'hex_forest_transitionB', k0: (eSnow + 1) % 6 };
    if (eRock >= 0 && hash3(seed, i, 7, 0) > 0.45 && preset !== 'dry') return { id: 'hex_forest_transitionA', k0: (eRock + 1) % 6 };
    return { id: 'hex_forest', k0: 0 };
  }

  // --- warp ---
  const geo = { pos: [], col: [] }; const c = new THREE.Color(); const tmp = new THREE.Vector3(), tmpB = new THREE.Vector3();
  const DEG = Math.PI / 180;
  let triCount = 0;
  grid.tiles.forEach((t, i) => {
    const f = frames[i]; const { id, k0 } = variantFor(i); const asset = tiles.get(id);
    const m = f.m; const S = f.S;
    for (const p of asset.parts) {
      c.setHex(tileTone(p.mat, cls[i]));
      const lowerWater = p.mat === 'Water';
      for (let k = 0; k < p.pos.length; k += 3) {
        const x = p.pos[k], y0 = p.pos[k + 1], z = p.pos[k + 2];
        const y = lowerWater ? Math.min(y0, 0.9) : y0;
        if (mode === 'flat') {
          const s = f.rMean / 1.1547;
          const a = k0 * 60 * DEG; const xr = x * Math.cos(a) - z * Math.sin(a), zr = x * Math.sin(a) + z * Math.cos(a);
          tmp.copy(f.C).addScaledVector(f.X, xr * s).addScaledVector(f.Z, zr * s).addScaledVector(f.Y, (y - 1) * s);
        } else {
          const r = Math.hypot(x, z);
          const theta = Math.atan2(z, x);
          const kFlat = Math.round(theta / (60 * DEG)); const delta = theta - kFlat * 60 * DEG;
          const frac = r * Math.cos(delta); // 0 centre .. 1 boundary (apothem 1)
          const s6 = (((theta / DEG - 30) % 360) + 360) % 360 / 60; // sectors between corners
          const st = s6 * m / 6; const j = Math.floor(st) % m; const g = st - Math.floor(st);
          const A = S[(k0 + j) % m], B = S[(k0 + j + 1) % m];
          tmpB.lerpVectors(A, B, g);
          tmp.copy(f.C).lerp(tmpB, Math.min(frac, 1.0));
          const rad = R + (y - 1) * sBody;
          tmp.normalize().multiplyScalar(rad);
        }
        geo.pos.push(tmp.x, tmp.y, tmp.z); geo.col.push(c.r, c.g, c.b);
      }
      triCount += p.pos.length / 9;
    }
  });
  const terrain = new THREE.Mesh(build(geo), MAT); scene.add(terrain);

  // --- decor as instanced meshes ---
  const byId = new Map(); for (const d of decor) { if (!byId.has(d.id)) byId.set(d.id, []); byId.get(d.id).push(d); }
  const basis = new THREE.Matrix4(); const q = new THREE.Quaternion(); const mtx = new THREE.Matrix4(); const sc = new THREE.Vector3(); const pos = new THREE.Vector3(); const yawQ = new THREE.Quaternion();
  let decorTris = 0;
  for (const [id, list] of byId) {
    const asset = objs.get(id); if (!asset) continue;
    const g = { pos: [], col: [] }; for (const p of asset.parts) { c.setHex(objTone(p.mat)); for (let k = 0; k < p.pos.length; k += 3) { g.pos.push(p.pos[k], p.pos[k + 1], p.pos[k + 2]); g.col.push(c.r, c.g, c.b); } }
    const inst = new THREE.InstancedMesh(build(g), MAT, list.length); inst.frustumCulled = false;
    const footprint = Math.max(asset.size.x, asset.size.z);
    list.forEach((d, n) => {
      const f = frames[d.tile]; const s = (tw * (d.fill ?? 0.6)) / footprint * (d.sm ?? 1);
      basis.makeBasis(f.X, f.Y, f.Z); q.setFromRotationMatrix(basis); yawQ.setFromAxisAngle(f.Y, d.yaw ?? hash3(seed, d.tile, 8, n) * 6.283); q.premultiply(yawQ);
      pos.copy(f.C).addScaledVector(f.X, (d.ox ?? 0) * tw).addScaledVector(f.Z, (d.oz ?? 0) * tw).normalize().multiplyScalar(R - asset.box.min.y * s);
      mtx.compose(pos, q, sc.set(s, s, s)); inst.setMatrixAt(n, mtx);
    });
    decorTris += asset.tris * list.length;
    scene.add(inst);
  }

  // --- camera on the interesting spot ---
  const focusTile = settlement ?? grid.tiles.findIndex((t, i) => cls[i] === 'forest' && t.normal.z > 0.5);
  const fn = focusTile >= 0 ? frames[focusTile].Y.clone() : new THREE.Vector3(0.3, 0.5, 0.8).normalize();
  const zoom = Q.get('zoom') ? +Q.get('zoom') : 2.3;
  const dist = R * zoom;
  camera.position.copy(fn).multiplyScalar(dist).add(new THREE.Vector3(0, R * (zoom > 3 ? 0.8 : 0.35), 0)); camera.lookAt(zoom > 3 ? new THREE.Vector3(0, 0, 0) : fn.clone().multiplyScalar(R * 0.98));
  sun.position.copy(fn).multiplyScalar(R * 4).add(new THREE.Vector3(R * 2, R * 3, 0));
  renderer.render(scene, camera);
  const info = renderer.info.render;
  const counts = {}; for (const [k, v] of byId) counts[k] = v.length;
  const stats = { preset, mode, n: N, tiles: grid.tiles.length, sBody: +sBody.toFixed(3), tileWidth: +tw.toFixed(2), terrainTris: triCount, decorTris, drawCalls: info.calls, trianglesRendered: info.triangles, roads: road.size, decor: counts, classes: Object.fromEntries(['grass','forest','rock','water','snow','sand','dune'].map((k) => [k, cls.filter((x) => x === k).length])) };
  document.getElementById('stats').textContent = `${preset} / ${mode} / GP(${N},0)  draw calls ${info.calls}  tris ${info.triangles}`;
  done(stats);
}

function done(stats) { window.spikeStats = stats; window.spikeDone = true; }
