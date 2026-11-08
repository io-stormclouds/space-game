import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { ModelLibrary, SceneSource } from './model-library';
import { ALL_MODELS, ModelPart, SHIP_MODEL, STRUCTURE_MODELS, THEMES, isRecentred, packOf } from './model-registry';

const ASSETS = join(process.cwd(), 'public', 'assets');

/**
 * Loads a KayKit glTF from disk with its .bin embedded as a data URI and textures stripped,
 * so GLTFLoader.parse works in jsdom without network or image decoding.
 */
function gltfForTest(file: string): string {
  const dir = join(ASSETS, 'kaykit');
  const json = JSON.parse(readFileSync(join(dir, `${file}.gltf`), 'utf-8'));
  for (const buffer of json.buffers) {
    const bin = readFileSync(join(dir, buffer.uri));
    buffer.uri = `data:application/octet-stream;base64,${bin.toString('base64')}`;
  }
  delete json.images;
  delete json.textures;
  for (const m of json.materials ?? []) delete m.pbrMetallicRoughness?.baseColorTexture;
  return JSON.stringify(json);
}

/** Disk-backed scene source: KayKit via the data-URI glTF above, Kenney .glb as an ArrayBuffer (no textures). */
const diskSource: SceneSource = (part: ModelPart) => {
  const loader = new GLTFLoader();
  const data: string | ArrayBuffer =
    part.pack === 'kaykit'
      ? gltfForTest(part.file)
      : (() => {
          const buf = readFileSync(join(ASSETS, 'kenney', `${part.file}.glb`));
          // copy into this realm's ArrayBuffer: GLTFLoader checks `instanceof ArrayBuffer`
          const ab = new ArrayBuffer(buf.length);
          new Uint8Array(ab).set(buf);
          return ab;
        })();
  return new Promise((resolve, reject) => loader.parse(data, '', (g) => resolve(g.scene), reject));
};

describe('ModelLibrary', () => {
  const lib = new ModelLibrary(undefined, diskSource);

  afterAll(() => lib.dispose());

  it('flattens the dropship (3 meshes, door nodes translated) into one geometry with the authored bounds', async () => {
    const asset = await lib.parse('dropship', gltfForTest('dropship'));
    expect(asset.triangles).toBe(914);
    expect(asset.size.z).toBeCloseTo(SHIP_MODEL.footprint, 1); // length along forward
    expect(asset.size.x).toBeCloseTo(3.0, 1); // doors stick out sideways
    expect(asset.size.y).toBeCloseTo(SHIP_MODEL.height, 1);
    expect(asset.geometry.getAttribute('uv')).toBeDefined();
    expect(asset.geometry.getAttribute('normal')).toBeDefined();
    expect(asset.geometry.boundingBox!.min.y).toBeCloseTo(-SHIP_MODEL.baseOffset, 1);
  });

  it('flattens the drill (2 meshes) and keeps the registry bounds in sync with the file', async () => {
    const asset = await lib.parse('drill_structure', gltfForTest('drill_structure'));
    expect(asset.triangles).toBe(1198);
    const spec = STRUCTURE_MODELS.MINE;
    expect(Math.max(asset.size.x, asset.size.z)).toBeCloseTo(spec.footprint, 1);
    expect(asset.size.y).toBeCloseTo(spec.height, 1);
    expect(asset.geometry.boundingBox!.min.y).toBeCloseTo(-spec.baseOffset, 1);
  });

  it('every registry entry matches its file(s): triangles, footprint, height, base offset', async () => {
    for (const spec of ALL_MODELS) {
      const asset = await lib.load(spec);
      expect(asset.triangles, spec.file).toBe(spec.triangles);
      const footprint = spec === SHIP_MODEL || spec.file === 'spacetruck' ? asset.size.z : Math.max(asset.size.x, asset.size.z);
      expect(footprint, spec.file).toBeCloseTo(spec.footprint, 1);
      expect(asset.size.y, spec.file).toBeCloseTo(spec.height, 1);
      expect(asset.geometry.boundingBox!.min.y, spec.file).toBeCloseTo(-spec.baseOffset, 1);
    }
  });

  it('recentres Kenney models and composites on their footprint with the base at y = 0', async () => {
    for (const spec of ALL_MODELS.filter(isRecentred)) {
      const box = (await lib.load(spec)).geometry.boundingBox!;
      expect(box.min.y, spec.file).toBeCloseTo(0, 5);
      expect((box.min.x + box.max.x) / 2, spec.file).toBeCloseTo(0, 5);
      expect((box.min.z + box.max.z) / 2, spec.file).toBeCloseTo(0, 5);
    }
  });

  it('Kenney models bake material colours into vertices and share one material; KayKit keeps its atlas', async () => {
    const kenney = ALL_MODELS.filter((s) => packOf(s) === 'kenney');
    expect(kenney.length).toBeGreaterThan(20);
    const assets = await Promise.all(kenney.map((s) => lib.load(s)));
    const material = assets[0].material as THREE.MeshStandardMaterial;
    expect(material.vertexColors).toBe(true);
    for (const a of assets) {
      expect(a.material, a.file).toBe(material);
      expect(a.geometry.getAttribute('color'), a.file).toBeDefined();
    }
    // a hangar is several colours, not one
    const hangar = assets.find((a) => a.file === 'hangar_roundB')!;
    const c = hangar.geometry.getAttribute('color');
    const distinct = new Set<string>();
    for (let i = 0; i < c.count; i++) distinct.add(`${c.getX(i).toFixed(2)},${c.getY(i).toFixed(2)},${c.getZ(i).toFixed(2)}`);
    expect(distinct.size).toBeGreaterThanOrEqual(3);

    const kaykit = await lib.load(THEMES.KAYKIT.dressing.FARM[0]);
    expect((kaykit.material as THREE.MeshStandardMaterial).vertexColors).toBe(false);
    expect(kaykit.geometry.getAttribute('uv')).toBeDefined();
  });
});
