// Contact sheet of the structure models (T7A): `npx vite packages/render/harness/models --port 4432`.
// Every kind × {L1, L3, L5} drawn through the game's own StructureLayer and ModelKit (same parts,
// fitting, flat-shaded material) on flat hex placeholders. The "planet" is a cap of a very large
// sphere, so footprintFrame works unchanged. `shot.mjs` saves the screenshot for the docs.
import * as THREE from 'three';
import { Rules, footprintTiles, standingStructure, tileId, type BodyId, type PlanetGrid, type Structure, type Tile, type Vec3 } from '@space-game/domain';
import { ModelKit } from '../../src/system/model-kit';
import { levelTier, modelsForKind, partsFor } from '../../src/system/model-registry';
import { DS, SCENE } from '../../src/system/palette';
import { StructureLayer } from '../../src/system/structure-layer';

const stage = document.getElementById('stage')!;
const hud = document.getElementById('hud')!;

// ---------------------------------------------------------------- what to show

const rules = new Rules();
const query = new URLSearchParams(location.search);
/** Port, the 18 buildable kinds (catalog order), the preset kinds, one kind on the default parts; `?only=HQ,LAND` for a subset. */
const ALL_KINDS = ['HQ', ...rules.buildableKinds(), 'ATN', 'GAS', 'HE3S', 'FIS'];
const only = query.get('only')?.split(',').filter(Boolean);
export const KINDS: ReadonlyArray<string> = only?.length ? ALL_KINDS.filter((k) => only.includes(k)) : ALL_KINDS;
export const LEVELS: ReadonlyArray<number> = [1, 3, 5];
const footprint = (kind: string) => Math.max(1, rules.spec(kind).footprint);

// ---------------------------------------------------------------- flat hex grid on a huge sphere

const BODY = 'sheet' as BodyId;
const W = 1; // tile width (flat to flat)
const R = 5000; // sphere radius: the cap is flat to well under a pixel
const SQ3 = Math.sqrt(3);
/** Kind columns side by side (`?blocks=1` for a close-up of a few kinds). */
const BLOCKS = Math.max(1, Math.min(Number(query.get('blocks') ?? 3) || 3, KINDS.length));
const ROWS_PER_BLOCK = Math.ceil(KINDS.length / BLOCKS);
const CELL_X = 3.6 * W;
const CELL_Z = 3.9 * W;
const BLOCK_GAP = 1.2 * W;
/** Sheet extent on the plane (cell centres), and how far labels reach below the last row. */
const SHEET_X = (BLOCKS - 1) * (3 * CELL_X + BLOCK_GAP) + 2 * CELL_X;
const SHEET_Z = (ROWS_PER_BLOCK - 1) * CELL_Z;
const LABEL_Z = 1.55 * W;

/**
 * Pointy-top axial hex (q, r) → plane (x, z); corners and neighbours counter-clockwise seen from +Y.
 * Corner 0 points at the camera (+z): a 1-tile model faces its frame's forward, so the sheet shows
 * each model's authored front (in the game the corner, and so the facing, varies per tile).
 */
const hexX = (q: number, r: number) => W * (q + r / 2);
const hexZ = (r: number) => W * r * (SQ3 / 2);
const CORNER0_DEG = 270;
/** Neighbour k lies across the edge from corner k to corner k + 1 (300°, 0°, 60° …). */
const DIRS: ReadonlyArray<[number, number]> = [[0, 1], [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1]];

function onSphere(x: number, z: number): Vec3 {
  const l = Math.hypot(x, R, z);
  return { x: (x / l) * R, y: (R / l) * R, z: (z / l) * R };
}

function cellCentre(k: number, tier: number): { x: number; z: number } {
  const block = Math.floor(k / ROWS_PER_BLOCK);
  const row = k % ROWS_PER_BLOCK;
  return { x: block * (3 * CELL_X + BLOCK_GAP) + tier * CELL_X, z: row * CELL_Z };
}

function buildGrid(): PlanetGrid {
  const xMax = SHEET_X + 3 * W;
  const zMax = SHEET_Z + 3 * W;
  const index = new Map<string, number>();
  const cells: Array<[number, number]> = [];
  for (let r = Math.floor(-3 / (SQ3 / 2)); hexZ(r) <= zMax; r++) {
    for (let q = Math.floor(-3 - r / 2); hexX(q, r) <= xMax; q++) {
      if (hexX(q, r) < -3 * W) continue;
      index.set(`${q},${r}`, cells.length);
      cells.push([q, r]);
    }
  }
  const tiles: Tile[] = cells.map(([q, r], i) => {
    const cx = hexX(q, r);
    const cz = hexZ(r);
    const center = onSphere(cx, cz);
    const vertices: Vec3[] = [];
    for (let k = 0; k < 6; k++) {
      const a = (Math.PI / 180) * (CORNER0_DEG + 60 * k);
      vertices.push(onSphere(cx + (W / SQ3) * Math.cos(a), cz - (W / SQ3) * Math.sin(a)));
    }
    const neighbors = DIRS.map(([dq, dr]) => index.get(`${q + dq},${r + dr}`)).filter((n): n is number => n !== undefined);
    return { id: tileId(BODY, i), index: i, kind: 'HEX', center, normal: { x: center.x / R, y: center.y / R, z: center.z / R }, vertices, neighbors, deposit: null };
  });
  return { bodyId: BODY, frequency: 0, radius: R, tiles, tileEdge: W / SQ3 };
}

function nearestTile(grid: PlanetGrid, x: number, z: number): number {
  const r = Math.round(z / (W * (SQ3 / 2)));
  const q = Math.round(x / W - r / 2);
  const p = onSphere(hexX(q, r), hexZ(r));
  let best = 0;
  let bestD = Infinity;
  for (const t of grid.tiles) {
    const d = (t.center.x - p.x) ** 2 + (t.center.z - p.z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = t.index;
    }
  }
  return best;
}

// ---------------------------------------------------------------- scene

const grid = buildGrid();
const structures: Structure[] = [];
const labels: Array<{ at: THREE.Vector3; html: string }> = [];
KINDS.forEach((kind, k) => {
  LEVELS.forEach((level, t) => {
    const c = cellCentre(k, t);
    const anchor = nearestTile(grid, c.x, c.z);
    const tiles = footprintTiles(grid, anchor, footprint(kind), 0);
    if (!tiles) throw new Error(`no footprint for ${kind}`);
    structures.push(standingStructure(kind, BODY, tiles, level));
    const models = [...new Set(partsFor(kind, level).map((p) => p.model))].join(' · ');
    const p = onSphere(c.x, c.z + LABEL_Z);
    labels.push({ at: new THREE.Vector3(p.x, p.y - R, p.z), html: `<b>${kind}</b> L${level} · T${levelTier(level)}<br><span class="m">${models}</span>` });
  });
});
const footprintTilesSet = new Set(structures.flatMap((s) => s.tiles.map((id) => Number(id.slice(id.lastIndexOf(':') + 1)))));

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(1);
stage.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(SCENE.background);
scene.add(new THREE.AmbientLight(SCENE.ambient, 0.85));
const sun = new THREE.DirectionalLight(0xffffff, 3.0);
sun.position.set(-0.45, 1, 0.55);
scene.add(sun);

const world = new THREE.Group();
world.position.y = -R; // the cap's top at the origin
scene.add(world);

/** Flat hex placeholders: free tiles in graphite, footprints a step lighter, edges in void. */
function placeholders(): THREE.Object3D[] {
  const pos: number[] = [];
  const col: number[] = [];
  const edges: number[] = [];
  const c = new THREE.Color();
  for (const t of grid.tiles) {
    c.setHex(footprintTilesSet.has(t.index) ? DS.metal : DS.graphite);
    const vs = t.vertices;
    for (let i = 0; i < vs.length; i++) {
      const a = vs[i]!;
      const b = vs[(i + 1) % vs.length]!;
      pos.push(t.center.x, t.center.y, t.center.z, a.x, a.y, a.z, b.x, b.y, b.z); // CCW seen from above
      for (let j = 0; j < 3; j++) col.push(c.r, c.g, c.b);
      edges.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  const eg = new THREE.BufferGeometry();
  eg.setAttribute('position', new THREE.Float32BufferAttribute(edges, 3));
  const lines = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: DS.void }));
  return [mesh, lines];
}
world.add(...placeholders());

const kit = new ModelKit('/assets/');
const layer = new StructureLayer(grid, kit, new THREE.LineBasicMaterial({ color: SCENE.site }), false);
world.add(layer.group);

/** Orthographic (every cell at the same scale), pitched like the planet camera looking at a colony. */
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 400);
const PITCH = (55 * Math.PI) / 180;

function frame(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  const target = new THREE.Vector3(SHEET_X / 2, 0, SHEET_Z / 2);
  camera.position.set(target.x, 100 * Math.sin(PITCH), target.z + 100 * Math.cos(PITCH));
  camera.lookAt(target);
  camera.updateMatrixWorld();
  // fit the sheet: cell corners on the ground, model tops above the back row, labels below the front row
  const view = camera.matrixWorldInverse;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  const v = new THREE.Vector3();
  for (const [x, y, z] of [
    [-1.9 * W, 1.6 * W, -1.6 * W],
    [SHEET_X + 1.9 * W, 1.6 * W, -1.6 * W],
    [-1.9 * W, 0, SHEET_Z + LABEL_Z + 2.1 * W],
    [SHEET_X + 1.9 * W, 0, SHEET_Z + LABEL_Z + 2.1 * W],
  ] as const) {
    v.set(x, y, z).applyMatrix4(view);
    x0 = Math.min(x0, v.x);
    x1 = Math.max(x1, v.x);
    y0 = Math.min(y0, v.y);
    y1 = Math.max(y1, v.y);
  }
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const half = Math.max((y1 - y0) / 2, (x1 - x0) / 2 / (w / h));
  camera.left = cx - half * (w / h);
  camera.right = cx + half * (w / h);
  camera.top = cy + half;
  camera.bottom = cy - half;
  camera.updateProjectionMatrix();
  // label text scales with the cell width on screen
  const cellPx = (CELL_X / (2 * half * (w / h))) * w;
  for (const el of labelEls) {
    el.style.fontSize = `${Math.max(9, Math.min(14, cellPx / 17))}px`;
    el.style.maxWidth = `${cellPx * 0.96}px`;
  }
  render();
}

const labelEls = labels.map((l) => {
  const el = document.createElement('div');
  el.className = 'label';
  el.innerHTML = l.html;
  stage.appendChild(el);
  return el;
});

function render(): void {
  renderer.render(scene, camera);
  const w = window.innerWidth;
  const h = window.innerHeight;
  const v = new THREE.Vector3();
  labels.forEach((l, i) => {
    v.copy(l.at).project(camera);
    labelEls[i]!.style.left = `${((v.x + 1) / 2) * w}px`;
    labelEls[i]!.style.top = `${((1 - v.y) / 2) * h}px`;
  });
  const info = renderer.info.render;
  hud.textContent = `${KINDS.length} RODZAJÓW × L1/L3/L5   DRAW ${info.calls}   TRÓJKĄTY ${info.triangles}   MODELE ${layer.drawables}`;
}

const ids = [...new Set(KINDS.flatMap(modelsForKind))];
const ready = kit.loadAll(ids).then(() => {
  layer.sync(structures, new Set());
  frame();
  modelsHarness.done = true;
});
window.addEventListener('resize', frame);

const modelsHarness = { ready, done: false, kinds: KINDS, levels: LEVELS, layer, kit, render: () => render() };

declare global {
  interface Window {
    modelsHarness: typeof modelsHarness;
  }
}
window.modelsHarness = modelsHarness;
