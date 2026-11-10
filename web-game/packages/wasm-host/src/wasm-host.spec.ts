import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BodyId, BuildPreview, GameSnapshot, Request, ReplyValue, SaveFile, TileInfo, WorkerMessage } from '@space-game/api';
import { ServerHost } from '@space-game/mock-server';
import { createWasmHost, type WasmHost } from './wasm-host';
import { createInThreadWasmGameApi } from './in-thread';

// Plan 02 B3: the Rust session behind GameApi answers like the TypeScript mock. Both get the same
// requests; replies are compared field by field (numbers with tolerance 1e-9, as the conformance
// tool). Needs the module from `npm run wasm:build`; skipped without it.

const here = dirname(fileURLToPath(import.meta.url));
const WASM = resolve(here, '../../../apps/game/public/wasm/game_wasm.wasm');
const REPLAYS = resolve(here, '../../../../server/conformance/replays');
const have = existsSync(WASM);

/** Differences between two JSON values (paths), ignoring the step timing statistics. */
function diff(a: unknown, b: unknown, path = '', out: string[] = []): string[] {
  if (out.length > 20) return out;
  if (typeof a === 'number' && typeof b === 'number') {
    const tol = 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
    if (!(Math.abs(a - b) <= tol) && !(Number.isNaN(a) && Number.isNaN(b))) out.push(`${path}: ${a} vs ${b}`);
    return out;
  }
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    if (a !== b) out.push(`${path}: ${JSON.stringify(a)?.slice(0, 80)} vs ${JSON.stringify(b)?.slice(0, 80)}`);
    return out;
  }
  if (Array.isArray(a) !== Array.isArray(b)) {
    out.push(`${path}: array vs object`);
    return out;
  }
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  for (const k of new Set([...ka, ...kb])) {
    if (k === 'stats') continue;
    diff((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`, out);
  }
  return out;
}

class Pair {
  private id = 1;
  private readonly tsOut: WorkerMessage[] = [];
  readonly ts = new ServerHost((m) => this.tsOut.push(structuredClone(m)));
  constructor(readonly wasm: WasmHost) {}

  /** Sends one request to both; returns both replies' values. */
  ask(request: Request): { ts: ReplyValue | string; rs: ReplyValue | string } {
    const id = this.id++;
    this.tsOut.length = 0;
    this.ts.handle({ id, request });
    const rsOut = this.wasm.handle({ id, request }, 0);
    const pick = (msgs: WorkerMessage[]) => {
      const r = msgs.find((m) => m.type === 'reply' && m.id === id);
      if (!r || r.type !== 'reply') throw new Error('no reply');
      return r.ok ? r.value : `error: ${r.error}`;
    };
    // the same pushes in the same order (events, snapshot)
    expect(rsOut.map((m) => m.type)).toEqual(this.tsOut.map((m) => m.type));
    return { ts: JSON.parse(JSON.stringify(pick(this.tsOut))), rs: pick(rsOut) };
  }

  same(request: Request): ReplyValue | string {
    const { ts, rs } = this.ask(request);
    expect(diff(ts, rs), request.kind).toEqual([]);
    return rs;
  }
}

describe.skipIf(!have)('GameApi on WebAssembly answers like the TS mock (B3)', () => {
  let module: WebAssembly.Module;
  beforeAll(async () => {
    module = await WebAssembly.compile(readFileSync(WASM));
  });
  const pair = async () => new Pair(await createWasmHost(module, () => 0));

  it.each(['tau-ceti', 'planeta-matka', 'fabryka', 'load-s', 'load-m', 'load-l'] as const)('start %s: same snapshot', async (scenarioId) => {
    const p = await pair();
    p.same({ kind: 'start', scenarioId });
  });

  it('catalog, economy report and queries on the start world', async () => {
    const p = await pair();
    p.same({ kind: 'start', scenarioId: 'planeta-matka' });
    p.same({ kind: 'catalog' });
    p.same({ kind: 'economyReport' });
    p.same({ kind: 'economyReport', economy: { ...(p.ask({ kind: 'economyReport' }).ts as { params: object }).params, energyPrice: 3.5, costGrowth: 1.9 } as never });
    const snap = p.same({ kind: 'snapshot' }) as GameSnapshot;
    const home = snap.world.bodies.find((b) => b.isHomeBase)!.id;
    p.same({ kind: 'availability', bodyId: home, kinds: ['MIN', 'SOL', 'HUT', 'MIN@2', 'XXX'] });
    p.same({ kind: 'nominalFlows', bodyId: home });
    for (const tileIndex of [0, 5, 17, 100, 300, 641, 9999]) {
      p.same({ kind: 'tileInfo', bodyId: home, tileIndex });
      for (const buildingKind of ['MIN', 'SOL', 'PORT', 'MAG'])
        for (const rotation of [0, 1, 3]) p.same({ kind: 'previewBuild', bodyId: home, tileIndex, buildingKind, rotation });
    }
    for (const buildingKind of ['MIN', 'SOL', 'MAG', 'HUT'])
      for (const material of [undefined, 'FER', 'KRI']) p.same({ kind: 'suggestTile', bodyId: home, buildingKind, ...(material ? { material } : {}) });
  });

  // T8: terrain of Tau Ceti c (dried lake beds refused since T5, forest, rock, snow and roads priced) in
  // the tile panel, the placement ghost (cost and build time after the terrain) and the suggestions
  it('terrain on Tau Ceti c: tile info, placement ghosts and suggestions', async () => {
    const p = await pair();
    const body = 'tc-c' as BodyId;
    const tileInfoAll = (): TileInfo[] => {
      const out: TileInfo[] = [];
      for (let tileIndex = 0; ; tileIndex++) {
        const info = p.same({ kind: 'tileInfo', bodyId: body, tileIndex }) as TileInfo | null;
        if (!info) return out;
        out.push(info);
      }
    };
    /** Two tiles of each terrain class (a road counts apart from its grass), in tile order. */
    const sample = (tiles: TileInfo[]): number[] => {
      const key = (t: TileInfo) => (t.terrain?.road ? 'road' : (t.terrain?.kind ?? 'none'));
      const picked = new Map<string, number[]>();
      for (const t of tiles) {
        const list = picked.get(key(t)) ?? [];
        if (list.length < 2) picked.set(key(t), [...list, t.index]);
      }
      for (const k of ['dune', 'forest', 'rock', 'road']) expect(picked.get(k)?.length, `tc-c has ${k}`).toBe(2);
      return [...picked.values()].flat();
    };
    const ghosts = (tiles: number[]) => {
      const out: Array<BuildPreview & { kind: string }> = [];
      for (const tileIndex of tiles)
        for (const buildingKind of ['SOL', 'HAB', 'SMT', 'PORT'])
          for (const rotation of [0, 1, 3])
            out.push({ ...(p.same({ kind: 'previewBuild', bodyId: body, tileIndex, buildingKind, rotation }) as BuildPreview), kind: buildingKind });
      expect(out.some((g) => g.reason === 'BAD_TERRAIN' && g.cost === undefined)).toBe(true);
      return out;
    };
    const priced = (g: BuildPreview) => g.cost !== undefined && g.buildTime !== undefined;
    const suggest = () => {
      for (const buildingKind of ['SOL', 'HAB', 'SMT', 'PORT'])
        for (const material of [undefined, 'FER']) p.same({ kind: 'suggestTile', bodyId: body, buildingKind, ...(material ? { material } : {}) });
    };

    // the start world: no colony (NO_ROVER and NO_COLONY_SITE, priced past the terrain stage)
    p.same({ kind: 'start', scenarioId: 'tau-ceti' });
    p.same({ kind: 'pause' });
    const start = tileInfoAll();
    expect(start.length).toBe(252);
    expect(start.every((t) => t.terrain !== null)).toBe(true);
    const tiles = sample(start);
    expect(ghosts(tiles).some((g) => g.reason === 'NO_ROVER' && priced(g))).toBe(true);

    // the Ark on the orbit of tc-c with the site chosen: the port ghost on dunes, roads, forest, rock
    p.same({ kind: 'command', command: { type: 'SCAN_SYSTEM', shipId: 'arka-1' } as never });
    p.same({ kind: 'stepOnce', steps: 1000 });
    p.same({ kind: 'command', command: { type: 'CHOOSE_COLONY_SITE', bodyId: body } as never });
    p.same({ kind: 'command', command: { type: 'MOVE_SHIP', shipId: 'arka-1', to: body } as never });
    const docked = p.same({ kind: 'stepOnce', steps: 600 }) as GameSnapshot;
    expect(docked.world.ships[0]!.state).toBe('DOCKED');
    expect(docked.world.ships[0]!.currentBodyId).toBe(body);
    expect(ghosts(tiles).some((g) => g.kind === 'PORT' && g.ok && priced(g))).toBe(true);
    suggest();

    // the colony of the `teren` replay: port on the road, a panel, a habitat on rock
    const file = JSON.parse(readFileSync(join(REPLAYS, 'teren', 'save.json'), 'utf8')) as SaveFile;
    p.same({ kind: 'replay', file });
    tileInfoAll();
    expect(ghosts(tiles).some((g) => g.kind === 'SOL' && g.ok && priced(g))).toBe(true);
    suggest();
  }, 120_000);

  // T5: the biomes of the other bodies (sand and dunes, regolith, ice and snow, the start planet's lakes
  // and landing cap, the PoC moon) in the tile panel and the placement ghosts
  it('biomes of every body: tile info and placement ghosts', async () => {
    const p = await pair();
    const seen = new Set<string>();
    const sweep = (bodyId: BodyId) => {
      const firstOf = new Map<string, number>();
      for (let tileIndex = 0; ; tileIndex++) {
        const info = p.same({ kind: 'tileInfo', bodyId, tileIndex }) as TileInfo | null;
        if (!info) break;
        const kind = info.terrain?.kind ?? 'none';
        seen.add(kind);
        if (!firstOf.has(kind)) firstOf.set(kind, tileIndex);
      }
      for (const tileIndex of firstOf.values())
        for (const buildingKind of ['SOL', 'PORT']) p.same({ kind: 'previewBuild', bodyId, tileIndex, buildingKind, rotation: 0 });
    };
    p.same({ kind: 'start', scenarioId: 'tau-ceti' });
    p.same({ kind: 'pause' });
    for (const body of ['tc-b', 'tc-d', 'tc-e', 'tc-f']) sweep(body as BodyId);
    p.same({ kind: 'start', scenarioId: 'planeta-matka' });
    p.same({ kind: 'pause' });
    sweep('moon' as BodyId);
    for (const k of ['sand', 'dune', 'regolith', 'ice', 'snow', 'forest', 'rock', 'water', 'grass']) expect(seen.has(k), `a body has ${k}`).toBe(true);
    expect(seen.has('none')).toBe(false);
  }, 120_000);

  it('tempo, pause, steps, commands and rejections', async () => {
    const p = await pair();
    p.same({ kind: 'start', scenarioId: 'tau-ceti' });
    p.same({ kind: 'pause' });
    p.same({ kind: 'setTempo', tempo: 600 });
    p.same({ kind: 'stepOnce', steps: 120 });
    p.same({ kind: 'command', command: { type: 'SCAN_SYSTEM', shipId: 'arka-1' } as never });
    p.same({ kind: 'command', command: { type: 'MOVE_SHIP', shipId: 'nope', to: 'x' } as never });
    p.same({ kind: 'stepOnce', steps: 2000 });
    p.same({ kind: 'setTempo', tempo: -1 });
    p.same({ kind: 'save' });
  });

  const replays = existsSync(REPLAYS) ? readdirSync(REPLAYS).filter((d) => existsSync(join(REPLAYS, d, 'save.json'))) : [];
  it.each(replays)('replay %s: same world, events and rejections; load continues it', async (name) => {
    const file = JSON.parse(readFileSync(join(REPLAYS, name, 'save.json'), 'utf8')) as SaveFile;
    const p = await pair();
    p.same({ kind: 'replay', file });
    p.same({ kind: 'stepOnce', steps: 300 });
    p.same({ kind: 'load', file });
    p.same({ kind: 'stepOnce', steps: 300 });
    const saved = p.same({ kind: 'save' }) as SaveFile;
    expect(saved.commands.length).toBe(file.commands.length);
  }, 120_000);

  it('runs as a GameApi with a loop (in-thread worker)', async () => {
    const { api, tick } = createInThreadWasmGameApi(await createWasmHost(module, () => 0));
    const frames: number[] = [];
    api.onFrame((f) => frames.push(f.time));
    const s = await api.start('tau-ceti');
    expect(s.step).toBe(0);
    for (let t = 0; t <= 1000; t += 16) tick(t);
    await new Promise((r) => setTimeout(r, 0));
    const after = await api.snapshot();
    expect(after.step).toBeGreaterThan(50);
    expect(frames.at(-1)).toBeGreaterThan(0);
    await expect(api.load({ format: 'nope' } as never)).rejects.toThrow('not a space-game save file');
  });
});
