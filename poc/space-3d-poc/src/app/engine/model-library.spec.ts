import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ModelLibrary } from './model-library';
import { ALL_MODELS, SHIP_MODEL, STRUCTURE_MODELS } from './model-registry';

const ASSETS = join(process.cwd(), 'public', 'assets', 'kaykit');

/**
 * Loads a glTF from disk with its .bin embedded as a data URI and textures stripped,
 * so GLTFLoader.parse works in jsdom without network or image decoding.
 */
function gltfForTest(file: string): string {
  const json = JSON.parse(readFileSync(join(ASSETS, `${file}.gltf`), 'utf-8'));
  for (const buffer of json.buffers) {
    const bin = readFileSync(join(ASSETS, buffer.uri));
    buffer.uri = `data:application/octet-stream;base64,${bin.toString('base64')}`;
  }
  delete json.images;
  delete json.textures;
  for (const m of json.materials ?? []) delete m.pbrMetallicRoughness?.baseColorTexture;
  return JSON.stringify(json);
}

describe('ModelLibrary', () => {
  const lib = new ModelLibrary();

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

  it('every registry entry matches its file: triangles, footprint, height, base offset', async () => {
    for (const spec of ALL_MODELS) {
      const asset = await lib.parse(spec.file, gltfForTest(spec.file));
      expect(asset.triangles, spec.file).toBe(spec.triangles);
      const footprint = spec === SHIP_MODEL || spec.file === 'spacetruck' ? asset.size.z : Math.max(asset.size.x, asset.size.z);
      expect(footprint, spec.file).toBeCloseTo(spec.footprint, 1);
      expect(asset.size.y, spec.file).toBeCloseTo(spec.height, 1);
      expect(asset.geometry.boundingBox!.min.y, spec.file).toBeCloseTo(-spec.baseOffset, 1);
    }
  });
});
