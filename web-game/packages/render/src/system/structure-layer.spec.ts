import * as THREE from 'three';
import { PLANET_ID, POC_SCENARIO, Simulation, standingStructure, type PlanetGrid, type Structure } from '@space-game/domain';
import { geometryTriangles } from './buffers';
import { HemisphereCuller } from './hemisphere-culler';
import { ModelKit, boxMatrix } from './model-kit';
import { MID_LOD_REFRESH, STRUCTURE_MID_ANGLE, STRUCTURE_MID_PX, STRUCTURE_NEAR_ANGLE, STRUCTURE_NEAR_PX, StructureLayer, type PlacedPart } from './structure-layer';

const deg = Math.PI / 180;
const grid: PlanetGrid = new Simulation(POC_SCENARIO).grids.get(PLANET_ID)!;
const R = grid.radius;
const Z = new THREE.Vector3(0, 0, 1);

/** The six-sided tile whose normal is nearest `angle` from +Z (on the +X side). */
function tileAt(angle: number): number {
  const want = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
  const along = (t: PlanetGrid['tiles'][number]) => want.x * t.normal.x + want.y * t.normal.y + want.z * t.normal.z;
  return grid.tiles.filter((t) => t.neighbors.length === 6).reduce((best, t) => (along(t) > along(best) ? t : best)).index;
}

const dirOf = (p: PlacedPart) => p.center.clone().normalize();
const angleOf = (p: PlacedPart, camera: THREE.Vector3) => dirOf(p).angleTo(camera);
/** Camera at distance `d` whose direction is `angle` from the part's centre, turned towards +Z. */
function cameraAt(p: PlacedPart, angle: number, d: number): THREE.Vector3 {
  const u = dirOf(p);
  const w = Z.clone().addScaledVector(u, -u.dot(Z)).normalize();
  return u.multiplyScalar(Math.cos(angle)).addScaledVector(w, Math.sin(angle)).multiplyScalar(d);
}
/** Screen scale [px per unit at distance one] that shows a part `px` wide from `camera`. */
const scaleFor = (p: PlacedPart, camera: THREE.Vector3, px: number) => (px * camera.distanceTo(p.center)) / p.width;

interface Rig {
  layer: StructureLayer;
  culler: HemisphereCuller;
  kit: ModelKit;
  /** Camera move, culler update, band, re-cull: what `SystemScene.updateDetail` does each frame. */
  view(camera: THREE.Vector3, pxPerUnit: number): boolean;
  dispose(): void;
}

function rig(structures: Structure[], withCuller = true): Rig {
  const kit = new ModelKit('assets/'); // placeholders: the registry boxes, no network
  const culler = new HemisphereCuller(R);
  const layer = new StructureLayer(grid, kit, new THREE.LineBasicMaterial(), false, 'spacebits', withCuller ? culler : null);
  layer.sync(structures, new Set());
  return {
    layer,
    culler,
    kit,
    view(camera, pxPerUnit) {
      culler.update(camera);
      const changed = layer.updateBand(camera, pxPerUnit);
      layer.recull();
      return changed;
    },
    dispose() {
      layer.dispose();
      kit.dispose();
    },
  };
}

/** Where every solid part is drawn: its model batch, its mid-band box, or nothing (culled). */
function drawnAs(layer: StructureLayer, part: PlacedPart): 'model' | 'box' | 'none' {
  const model = layer.slotOfPart(part) >= 0;
  const box = layer.midSlotOfPart(part) >= 0;
  expect(model && box).toBe(false); // never both
  return model ? 'model' : box ? 'box' : 'none';
}

describe('StructureLayer mid LOD band (LOD-mid)', () => {
  // one-tile habitats at 0°, 30°, 60° and 70° round the planet from +Z
  const at = [0, 30, 60, 70].map((a) => standingStructure('HAB', PLANET_ID, [tileAt(a * deg)]));
  const D = 3.4 * R; // the default planet view
  const front = new THREE.Vector3(0, 0, D);

  it('draws the structures far round the body and small on screen as proxy boxes, the rest as models; every solid part exactly once', () => {
    const r = rig(at);
    const { layer, kit } = r;
    const parts = at.map((s) => layer.partsOf(s.id)[0]!);
    // small on screen (≤ 30 px): only the angle decides
    const k = Math.min(...parts.map((p) => scaleFor(p, front, 30)));
    expect(r.view(front, k)).toBe(true);
    expect(parts.map((p) => layer.inMidBand(p))).toEqual(parts.map((p) => angleOf(p, front) > STRUCTURE_MID_ANGLE));
    expect(parts.map((p) => layer.inMidBand(p))).toEqual([false, false, true, true]);
    expect(parts.map((p) => drawnAs(layer, p))).toEqual(['model', 'model', 'box', 'box']);
    // the box: the model's box under the part matrix (what picking tests), in the model's tone
    const box = parts[2]!;
    const mid = layer.midMesh!;
    const want = box.local.clone().multiply(boxMatrix(kit.box(box.model), new THREE.Matrix4()));
    mid.getMatrixAt(layer.midSlotOfPart(box), new THREE.Matrix4()).elements.forEach((x, i) => expect(x).toBeCloseTo(want.elements[i]!, 4));
    expect(mid.getColorAt(layer.midSlotOfPart(box), new THREE.Color()).getHex()).toBe(kit.tone(box.model).getHex());
    expect(mid.geometry).toBe(kit.proxyBox());
    // the triangles: models of the near ones, 12 per box
    const out = { triangles: 0, instances: 0 };
    layer.drawn(out);
    expect(layer.midInstances).toEqual({ written: 4, drawn: 2 });
    expect(out.triangles).toBe(2 * geometryTriangles(kit.geometry('basemodule_A')) + 2 * 12);
    expect(layer.instancesOf('basemodule_A')).toEqual({ written: 4, drawn: 2 });
    r.dispose();
  });

  it('switches by the angle round the body with hysteresis: in beyond STRUCTURE_MID_ANGLE, out nearer than STRUCTURE_NEAR_ANGLE', () => {
    const r = rig(at);
    const part = r.layer.partsOf(at[2]!.id)[0]!;
    const k = scaleFor(part, front, 20); // small on screen at any of these angles
    const view = (angle: number) => {
      r.view(cameraAt(part, angle, D), k);
      return r.layer.inMidBand(part);
    };
    const gap = (STRUCTURE_MID_ANGLE + STRUCTURE_NEAR_ANGLE) / 2;
    expect(view(STRUCTURE_MID_ANGLE + 3 * deg)).toBe(true);
    expect(view(gap)).toBe(true); // in the gap from beyond: stays a box
    expect(view(STRUCTURE_NEAR_ANGLE - 3 * deg)).toBe(false);
    expect(view(gap)).toBe(false); // in the gap from nearer: stays a model
    expect(drawnAs(r.layer, part)).toBe('model');
    expect(view(STRUCTURE_MID_ANGLE + 3 * deg)).toBe(true);
    expect(drawnAs(r.layer, part)).toBe('box');
    r.dispose();
  });

  it('switches by the width on screen with hysteresis: a box only below STRUCTURE_MID_PX, a model again above STRUCTURE_NEAR_PX', () => {
    const r = rig(at);
    const part = r.layer.partsOf(at[3]!.id)[0]!; // 70° round: beyond the band angle from the front
    const view = (px: number) => {
      r.view(front, scaleFor(part, front, px));
      return r.layer.inMidBand(part);
    };
    const gap = (STRUCTURE_MID_PX + STRUCTURE_NEAR_PX) / 2;
    expect(view(STRUCTURE_MID_PX - 4)).toBe(true);
    expect(view(gap)).toBe(true);
    expect(view(STRUCTURE_NEAR_PX + 4)).toBe(false); // wide on screen (a big window): the model
    expect(view(gap)).toBe(false);
    expect(view(STRUCTURE_MID_PX - 4)).toBe(true);
    r.dispose();
  });

  it('evaluates the band only when the camera moved: a still camera changes nothing and touches no buffer', () => {
    const r = rig(at);
    const { layer } = r;
    const part = layer.partsOf(at[2]!.id)[0]!;
    const k = scaleFor(part, front, 30);
    expect(r.view(front, k)).toBe(true);
    const mid = layer.midMesh!;
    const model = layer.group.children.find((o) => o.name === `${PLANET_ID}_basemodule_A`) as THREE.InstancedMesh;
    const versions = () => [mid.instanceMatrix.version, mid.instanceColor!.version, model.instanceMatrix.version];
    const before = versions();
    for (let i = 0; i < 5; i++) expect(r.view(front, k)).toBe(false);
    // a move shorter than MID_LOD_REFRESH of the height above the surface: not even looked at
    const nudge = front.clone().add(new THREE.Vector3(0.5 * MID_LOD_REFRESH * (D - R), 0, 0));
    expect(r.view(nudge, k)).toBe(false);
    expect(versions()).toEqual(before);
    // a longer move that changes no band: evaluated, still no rewrite
    const moved = front.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), -1 * deg);
    expect(r.view(moved, k)).toBe(false);
    expect(layer.inMidBand(part)).toBe(true);
    r.dispose();
  });

  it('picking hits a structure in the band: its box is the one the ray is tested against', () => {
    const r = rig(at);
    const { layer } = r;
    const part = layer.partsOf(at[3]!.id)[0]!;
    r.view(front, scaleFor(part, front, 30));
    expect(drawnAs(layer, part)).toBe('box');
    // straight down onto it from above its tile
    const n = dirOf(part);
    const ray = new THREE.Ray(part.center.clone().addScaledVector(n, R), n.clone().negate());
    expect(layer.pick(ray, new THREE.Ray(), new THREE.Vector3())?.part.structureId).toBe(at[3]!.id);
    // and its tile still belongs to it
    expect(layer.tileOwner.get(part.tiles[0]!)?.id).toBe(at[3]!.id);
    r.dispose();
  });

  it('switching makes and frees no GPU objects; far proxies (T4b) park the band and give it back', () => {
    const r = rig(at);
    const { layer } = r;
    const part = layer.partsOf(at[3]!.id)[0]!;
    const meshes = () => layer.group.children.slice();
    const gpu = () => new Set(layer.group.children.flatMap((o) => [(o as THREE.Mesh).geometry, (o as THREE.Mesh).material]));
    r.view(front, scaleFor(part, front, 30));
    const objects = meshes();
    const resources = gpu();
    const midMesh = layer.midMesh;
    for (const px of [STRUCTURE_NEAR_PX + 10, STRUCTURE_MID_PX - 10, STRUCTURE_NEAR_PX + 10, STRUCTURE_MID_PX - 10]) r.view(front, scaleFor(part, front, px));
    expect(meshes()).toEqual(objects);
    expect(gpu()).toEqual(resources);
    expect(layer.midMesh).toBe(midMesh);
    expect(drawnAs(layer, part)).toBe('box');

    // far away (T4b): one proxy mesh for everything, the band parked and left alone
    expect(layer.setProxy(true)).toBe(true);
    expect(layer.midMesh!.visible).toBe(false);
    expect(layer.midInstances.drawn).toBe(0);
    expect(layer.updateBand(front.clone().multiplyScalar(2), 1)).toBe(false);
    expect(layer.group.children.filter((o) => o.visible && o instanceof THREE.InstancedMesh)).toEqual([layer.proxyMesh]);
    layer.setProxy(false);
    layer.recull();
    expect(drawnAs(layer, part)).toBe('box');
    expect(meshes()).toEqual(objects);
    r.dispose();
  });

  it('a layout change keeps the band of the structures that stay; a site in the band grows as a box', () => {
    const r = rig(at);
    const { layer } = r;
    const k = scaleFor(layer.partsOf(at[2]!.id)[0]!, front, 30);
    r.view(front, k);
    const rising: Structure = { ...standingStructure('HAB', PLANET_ID, [tileAt(80 * deg)]), state: 'CONSTRUCTING', progress: 0.5 };
    layer.sync([...at, rising], new Set());
    expect(layer.inMidBand(layer.partsOf(at[2]!.id)[0]!)).toBe(true); // before the next evaluation
    expect(layer.inMidBand(layer.partsOf(at[0]!.id)[0]!)).toBe(false);
    r.view(front, k);
    const part = layer.partsOf(rising.id)[0]!;
    expect(layer.inMidBand(part)).toBe(true);
    const yLen = (m: THREE.Matrix4) => new THREE.Vector3().setFromMatrixColumn(m, 1).length();
    const full = yLen(part.local.clone().multiply(boxMatrix(r.kit.box(part.model), new THREE.Matrix4())));
    const slot = layer.midSlotOfPart(part);
    expect(slot).toBeGreaterThanOrEqual(0);
    expect(yLen(layer.midMesh!.getMatrixAt(slot, new THREE.Matrix4())) / full).toBeCloseTo(0.5, 3);
    layer.sync([...at, { ...rising, progress: 0.8 }], new Set());
    r.view(front, k);
    expect(yLen(layer.midMesh!.getMatrixAt(layer.midSlotOfPart(part), new THREE.Matrix4())) / full).toBeCloseTo(0.8, 3);
    r.dispose();
  });

  it('without a culler (cullDetail false) there is no band: every part is a model', () => {
    const r = rig(at, false);
    const { layer } = r;
    expect(layer.midMesh).toBeNull();
    expect(layer.updateBand(front, 1)).toBe(false);
    layer.recull();
    for (const s of at) expect(drawnAs(layer, layer.partsOf(s.id)[0]!)).toBe('model');
    r.dispose();
  });
});
