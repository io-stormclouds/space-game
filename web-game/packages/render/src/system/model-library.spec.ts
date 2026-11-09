import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { ModelLibrary, colorFromAtlas, packGlb, stripTextures, type GltfJson } from './model-library';
import { ALL_MODEL_IDS, MODELS, type ModelId } from './model-registry';
import { MODEL_TONES } from './palette';

const PUBLIC = join(process.cwd(), 'apps', 'game', 'public');

/** Reads the served files from disk: the same GLB-packing path as in the browser, without fetch. */
async function fromDisk(url: string): Promise<ArrayBuffer> {
  const b = readFileSync(join(PUBLIC, url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

function gltfJson(file: ModelId): GltfJson {
  return JSON.parse(readFileSync(join(PUBLIC, 'assets', 'kaykit', `${file}.gltf`), 'utf-8')) as GltfJson;
}

const VEHICLES = new Set<ModelId>(['dropship', 'spacetruck']);

describe('ModelLibrary (KayKit flattening, PoC model-library.spec)', () => {
  const lib = new ModelLibrary('assets/', fromDisk);
  afterAll(() => lib.dispose());

  it('strips images, textures and the base colour texture, keeping everything else', () => {
    const json = stripTextures(gltfJson('dropship'));
    expect(json.images).toBeUndefined();
    expect(json.textures).toBeUndefined();
    expect(json.materials?.[0]?.pbrMetallicRoughness?.baseColorTexture).toBeUndefined();
    expect((json as { meshes?: unknown[] }).meshes).toHaveLength(3);
    // the source object is not mutated
    expect(gltfJson('dropship').images).toHaveLength(1);
  });

  it('packs glTF + buffers into a GLB whose views point into one BIN chunk', () => {
    const json: GltfJson = { asset: { version: '2.0' }, buffers: [{ uri: 'a.bin', byteLength: 3 }, { uri: 'b.bin', byteLength: 4 }], bufferViews: [{ buffer: 1, byteOffset: 2 }] };
    const glb = packGlb(json, [new Uint8Array([1, 2, 3]).buffer, new Uint8Array([4, 5, 6, 7]).buffer]);
    const view = new DataView(glb);
    expect(view.getUint32(0, true)).toBe(0x46546c67);
    expect(view.getUint32(8, true)).toBe(glb.byteLength);
    const jsonLength = view.getUint32(12, true);
    const packed = JSON.parse(new TextDecoder().decode(new Uint8Array(glb, 20, jsonLength))) as GltfJson;
    expect(packed.buffers).toEqual([{ byteLength: 8 }]); // 3 padded to 4, + 4
    expect(packed.bufferViews).toEqual([{ buffer: 0, byteOffset: 6 }]);
    const bin = new Uint8Array(glb, 20 + jsonLength + 8, 8);
    expect([...bin]).toEqual([1, 2, 3, 0, 4, 5, 6, 7]);
  });

  it('flattens the dropship (3 meshes, door nodes translated) into one geometry with position, normal, color', async () => {
    const asset = (await lib.load('dropship'))!;
    expect(asset.triangles).toBe(914);
    expect(asset.size.z).toBeCloseTo(MODELS.dropship.footprint, 1);
    expect(asset.size.x).toBeCloseTo(3.0, 1); // doors stick out sideways
    expect(Object.keys(asset.geometry.attributes).sort()).toEqual(['color', 'normal', 'position']);
    expect(lib.get('dropship')).toBe(asset);
    expect(await lib.load('dropship')).toBe(asset); // cached
  });

  it('every registry entry matches its file: triangles, footprint, height, base offset', async () => {
    for (const id of ALL_MODEL_IDS) {
      const spec = MODELS[id];
      const asset = (await lib.load(id))!;
      expect(asset, id).not.toBeNull();
      expect(asset.triangles, id).toBe(spec.triangles);
      const footprint = VEHICLES.has(id) ? asset.size.z : Math.max(asset.size.x, asset.size.z);
      expect(footprint, id).toBeCloseTo(spec.footprint, 1);
      expect(asset.size.y, id).toBeCloseTo(spec.height, 1);
      expect(asset.box.min.y, id).toBeCloseTo(-spec.baseOffset, 1);
    }
  });

  it('every model shares the one Space Base Bits atlas (its UVs drive the recolouring)', () => {
    for (const id of ALL_MODEL_IDS) {
      const images = (gltfJson(id).images ?? []) as Array<{ uri?: string }>;
      expect(images.map((i) => i.uri), id).toEqual(['spacebits_texture.png']);
    }
  });

  it('recolours vertices of every model only with palette tones times the swatch shade', async () => {
    const c = new THREE.Color();
    const tones = Object.values(MODEL_TONES).map((h) => new THREE.Color(h));
    for (const id of ALL_MODEL_IDS) {
      const asset = (await lib.load(id))!;
      expect(Object.keys(asset.geometry.attributes).sort(), id).toEqual(['color', 'normal', 'position']);
      const color = asset.geometry.getAttribute('color');
      for (let i = 0; i < color.count; i += 7) {
        c.setRGB(color.getX(i), color.getY(i), color.getZ(i));
        const ok = tones.some((t) => {
          const k = t.g > 0 ? c.g / t.g : 1;
          return k >= 0.79 && k <= 1.16 && Math.abs(t.r * k - c.r) < 1e-4 && Math.abs(t.b * k - c.b) < 1e-4;
        });
        expect(ok, `${id} vertex ${i}`).toBe(true);
      }
    }
  });

  it('builds feature edges once per model', async () => {
    await lib.load('landingpad_small');
    const e = lib.edgesOf('landingpad_small')!;
    expect(e.getAttribute('position').count).toBeGreaterThan(100);
    expect(lib.edgesOf('landingpad_small')).toBe(e);
  });

  it('colours a geometry without uv as the first swatch instead of failing', () => {
    const g = new THREE.BoxGeometry(1, 1, 1);
    g.deleteAttribute('uv');
    colorFromAtlas(g);
    expect(g.getAttribute('color').count).toBe(g.getAttribute('position').count);
    g.dispose();
  });

  it('disposes every geometry it made, also loads that finish after dispose', async () => {
    const own = new ModelLibrary('assets/', fromDisk);
    const asset = (await own.load('rock_A'))!;
    const edges = own.edgesOf('rock_A')!;
    let disposed = 0;
    asset.geometry.addEventListener('dispose', () => disposed++);
    edges.addEventListener('dispose', () => disposed++);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const late = new ModelLibrary('assets/', async (url) => {
      await gate;
      return fromDisk(url);
    });
    const pending = late.load('rock_B');
    own.dispose();
    late.dispose();
    release();
    expect(await pending).toBeNull();
    expect(disposed).toBe(2);
    expect(own.get('rock_A')).toBeUndefined();
    expect(late.get('rock_B')).toBeUndefined();
  });

  it('a missing file resolves to null (the placeholder stays)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const broken = new ModelLibrary('assets/', () => Promise.reject(new Error('404')));
    expect(await broken.load('dropship')).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    broken.dispose();
  });
});
