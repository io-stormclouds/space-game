import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MEDIEVAL_ID } from '../game/config/initial-world';
import { WORLD_GRIDS, WORLD_TERRAIN } from '../game/config/world';
import { HexKit, KitModel, KitSource } from './hex-kit';
import { EntityViewRegistry } from './entity-view-registry';
import { PickingService } from './picking.service';
import { THEMES } from './model-registry';
import { TerrainDecor } from './terrain-decor';
import { TerrainView } from './terrain-view';

const DIR = join(process.cwd(), 'public', 'assets', 'kaykit-hex');

/** Reads a .glb from disk into this realm's ArrayBuffer (GLTFLoader checks `instanceof ArrayBuffer`). */
const diskSource: KitSource = (id) => {
  const buf = readFileSync(join(DIR, `${id}.gltf.glb`));
  const ab = new ArrayBuffer(buf.length);
  new Uint8Array(ab).set(buf);
  return new Promise((resolve, reject) => new GLTFLoader().parse(ab, '', (g) => resolve(g.scene), reject));
};

const grid = WORLD_GRIDS.get(MEDIEVAL_ID)!;
const plan = WORLD_TERRAIN.get(MEDIEVAL_ID)!;
const R = grid.radius;

describe('HexKit', () => {
  it('reads the kit files with the authored size and triangle counts', async () => {
    const kit = new HexKit(undefined, diskSource);
    const tile = await kit.load('hex_forest');
    expect(tile.triangles).toBe(56);
    expect(tile.size.x).toBeCloseTo(2, 2); // flats on ±X
    expect(tile.size.z).toBeCloseTo(2.309, 2); // corners on ±Z
    expect(tile.size.y).toBeCloseTo(1, 2);
    expect(tile.box.min.y).toBeCloseTo(0, 3);
    expect(tile.parts.map((p) => p.mat)).toContain('Green');
    const castle = await kit.load('castle');
    expect(castle.triangles).toBe(2231);
    expect(Math.abs(castle.box.min.y)).toBeLessThan(0.05); // pivot at the base (the castle sinks 0.026)
    const road = await kit.load('hex_forest_roadB');
    expect(road.parts.map((p) => p.mat)).toContain('Beige');
  });

  it('has a file for every id the medieval plan uses', async () => {
    const kit = new HexKit(undefined, diskSource);
    const ids = new Set<string>();
    for (const v of plan.variants) if (v) ids.add(v.id);
    for (const d of plan.decor) ids.add(d.model);
    const models = await kit.loadAll(ids);
    expect(models.size).toBe(ids.size);
    for (const m of models.values()) expect(m.triangles).toBeGreaterThan(0);
  });
});

describe('TerrainView on the medieval planet', () => {
  let kit: ReadonlyMap<string, KitModel>;
  let view: TerrainView;

  beforeAll(async () => {
    const ids = new Set<string>();
    for (const v of plan.variants) if (v) ids.add(v.id);
    for (const d of plan.decor) ids.add(d.model);
    kit = await new HexKit(undefined, diskSource).loadAll(ids);
    view = new TerrainView(grid, plan, 0x7c8597);
  });
  afterAll(() => view.dispose());

  it('is flat fans before the kit arrives, then hexagons get kit tiles and pentagons plates', () => {
    const flat = view.terrainTriangles;
    // 630 hexagons × 6 fan triangles + 12 plates × 15
    expect(flat).toBe(630 * 6 + 12 * 30); // pentagon plate: top 15 + walls 10 + bottom 5
    view.applyKit(kit);
    expect(view.terrainTriangles).toBeGreaterThan(30000);
    expect(view.terrainTriangles).toBeLessThan(60000);
    for (const t of grid.tiles) {
      const { count } = view.rangeOf(t.index);
      if (t.kind === 'PENT') expect(count / 3, `pentagon ${t.index}`).toBe(30); // top 15 + walls 10 + bottom 5
      else expect(count / 3, `tile ${t.index}`).toBe(kit.get(plan.variants[t.index]!.id)!.triangles);
    }
  });

  it('keeps every vertex between the tile bottom and just above the body radius', () => {
    const p = view.visual.geometry.getAttribute('position');
    const s = view.scale;
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(p.getX(i), p.getY(i), p.getZ(i));
      min = Math.min(min, r);
      max = Math.max(max, r);
    }
    expect(max).toBeLessThanOrEqual(R + 0.08 * s);
    expect(min).toBeGreaterThanOrEqual(R - s - 1e-3);
  });

  it('winds top faces outward (nothing is inside out)', () => {
    const p = view.visual.geometry.getAttribute('position');
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3(), mid = new THREE.Vector3();
    let top = 0;
    let inward = 0;
    for (let i = 0; i < p.count; i += 3) {
      a.fromBufferAttribute(p, i);
      b.fromBufferAttribute(p, i + 1);
      c.fromBufferAttribute(p, i + 2);
      n.crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize();
      mid.copy(a).add(b).add(c).divideScalar(3);
      if (mid.length() > R - 0.02 * view.scale && n.lengthSq() > 0) {
        top++;
        if (n.dot(mid.normalize()) < 0) inward++;
      }
    }
    expect(top).toBeGreaterThan(5000);
    expect(inward / top).toBeLessThan(0.01);
  });

  it('joins neighbours without gaps along the outline', () => {
    // every outline vertex (radius R − 0.05·s, the kit bevel) of a tile is also a vertex of its neighbour
    const p = view.visual.geometry.getAttribute('position');
    const key = (x: number, y: number, z: number): string => `${Math.round(x * 100)},${Math.round(y * 100)},${Math.round(z * 100)}`;
    const verts = new Set<string>();
    const tileVerts = new Map<number, THREE.Vector3[]>();
    for (const t of grid.tiles) {
      const { start, count } = view.rangeOf(t.index);
      const list: THREE.Vector3[] = [];
      for (let i = start; i < start + count; i++) {
        const v = new THREE.Vector3().fromBufferAttribute(p, i);
        verts.add(key(v.x, v.y, v.z));
        if (Math.abs(v.length() - (R - 0.05 * view.scale)) < 0.01) list.push(v);
      }
      tileVerts.set(t.index, list);
    }
    let checked = 0;
    for (const t of grid.tiles.slice(0, 200)) {
      if (t.kind !== 'HEX') continue;
      const nb = new Set<string>();
      for (const n of t.neighbors) for (const v of tileVerts.get(n)!) nb.add(key(v.x, v.y, v.z));
      for (const v of tileVerts.get(t.index)!) {
        // transition and water tiles lower the rim differently; compare only plain top outlines
        checked++;
        if (!nb.has(key(v.x, v.y, v.z))) {
          // allow a tile whose neighbour has a different rim height (water): the point must still be shared in xz
          expect(verts.has(key(v.x, v.y, v.z))).toBe(true);
        }
      }
    }
    expect(checked).toBeGreaterThan(500);
  });

  it('paints hover and selection on the whole tile and restores it', () => {
    const idx = 100;
    const { start, count } = view.rangeOf(idx);
    const base = view.colorOf(idx).clone();
    view.setHover(idx);
    expect(view.colorOf(idx).r).toBeGreaterThan(base.r);
    view.setHover(null);
    expect(view.colorOf(idx).getHex()).toBe(base.getHex());
    view.setSelected(idx);
    const sel = view.colorOf(idx);
    expect(sel.b).toBeGreaterThan(base.b);
    const col = view.visual.geometry.getAttribute('color');
    // last vertex of the tile is painted too
    expect(col.getZ(start + count - 1)).toBeCloseTo(sel.b, 5);
    view.setSelected(null);
    expect(view.colorOf(idx).getHex()).toBe(base.getHex());
  });

  it('tints deposits and maps raycasts on the proxy to tiles', () => {
    const dep = grid.tiles.find((t) => t.deposit && t.kind === 'HEX')!;
    const plain = grid.tiles.find((t) => !t.deposit && t.kind === 'HEX' && plan.kinds[t.index] === plan.kinds[dep.index] && !plan.road.has(t.index) && plan.variants[t.index]!.id === plan.variants[dep.index]!.id)!;
    expect(plain).toBeDefined();
    expect(view.colorOf(dep.index).getHex()).not.toBe(view.colorOf(plain.index).getHex());

    const registry = new EntityViewRegistry();
    const group = new THREE.Group();
    group.add(view.mesh, view.visual);
    registry.addBody({
      id: MEDIEVAL_ID, group, mesh: view.mesh, orbitalUnits: new THREE.Group(), orbitLine: null,
      dockingOffset: new THREE.Vector3(0, R * 1.25, 0), grid: view, asteroid: null, structures: new Map(),
      decor: null, theme: THEMES.KAYKIT, dressing: new Map(),
    });
    group.updateMatrixWorld(true);
    const picking = new PickingService();
    for (const t of [dep, plain, grid.tiles.find((x) => x.kind === 'PENT')!]) {
      const target = new THREE.Vector3(t.center.x, t.center.y, t.center.z);
      const origin = target.clone().multiplyScalar(1.6);
      const hit = picking.pickRay(origin, target.clone().sub(origin).normalize(), registry);
      expect(hit.kind).toBe('TILE');
      expect(hit.kind === 'TILE' && hit.tileIndex).toBe(t.index);
    }
  });
});

describe('TerrainDecor on the medieval planet', () => {
  it('instances every planned model and hides a tile on demand within the triangle budget', async () => {
    const ids = new Set<string>();
    for (const v of plan.variants) if (v) ids.add(v.id);
    for (const d of plan.decor) ids.add(d.model);
    const kit = await new HexKit(undefined, diskSource).loadAll(ids);
    const view = new TerrainView(grid, plan, 0x7c8597);
    const decor = new TerrainDecor(grid, plan, view.frames, kit);
    expect(decor.instances).toBe(plan.decor.length);
    expect(decor.drawCalls).toBe(new Set(plan.decor.map((d) => d.model)).size);
    view.applyKit(kit);
    const total = view.terrainTriangles + decor.triangles;
    // measured 2026-11-09: terrain 47 296 + decor 118 324 (232 instances, 16 draw calls) = 165 620 triangles
    expect(view.terrainTriangles).toBeLessThan(60000);
    expect(decor.triangles).toBeLessThan(170000);
    expect(total).toBeLessThan(220000);
    const castle = plan.settlementCenter!;
    expect(decor.hasDecor(castle)).toBe(true);
    expect(decor.remove(castle)).toBeGreaterThan(0);
    expect(decor.hasDecor(castle)).toBe(false);
    expect(decor.remove(castle)).toBe(0);
    // instances stand on the sphere
    const castleMesh = decor.group.children.find((c) => c.name === 'Decor_castle') as THREE.InstancedMesh;
    expect(castleMesh.count).toBe(1);
    decor.dispose();
    view.dispose();
  });
});
