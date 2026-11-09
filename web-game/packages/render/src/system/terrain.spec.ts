import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { TAU_CETI_BODIES, TC_C, buildWorldGrids, buildWorldTerrain, type TerrainPlan } from '@space-game/domain';
import { HexKit, hexKitUrl, type KitModel } from './hex-kit';
import { TerrainDecor } from './terrain-decor';
import { TerrainView } from './terrain-view';

const PUBLIC = join(process.cwd(), 'apps', 'game', 'public');
const fromDisk = async (url: string): Promise<ArrayBuffer> => {
  const b = readFileSync(join(PUBLIC, url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

const grids = buildWorldGrids(TAU_CETI_BODIES);
const grid = grids.get(TC_C)!;
const plan: TerrainPlan = buildWorldTerrain(TAU_CETI_BODIES, grids).get(TC_C)!;
const R = grid.radius;

function idsOf(p: TerrainPlan): Set<string> {
  const ids = new Set<string>();
  for (const v of p.variants) if (v) ids.add(v.id);
  for (const d of p.decor) ids.add(d.model);
  return ids;
}

describe('HexKit', () => {
  it('builds asset URLs under kaykit-hex for both assets bases', () => {
    expect(hexKitUrl('assets/', 'hex_water')).toBe('assets/kaykit-hex/hex_water.gltf.glb');
    expect(hexKitUrl('/assets', 'castle')).toBe('/assets/kaykit-hex/castle.gltf.glb');
  });

  it('reads the kit files with the authored size and triangle counts', async () => {
    const kit = new HexKit('assets/', fromDisk);
    const tile = await kit.load('hex_forest');
    expect(tile.triangles).toBe(56);
    expect(tile.size.x).toBeCloseTo(2, 2);
    expect(tile.size.z).toBeCloseTo(2.309, 2);
    expect(tile.size.y).toBeCloseTo(1, 2);
    expect(tile.parts.map((p) => p.mat)).toContain('Green');
    const castle = await kit.load('castle');
    expect(castle.triangles).toBe(2231);
    expect(Math.abs(castle.box.min.y)).toBeLessThan(0.05);
    expect(await kit.load('hex_forest')).toBe(tile); // cached
  });

  it('has a file for every id the Tau Ceti c plan uses', async () => {
    const ids = idsOf(plan);
    const models = await new HexKit('assets/', fromDisk).loadAll(ids);
    expect(models.size).toBe(ids.size);
  });
});

describe('TerrainView on Tau Ceti c', () => {
  let kit: ReadonlyMap<string, KitModel>;
  let view: TerrainView;
  beforeAll(async () => {
    kit = await new HexKit('assets/', fromDisk).loadAll(idsOf(plan));
    view = new TerrainView(grid, plan);
  });
  afterAll(() => view.dispose());

  it('is hidden and not ready until the kit is applied; then hexagons get kit tiles and pentagons plates', () => {
    expect(view.ready).toBe(false);
    expect(view.visual.visible).toBe(false);
    view.applyKit(kit);
    expect(view.ready).toBe(true);
    for (const t of grid.tiles) {
      const { count } = view.rangeOf(t.index);
      if (t.kind === 'PENT') expect(count / 3, `pentagon ${t.index}`).toBe(30); // top 15 + walls 10 + bottom 5
      else expect(count / 3, `tile ${t.index}`).toBe(kit.get(plan.variants[t.index]!.id)!.triangles);
    }
    expect(view.terrainTriangles).toBeGreaterThan(10000);
  });

  it('keeps every vertex between the tile bottom and just above the body radius', () => {
    const p = view.visual.geometry.getAttribute('position');
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < p.count; i++) {
      const r = Math.hypot(p.getX(i), p.getY(i), p.getZ(i));
      min = Math.min(min, r);
      max = Math.max(max, r);
    }
    expect(max).toBeLessThanOrEqual(R + 0.08 * view.scale);
    expect(min).toBeGreaterThanOrEqual(R - view.scale - 1e-3);
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
    expect(top).toBeGreaterThan(1000);
    expect(inward / top).toBeLessThan(0.01);
  });

  it('is closed seen from inside the body: a ray from the centre through any tile hits a face turned to it', () => {
    // Regression: pentagon plates used to be a top surface only. From inside the body (a camera zoomed
    // below the surface) the kit tiles showed their bottoms and every pentagon was a hole: a black pentagon.
    const p = view.visual.geometry.getAttribute('position');
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    const ray = new THREE.Ray();
    const hit = new THREE.Vector3();
    const open: number[] = [];
    for (const t of grid.tiles) {
      ray.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(t.normal.x, t.normal.y, t.normal.z));
      const { start, count } = view.rangeOf(t.index);
      let seen = false;
      for (let v = start; v < start + count && !seen; v += 3) {
        a.fromBufferAttribute(p, v);
        b.fromBufferAttribute(p, v + 1);
        c.fromBufferAttribute(p, v + 2);
        seen = ray.intersectTriangle(a, b, c, true, hit) !== null; // backface culling: only faces turned to the ray
      }
      if (!seen) open.push(t.index);
    }
    expect(open).toEqual([]);
  });

  it('paints hover and selection on the whole tile and restores it', () => {
    const idx = 100;
    const base = view.colorOf(idx).clone();
    view.setHover(idx);
    expect(view.colorOf(idx).r).toBeGreaterThan(base.r);
    view.setHover(null);
    expect(view.colorOf(idx).getHex()).toBe(base.getHex());
    view.setSelected(idx);
    expect(view.colorOf(idx).getHex()).not.toBe(base.getHex());
    view.setSelected(null);
    expect(view.colorOf(idx).getHex()).toBe(base.getHex());
  });

  it('tints deposits on the top surface and fades the tint when the deposit is exhausted', () => {
    const dep = grid.tiles.find((t) => t.deposit && t.kind === 'HEX')!;
    const twin = grid.tiles.find((t) => !t.deposit && t.kind === 'HEX' && plan.kinds[t.index] === plan.kinds[dep.index] && plan.variants[t.index]!.id === plan.variants[dep.index]!.id);
    const tinted = view.colorOf(dep.index).clone();
    view.setExhausted(dep.index, true);
    const faded = view.colorOf(dep.index).clone();
    expect(faded.getHex()).not.toBe(tinted.getHex());
    view.setExhausted(dep.index, false);
    expect(view.colorOf(dep.index).getHex()).toBe(tinted.getHex());
    if (twin) expect(tinted.getHex()).not.toBe(view.colorOf(twin.index).getHex());
  });
});

describe('TerrainDecor on Tau Ceti c', () => {
  it('instances every planned model, hides tiles on demand and restores them', async () => {
    const kit = await new HexKit('assets/', fromDisk).loadAll(idsOf(plan));
    const view = new TerrainView(grid, plan);
    const decor = new TerrainDecor(grid, plan, view.frames, kit);
    expect(decor.instances).toBe(plan.decor.length);
    expect(decor.drawCalls).toBe(new Set(plan.decor.map((d) => d.model)).size);
    expect(decor.triangles).toBeLessThan(170000);
    // the castle is the tallest model: about 2.5 kit units × its scale above the surface
    expect(decor.topRadius).toBeGreaterThan(R * 1.2);
    expect(decor.topRadius).toBeLessThan(R * 1.45);

    const castle = plan.settlementCenter!;
    const mesh = decor.group.children.find((c) => c.name === 'Decor_castle') as THREE.InstancedMesh;
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(0, m);
    const shown = m.elements.slice();
    expect(Math.abs(m.determinant())).toBeGreaterThan(0);
    decor.setHidden([castle]);
    mesh.getMatrixAt(0, m);
    expect(m.determinant()).toBe(0);
    decor.setHidden([castle]); // idempotent
    decor.setHidden([]);
    mesh.getMatrixAt(0, m);
    expect(m.elements).toEqual(shown);
    decor.dispose();
    view.dispose();
  });
});
