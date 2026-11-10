import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { color, terrain } from '@space-game/hud-design-system/core';
import { HexKit } from './hex-kit';
import { cssHex, luma, saturation } from './palette';
import { KENNEY_MATERIALS, TONE, groundTone, objectTone, type DecorBody } from './terrain-tones';

const PUBLIC = join(process.cwd(), 'apps', 'game', 'public');
const fromDisk = async (url: string): Promise<ArrayBuffer> => {
  const b = readFileSync(join(PUBLIC, url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

/** Every material name the KayKit decor and the medieval skin use (objectTone's table). */
const KAYKIT_MATERIALS = ['Stone', 'StoneDark', 'BrownDark', 'WoodDark', 'Brown', 'Beige', 'White', 'Yellow', 'Red', 'GreenDark', 'Green', 'Metal', 'Black', 'Water', 'Unknown'];

const MIXED: DecorBody = { biome: 'mixed', ground: 'grass' };
const MEDIEVAL: DecorBody = { biome: 'medieval', ground: 'grass' };
const WINTER: DecorBody = { biome: 'winter', ground: 'snow' };
const SAND: DecorBody = { biome: 'dry', ground: 'sand' };
const REGOLITH: DecorBody = { biome: 'dry', ground: 'regolith' };

describe('terrain tones and the design system (T-7)', () => {
  it('are the `terrain` token group of the design system, key by key', () => {
    expect(Object.keys(TONE).sort()).toEqual(Object.keys(terrain).sort());
    for (const [k, v] of Object.entries(TONE)) expect(cssHex(v), k).toBe(terrain[k as keyof typeof terrain].toLowerCase());
  });

  it('stay muted and away from the signal and alert colours', () => {
    const signal = parseInt(color.signal.slice(1), 16);
    const alert = parseInt(color.alert.slice(1), 16);
    const dist = (a: number, b: number) => Math.hypot(((a >> 16) & 255) - ((b >> 16) & 255), ((a >> 8) & 255) - ((b >> 8) & 255), (a & 255) - (b & 255));
    for (const [k, v] of Object.entries(TONE)) {
      expect(saturation(v), k).toBeLessThan(0.5);
      expect(dist(v, signal), k).toBeGreaterThan(80);
      expect(dist(v, alert), k).toBeGreaterThan(80);
    }
  });
});

describe('objectTone by biome (T5)', () => {
  it('keeps mixed, medieval and the bodiless call (player skin) on the plain table', () => {
    // (the Kenney models stand only on dry and winter bodies)
    for (const mat of KAYKIT_MATERIALS) {
      expect(objectTone(mat, MIXED), mat).toBe(objectTone(mat));
      expect(objectTone(mat, MEDIEVAL), mat).toBe(objectTone(mat));
    }
    expect(objectTone('GreenDark')).toBe(TONE.forest);
    expect(objectTone('BrownDark')).toBe(TONE.soil);
  });

  it('winter: tree crowns in the ice tone, trunks darker; dry: olive bush crowns, trunks as usual', () => {
    expect(objectTone('GreenDark', WINTER)).toBe(TONE.ice);
    expect(luma(objectTone('BrownDark', WINTER))).toBeLessThan(luma(objectTone('BrownDark')));
    for (const dry of [SAND, REGOLITH]) {
      expect(objectTone('GreenDark', dry)).toBe(TONE.olive);
      expect(objectTone('BrownDark', dry)).toBe(TONE.soil);
    }
    // rocks and mountains stay stone everywhere
    for (const body of [MIXED, WINTER, SAND, REGOLITH]) expect(objectTone('Stone', body)).toBe(TONE.stone);
  });

  it('Kenney materials: boulder stone, base and crater rim in the ground, crater floor one step darker, crystals ice', () => {
    for (const body of [WINTER, SAND, REGOLITH]) {
      expect(objectTone('rockTrack', body)).toBe(TONE.stone);
      expect(objectTone('rock', body)).toBe(groundTone('Green', body.ground));
      expect(luma(objectTone('rockDark', body)), body.ground).toBeLessThan(luma(objectTone('rock', body)));
      expect(objectTone('crystal', body)).toBe(TONE.ice);
    }
  });

  it('every material of the Kenney files is in the Kenney table', async () => {
    const files = readdirSync(join(PUBLIC, 'assets', 'kenney')).filter((f) => f.endsWith('.glb'));
    expect(files.length).toBeGreaterThan(0);
    const kit = new HexKit('assets/', fromDisk);
    const mats = new Set<string>();
    for (const f of files) for (const p of (await kit.load(`kenney:${f.slice(0, -4)}`)).parts) mats.add(p.mat);
    for (const m of mats) expect(KENNEY_MATERIALS, m).toContain(m);
  });
});
