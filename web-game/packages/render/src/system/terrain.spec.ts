import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { INITIAL_BODIES, TAU_CETI_BODIES, TC_C, TC_D, TC_F, buildWorldGrids, dressTerrain, type TerrainPlan } from '@space-game/domain';
import { HemisphereCuller } from './hemisphere-culler';
import { HexKit, hexKitUrl, type KitModel } from './hex-kit';
import { LOD_TREE, TerrainDecor } from './terrain-decor';
import { RUIN_FADE, RUIN_GREY, TONE, isRuinBuilding, objectTone, ruinTone } from './terrain-tones';
import { TerrainView } from './terrain-view';

const PUBLIC = join(process.cwd(), 'apps', 'game', 'public');
const fromDisk = async (url: string): Promise<ArrayBuffer> => {
  const b = readFileSync(join(PUBLIC, url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

const grids = buildWorldGrids(TAU_CETI_BODIES);
const grid = grids.get(TC_C)!;
const plan: TerrainPlan = dressTerrain(grid);
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

  it('loads the Kenney decor (`kenney:<file>`) from assets/kenney, centred on x/z with the base on y = 0', async () => {
    expect(hexKitUrl('assets/', 'kenney:crater')).toBe('assets/kenney/crater.glb');
    expect(hexKitUrl('/assets', 'kenney:rock_largeA')).toBe('/assets/kenney/rock_largeA.glb');
    const kit = new HexKit('assets/', fromDisk);
    const want: Record<string, number> = { crater: 60, craterLarge: 60, rock_largeA: 176, rock_largeB: 172, rock_crystals: 364, rock_crystalsLargeA: 384 };
    for (const [file, triangles] of Object.entries(want)) {
      const m = await kit.load(`kenney:${file}`);
      expect(m.triangles, file).toBe(triangles);
      // authored at x = 2, z = 1.5: centred so the tile frame puts it in the middle of the tile
      expect(Math.abs(m.box.min.x + m.box.max.x), file).toBeLessThan(1e-6);
      expect(Math.abs(m.box.min.z + m.box.max.z), file).toBeLessThan(1e-6);
      expect(Math.abs(m.box.min.y), file).toBeLessThan(1e-3);
      const xs = m.parts.flatMap((p) => Array.from(p.pos.filter((_, i) => i % 3 === 0)));
      expect(Math.min(...xs)).toBeCloseTo(m.box.min.x, 5);
    }
  });

  it('has a file for every id the plans of all terrain bodies use', async () => {
    const all = new Set<string>();
    for (const [, g] of [...buildWorldGrids(INITIAL_BODIES), ...grids]) if (g.terrain) for (const id of idsOf(dressTerrain(g))) all.add(id);
    expect([...all].filter((id) => id.startsWith('kenney:')).length).toBeGreaterThan(3);
    const models = await new HexKit('assets/', fromDisk).loadAll(all);
    expect(models.size).toBe(all.size);
  });
});

describe('TerrainDecor on the dry and winter bodies (T5)', () => {
  const colourOf = (decor: TerrainDecor, id: string, kit: ReadonlyMap<string, KitModel>, mat: string): number => {
    const mesh = decor.group.children.find((o) => o.name === `Decor_${id}`) as THREE.InstancedMesh;
    const color = mesh.geometry.getAttribute('color');
    let v = 0;
    for (const part of kit.get(id)!.parts) {
      if (part.mat === mat) return new THREE.Color(color.getX(v), color.getY(v), color.getZ(v)).getHex();
      v += part.pos.length / 3;
    }
    throw new Error(`${id} has no ${mat}`);
  };

  it('Tau Ceti d (dry regolith): craters in the ground tone stand on their tiles, crystals on rock; bushes olive', async () => {
    const g = grids.get(TC_D)!;
    const p = dressTerrain(g);
    const kit = await new HexKit('assets/', fromDisk).loadAll(idsOf(p));
    const view = new TerrainView(g, p);
    const decor = new TerrainDecor(g, p, view.frames, kit);
    expect(decor.instances).toBe(p.decor.length);
    const craters = p.decor.filter((d) => d.model.startsWith('kenney:crater'));
    expect(craters.length).toBeGreaterThan(5);
    expect(colourOf(decor, 'kenney:crater', kit, 'rock')).toBe(new THREE.Color(TONE.regolith).getHex());
    expect(colourOf(decor, 'detail_treeA', kit, 'GreenDark')).toBe(new THREE.Color(TONE.olive).getHex());
    // a crater instance sits on its tile: its base at the body radius, its centre over the tile centre
    const mesh = decor.group.children.find((o) => o.name === 'Decor_kenney:craterLarge') as THREE.InstancedMesh;
    const first = p.decor.find((d) => d.model === 'kenney:craterLarge')!;
    const m = new THREE.Matrix4();
    mesh.getMatrixAt(decor.slotsOn(first.tile).find((s) => s.mesh === mesh.name)!.slot, m);
    const pos = new THREE.Vector3().setFromMatrixPosition(m);
    const n = g.tiles[first.tile]!.normal;
    expect(pos.length()).toBeCloseTo(g.radius, 2);
    expect(pos.clone().normalize().dot(new THREE.Vector3(n.x, n.y, n.z))).toBeGreaterThan(0.9999);
    // the Kenney models are cheap: the whole decor stays below the old KayKit-only budget
    expect(decor.triangles).toBeLessThan(60000);
    decor.dispose();
    view.dispose();
  });

  it('Tau Ceti f (winter): crowns in the ice tone, darker trunks', async () => {
    const g = grids.get(TC_F)!;
    const p = dressTerrain(g);
    const kit = await new HexKit('assets/', fromDisk).loadAll(idsOf(p));
    const view = new TerrainView(g, p);
    const decor = new TerrainDecor(g, p, view.frames, kit);
    expect(colourOf(decor, 'detail_treeA', kit, 'GreenDark')).toBe(new THREE.Color(TONE.ice).getHex());
    expect(colourOf(decor, 'detail_treeA', kit, 'BrownDark')).toBe(new THREE.Color(objectTone('BrownDark', p)).getHex());
    expect(objectTone('BrownDark', p)).not.toBe(objectTone('BrownDark'));
    // the LOD trees share the crowns
    decor.setLod(true);
    const lod = decor.group.children.find((o) => o.name === 'Decor_lod_trees') as THREE.InstancedMesh;
    const c = lod.geometry.getAttribute('color');
    const crowns = new Set<number>();
    for (let i = 0; i < c.count; i++) crowns.add(new THREE.Color(c.getX(i), c.getY(i), c.getZ(i)).getHex());
    expect(crowns.has(new THREE.Color(TONE.ice).getHex())).toBe(true);
    decor.dispose();
    view.dispose();
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
    expect(mesh.count).toBe(1);
    // hidden = left out of the instance buffer (T4: not drawn at zero scale), no draw call when nothing is left
    decor.setHidden([castle]);
    expect(mesh.count).toBe(0);
    expect(mesh.visible).toBe(false);
    expect(decor.slotsOn(castle)).toEqual([{ mesh: 'Decor_castle', slot: -1 }]);
    decor.setHidden([castle]); // idempotent
    decor.setHidden([]);
    expect(mesh.count).toBe(1);
    expect(mesh.visible).toBe(true);
    mesh.getMatrixAt(0, m);
    expect(m.elements).toEqual(shown);
    // a forest tile: its trees leave their meshes, every other instance keeps its matrix in the compacted order
    const forest = plan.decor.find((d) => d.model === 'detail_treeA')!.tile;
    const trees = decor.group.children.find((c) => c.name === 'Decor_detail_treeA') as THREE.InstancedMesh;
    const before = trees.count;
    const others = Array.from({ length: before }, (_, i) => trees.getMatrixAt(i, new THREE.Matrix4()).elements.slice());
    const own = decor.slotsOn(forest).filter((s) => s.mesh === 'Decor_detail_treeA').map((s) => s.slot);
    decor.setHidden([forest]);
    expect(trees.count).toBe(before - own.length);
    const left = Array.from({ length: trees.count }, (_, i) => trees.getMatrixAt(i, new THREE.Matrix4()).elements.slice());
    expect(left).toEqual(others.filter((_, i) => !own.includes(i)));
    decor.setHidden([]);
    expect(trees.count).toBe(before);
    decor.dispose();
    view.dispose();
  });

  it('draws only the instances in the visible cap of the culler, keeps hidden tiles hidden, and restores all (T4)', async () => {
    const kit = await new HexKit('assets/', fromDisk).loadAll(idsOf(plan));
    const view = new TerrainView(grid, plan);
    const culler = new HemisphereCuller(R);
    const decor = new TerrainDecor(grid, plan, view.frames, kit, culler);
    const all = { triangles: 0, instances: 0 };
    decor.drawn(all);
    expect(all.instances).toBe(decor.instances); // before the first update: everything
    // the camera over the settlement at 3.4 R (the planet view's default distance)
    const centre = grid.tiles[plan.settlementCenter!]!.normal;
    const dir = new THREE.Vector3(centre.x, centre.y, centre.z).normalize();
    expect(culler.update(dir.clone().multiplyScalar(3.4 * R))).toBe(true);
    decor.recull();
    const near = { triangles: 0, instances: 0 };
    decor.drawn(near);
    expect(near.instances).toBeLessThan(all.instances);
    expect(near.triangles).toBeLessThan(all.triangles);
    // what is drawn is exactly what faces the camera beyond the horizon slack: every item of the plan, by tile
    const facing = (tile: number) => {
      const n = grid.tiles[tile]!.normal;
      return n.x * dir.x + n.y * dir.y + n.z * dir.z;
    };
    for (const d of plan.decor) {
      const slots = decor.slotsOn(d.tile);
      if (facing(d.tile) > R / (3.4 * R)) expect(slots.every((s) => s.slot >= 0), `tile ${d.tile} faces the camera`).toBe(true);
      // behind the horizon: tall models (the castle reaches 1.31 R) may still show over it, at most ~40° further
      if (facing(d.tile) < -0.6) expect(slots.every((s) => s.slot === -1), `tile ${d.tile} is behind the body`).toBe(true);
    }
    // the castle stands under the camera: hiding and showing it again works on the culled buffers
    const castle = plan.settlementCenter!;
    decor.setHidden([castle]);
    expect(decor.instancesOf('castle')).toEqual({ written: 1, drawn: 0 });
    decor.setHidden([]);
    expect(decor.instancesOf('castle')).toEqual({ written: 1, drawn: 1 });
    // the far side: the settlement is gone, its antipode shows
    culler.update(dir.clone().multiplyScalar(-3.4 * R));
    decor.recull();
    expect(decor.instancesOf('castle').drawn).toBe(0);
    for (const d of plan.decor) if (facing(d.tile) < -R / (3.4 * R)) expect(decor.slotsOn(d.tile).every((s) => s.slot >= 0)).toBe(true);
    decor.dispose();
    view.dispose();
  });

  it('LOD band: every tree as detail_treeA, about half of them, one draw call; full detail again when it ends (T4)', async () => {
    const kit = await new HexKit('assets/', fromDisk).loadAll(idsOf(plan));
    const view = new TerrainView(grid, plan);
    const decor = new TerrainDecor(grid, plan, view.frames, kit);
    const trees = plan.decor.filter((d) => d.model.startsWith('detail_tree'));
    const treeModels = [...new Set(trees.map((d) => d.model))];
    expect(treeModels.length).toBeGreaterThan(1);
    const full = { triangles: 0, instances: 0 };
    decor.drawn(full);
    const tri = (id: string) => kit.get(id)!.triangles;
    expect(tri(LOD_TREE)).toBe(Math.min(...treeModels.map(tri))); // the cheapest tree

    decor.setLod(true);
    expect(decor.lodActive).toBe(true);
    for (const id of treeModels) expect(decor.instancesOf(id).drawn, id).toBe(0);
    const lod = decor.instancesOf('lod');
    expect(lod.written).toBe(trees.length);
    expect(lod.drawn).toBeGreaterThan(trees.length * 0.35);
    expect(lod.drawn).toBeLessThan(trees.length * 0.65);
    const band = { triangles: 0, instances: 0 };
    decor.drawn(band);
    expect(band.instances).toBe(full.instances - trees.length + lod.drawn);
    expect(band.triangles).toBe(full.triangles - trees.reduce((s, d) => s + tri(d.model), 0) + lod.drawn * tri(LOD_TREE));
    // ruins, rocks and mountains keep their models
    expect(decor.instancesOf('castle').drawn).toBe(1);
    // the same trees every time (hash of the tile), and hidden tiles stay hidden in the band
    const kept = trees.filter((d) => decor.slotsOn(d.tile).some((s) => s.mesh === 'Decor_lod_trees' && s.slot >= 0));
    expect(kept.length).toBeGreaterThan(0);
    const tile = kept[0]!.tile;
    decor.setHidden([tile]);
    expect(decor.slotsOn(tile).every((s) => s.slot === -1)).toBe(true);
    decor.setHidden([]);
    decor.setLod(false);
    const back = { triangles: 0, instances: 0 };
    decor.drawn(back);
    expect(back).toEqual(full);
    expect(decor.instancesOf('lod').drawn).toBe(0);
    decor.dispose();
    view.dispose();
  });

  it('fades the settlement buildings (ruins, T-23) and keeps trees, rocks and mountains in full tone', async () => {
    const kit = await new HexKit('assets/', fromDisk).loadAll(idsOf(plan));
    const view = new TerrainView(grid, plan);
    const decor = new TerrainDecor(grid, plan, view.frames, kit);
    const c = new THREE.Color();
    const want = new THREE.Color();
    const buildings = new Set<string>();
    for (const id of new Set(plan.decor.map((d) => d.model))) {
      const mesh = decor.group.children.find((o) => o.name === `Decor_${id}`) as THREE.InstancedMesh;
      const color = mesh.geometry.getAttribute('color');
      const ruin = isRuinBuilding(id);
      if (ruin) buildings.add(id);
      let v = 0;
      for (const part of kit.get(id)!.parts) {
        want.setHex(ruin ? ruinTone(objectTone(part.mat)) : objectTone(part.mat));
        c.setRGB(color.getX(v), color.getY(v), color.getZ(v));
        expect(c.getHex(), `${id} ${part.mat}`).toBe(want.getHex());
        v += part.pos.length / 3;
      }
    }
    expect([...buildings].sort()).toEqual(['barracks', 'castle', 'farm_plot', 'house', 'lumbermill', 'market', 'mill', 'mine', 'watchtower', 'well'].filter((b) => plan.decor.some((d) => d.model === b)));
    expect(buildings.has('castle')).toBe(true);
    decor.dispose();
    view.dispose();
  });
});

describe('ruin tones (T-23)', () => {
  const rgb = (hex: number) => [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff] as const;

  it('dims by RUIN_FADE and pulls RUIN_GREY of the way to the grey of equal luminance', () => {
    expect(RUIN_FADE).toBe(0.8);
    expect(RUIN_GREY).toBe(0.3);
    // a grey only dims
    expect(ruinTone(0xffffff)).toBe(0xcccccc);
    expect(ruinTone(0x000000)).toBe(0x000000);
    // a saturated tone loses saturation and brightness, keeps its hue order
    const [r, g, b] = rgb(TONE.thatch);
    const [fr, fg, fb] = rgb(ruinTone(TONE.thatch));
    expect(fr).toBeLessThan(r);
    expect(fr - fb).toBeLessThan(r - b);
    expect(fr >= fg && fg >= fb).toBe(r >= g && g >= b);
    const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    expect(fr).toBe(Math.round((r + (y - r) * 0.3) * 0.8));
  });

  it('treats settlement models as ruins, not trees, rocks or mountains', () => {
    for (const id of ['castle', 'house', 'farm_plot', 'mill', 'well', 'watchtower']) expect(isRuinBuilding(id), id).toBe(true);
    for (const id of ['detail_treeA', 'detail_rocks', 'detail_rocks_small', 'mountain', 'kenney:crater', 'kenney:rock_crystals']) expect(isRuinBuilding(id), id).toBe(false);
  });
});
