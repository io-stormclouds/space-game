import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  connectOnFirstRequest,
  createWorkerGameApi,
  NO_TRADE,
  type ConnectMessage,
  type GalaxyView,
  type RequestMessage,
  type SaveFile,
  type WorkerMessage,
} from '@space-game/api';
import { createReplica, type SocketLike } from './replica';
import { createWasmHost } from './wasm-host';

// Plan 02 B4: the replica of a server world. A fake socket plays the server: welcome, the checkpoint,
// sync messages and replies. The replica answers queries itself, forwards what changes the game,
// runs the commands and steps it is told, and asks for a new checkpoint when a hash differs.

const here = dirname(fileURLToPath(import.meta.url));
const WASM = resolve(here, '../../../apps/game/public/wasm/game_wasm.wasm');

class FakeServer implements SocketLike {
  sent: Array<Record<string, unknown>> = [];
  private readonly l: Record<string, Array<(e: { data: unknown }) => void>> = {};
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.emit('close');
  }
  addEventListener(type: string, listener: (e: { data: unknown }) => void) {
    (this.l[type] ??= []).push(listener);
  }
  emit(type: string, data?: unknown) {
    for (const f of this.l[type] ?? []) f({ data: data === undefined ? undefined : JSON.stringify(data) });
  }
  requests(kind: string) {
    return this.sent.filter((m) => (m['request'] as { kind?: string } | undefined)?.kind === kind) as unknown as RequestMessage[];
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe.skipIf(!existsSync(WASM))('replica of a server world (B4)', () => {
  let module: WebAssembly.Module;
  let start: SaveFile;
  beforeAll(async () => {
    module = await WebAssembly.compile(readFileSync(WASM));
    // the server's world at step 0 (a fresh start has no step state yet)
    const origin = await createWasmHost(module, () => 0);
    origin.handle({ id: 1, request: { kind: 'start', scenarioId: 'tau-ceti' } }, 0);
    const saved = origin.handle({ id: 2, request: { kind: 'save' } }, 0).find((m) => m.type === 'reply');
    start = (saved as { value: SaveFile }).value;
  });

  async function setup() {
    const servers: FakeServer[] = [];
    const server = new FakeServer();
    const listeners = new Set<(e: MessageEvent<WorkerMessage>) => void>();
    const pushed: WorkerMessage[] = [];
    const replica = createReplica({
      host: createWasmHost(module, () => 0),
      connect: () => {
        const s = servers.length === 0 ? server : new FakeServer();
        servers.push(s);
        return s;
      },
      retryMs: 1,
      credentials: { callsign: 'Kestrel', password: 'tajne-haslo' },
      post: (m) => {
        pushed.push(m);
        listeners.forEach((l) => l({ data: m } as MessageEvent<WorkerMessage>));
      },
      now: () => 0,
    });
    const connects: ConnectMessage[] = [];
    const worker = connectOnFirstRequest(
      {
        postMessage: (m) => ('type' in m ? connects.push(m) : replica.request(m)),
        addEventListener: (_t, l) => listeners.add(l),
        removeEventListener: (_t, l) => listeners.delete(l),
        terminate: () => replica.close(),
      },
      () => ({ type: 'connect', url: 'ws://test/ws', credentials: { callsign: 'Kestrel', password: 'x' } }),
    );
    const api = createWorkerGameApi(worker);
    return { server, servers, replica, api, pushed, connects };
  }

  const checkpoint = (save: SaveFile) => ({ save, sim: { drives: [], mining: [], extraction: 0 } });

  it('logs in, waits for the checkpoint, answers queries itself and forwards commands', async () => {
    const { server, replica, api, pushed, connects } = await setup();
    server.emit('open');
    expect(server.sent[0]).toEqual({ type: 'hello', protocolVersion: 3, callsign: 'Kestrel', password: 'tajne-haslo' });

    const catalog = api.catalog();
    expect(connects).toHaveLength(1);
    server.emit('message', { type: 'welcome', protocolVersion: 3, accountId: 'acc-1', callsign: 'Kestrel', worldId: 'acc-1', devMode: true, stepSeconds: 1 / 60, serverTime: 0 });
    await flush(); // the module loads
    server.emit('message', { type: 'reset', checkpoint: checkpoint(start), paused: false });
    expect((await catalog).buildings.length).toBeGreaterThan(5);
    expect(server.sent).toHaveLength(1); // the catalog did not travel
    await expect(replica.welcome).resolves.toMatchObject({ worldId: 'acc-1' });

    const events: unknown[] = [];
    api.onEvents((e) => events.push(...e));
    const scan = { type: 'SCAN_SYSTEM', shipId: 'arka-1' } as const;
    const result = api.command(scan as never);
    const [sent] = server.requests('command');
    expect(sent!.request).toEqual({ kind: 'command', command: scan });
    // the server's changes come before its reply: the command at step 0, then 30 steps
    server.emit('message', { type: 'sync', step: 30, commands: [{ step: 0, command: scan }] });
    expect(events.length).toBeGreaterThan(0);
    const before = pushed.length;
    server.emit('message', { type: 'reply', id: sent!.id, ok: true, value: { ok: true, events: [] } });
    await expect(result).resolves.toEqual({ ok: true, events: [] });
    // as the mock: the reply, then a snapshot with the change
    expect(pushed.slice(before).map((m) => m.type)).toEqual(['reply', 'snapshot']);

    const save = await api.save();
    expect(save.step).toBe(30);
    expect(save.commands).toEqual([{ step: 0, command: scan }]);
    replica.tick();
    const snap = pushed.filter((m) => m.type === 'snapshot').at(-1);
    expect(snap && snap.type === 'snapshot' && snap.snapshot.step).toBe(30);
    expect(pushed.some((m) => m.type === 'frame')).toBe(true);
  });

  it('a differing hash or a gap asks for a new checkpoint; a refused login fails the requests', async () => {
    const { server, replica, api } = await setup();
    server.emit('open');
    const first = api.snapshot();
    await flush();
    server.emit('message', { type: 'reset', checkpoint: checkpoint(start), paused: true });
    expect((await first).paused).toBe(true);

    server.emit('message', { type: 'sync', step: 5 });
    server.emit('message', { type: 'hash', step: 5, hash: '0000000000000000' });
    expect(server.sent.filter((m) => m['type'] === 'resync')).toHaveLength(1);
    expect(replica.resyncs).toBe(1);
    server.emit('message', { type: 'sync', step: 3 }); // stale until the new checkpoint: ignored, no second resync
    expect(server.sent.filter((m) => m['type'] === 'resync')).toHaveLength(1);
    server.emit('message', { type: 'reset', checkpoint: checkpoint(start), paused: false });
    server.emit('message', { type: 'sync', step: 2 }); // back to step 0, now steps again
    expect((await api.save()).step).toBe(2);
    server.emit('message', { type: 'sync', step: 1 }); // a step back is a gap: resync
    expect(replica.resyncs).toBe(2);

    const pending = api.command({ type: 'SCAN_SYSTEM', shipId: 'arka-1' } as never);
    server.emit('message', { type: 'error', error: 'błędny kod dostępu' });
    await expect(pending).rejects.toThrow('błędny kod dostępu');
    await expect(api.catalog()).rejects.toThrow('błędny kod dostępu');
    server.emit('close');
    await new Promise((r) => setTimeout(r, 20));
    expect(replica.reconnects).toBe(0); // a refused login is not retried
  });

  it('reconnects after a lost connection: in-flight requests fail, queries go on, new requests wait for the checkpoint', async () => {
    const { server, servers, replica, api } = await setup();
    server.emit('open');
    await flush();
    server.emit('message', { type: 'reset', checkpoint: checkpoint(start), paused: true });
    server.emit('message', { type: 'sync', step: 4 });
    const inFlight = api.command({ type: 'SCAN_SYSTEM', shipId: 'arka-1' } as never);
    server.emit('close');
    await expect(inFlight).rejects.toThrow('połączenie z serwerem gry zamknięte');

    expect((await api.save()).step).toBe(4); // answered from the last state
    const later = api.command({ type: 'SCAN_SYSTEM', shipId: 'arka-1' } as never);
    await new Promise((r) => setTimeout(r, 10));
    expect(replica.reconnects).toBe(1);
    const again = servers[1]!;
    again.emit('open');
    expect(again.sent[0]).toMatchObject({ type: 'hello' });
    expect(again.requests('command')).toHaveLength(0); // waits for the checkpoint
    const moved = { ...start, step: 9 };
    again.emit('message', { type: 'reset', checkpoint: checkpoint(moved), paused: true });
    const [sent] = again.requests('command');
    again.emit('message', { type: 'sync', step: 9, commands: [{ step: 9, command: sent!.request.kind === 'command' && sent!.request.command }] });
    again.emit('message', { type: 'reply', id: sent!.id, ok: true, value: { ok: true, events: [] } });
    await expect(later).resolves.toMatchObject({ ok: true });
    expect((await api.save()).commands).toHaveLength(1);
  });

  it("goes to the galaxy service for the market and shows the service's hubs and players (protocol 3)", async () => {
    const { server, api, pushed } = await setup();
    server.emit('open');
    const first = api.snapshot();
    await flush();
    // a server world keeps no galaxy of its own (`meta.galaxy: null`): the replica neither
    server.emit('message', { type: 'reset', checkpoint: checkpoint({ ...start, meta: { galaxy: null } }), paused: true });
    expect((await first).hubs).toEqual([]);

    const views: GalaxyView[] = [];
    api.onGalaxy((v) => views.push(v));
    const view: GalaxyView = {
      account: 'acc-1',
      credits: 1000,
      fee: 0.02,
      npc: true,
      hubs: [
        {
          id: 'hub-sirius',
          name: 'Syriusz',
          star: 'Sirius A',
          quotes: [],
          faction: 'Konsorcjum Orion',
          distanceLy: 17.4,
          travelSeconds: 100,
          stock: {},
          book: [],
          reputation: 0,
          tariff: 0.05,
        },
      ],
      orders: [],
      shipments: [],
      trades: [],
      players: [{ id: 'npc-1', name: 'Dowódca Ares', corporation: 'Unia Lagrange', homeStar: 'Procyon A', colonies: 2, score: 900, npc: true }],
      contracts: [],
      corporation: null,
      invitations: [],
      corporations: [],
      time: 0,
    };
    server.emit('message', { type: 'galaxy', view });
    expect(views).toEqual([view]);
    const snap = pushed.filter((m) => m.type === 'snapshot').at(-1);
    expect(snap?.type === 'snapshot' && snap.snapshot.hubs.map((h) => h.id)).toEqual(['hub-sirius']);
    expect((await api.snapshot()).players.map((p) => p.name)).toEqual(['Dowódca Ares']);

    const order = api.galaxy({ op: 'placeOrder', hubId: 'hub-sirius', material: 'FER', side: 'sell', quantity: 5, price: 9 });
    const wire = server.sent.at(-1)!;
    expect(wire).toEqual({ id: expect.any(Number), galaxy: { op: 'placeOrder', hubId: 'hub-sirius', material: 'FER', side: 'sell', quantity: 5, price: 9 } });
    const before = pushed.length;
    server.emit('message', { type: 'reply', id: wire['id'], ok: true, value: { order: { id: 'order-1', remaining: 5 }, trades: [] } });
    await expect(order).resolves.toMatchObject({ trades: [] });
    expect(pushed.slice(before).map((m) => m.type)).toEqual(['reply']); // the market's changes come as a view

    // a world alone (mock, offline WASM) has no market
    const alone = await createWasmHost(module, () => 0);
    const reply = alone.handle({ id: 9, request: { kind: 'galaxy', op: { op: 'view' } } }, 0).find((m) => m.type === 'reply');
    expect(reply).toEqual({ type: 'reply', id: 9, ok: false, error: NO_TRADE });
  });
});
