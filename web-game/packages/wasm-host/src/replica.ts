import {
  AccountError,
  REMOTE_PROTOCOL_VERSION,
  wsTicket,
  type GalaxyView,
  type GameSnapshot,
  type RemoteCredentials,
  type Request,
  type RequestMessage,
  type Welcome,
  type WorkerMessage,
} from '@space-game/api';
import type { WasmHost } from './wasm-host';

// Replica of the player's world on the game server (plan 02 §6, B4). The Rust game session in
// WebAssembly holds a copy of the world: the server sends it once (reset: a checkpoint), then only
// what changed (sync: commands and tempo changes at their steps, the step reached) and a state hash
// every 5 s. The simulation is deterministic, so the copy stays equal; a failed step or another
// hash asks the server for a new checkpoint (resync).
//
// Towards the UI this is the worker of the mock: queries are answered by the replica at once (no
// round trip for the placement ghost), requests that change the game go to the server, and the
// replica makes the events, frames and snapshots. A lost connection is retried with backoff; the
// requests in flight fail (they may or may not have reached the world), new ones wait for the next
// checkpoint, queries keep being answered from the last state. A refused login ends it.
// The galaxy (protocol 3): `galaxy` requests go to the server's galaxy service; its pushed view goes
// to the UI and fills the snapshots' hubs and players (server worlds have none of their own).
// Login (R-25): a one-time ticket of the session cookie in every hello (the HTTP API of account.ts),
// or a callsign and a password where the server allows it (tools, tests).
// Platform-free: the worker entry (replica-worker.ts) passes the WebSocket, the module, `postMessage`.

/** Requests answered by the replica (they do not change the game). */
const LOCAL = new Set<Request['kind']>(['snapshot', 'save', 'catalog', 'availability', 'previewBuild', 'suggestTile', 'tileInfo', 'economyReport', 'nominalFlows']);

/** The part of a WebSocket the replica needs (tests pass a fake). */
export interface SocketLike {
  send(data: string): void;
  close(): void;
  addEventListener(type: 'open' | 'close' | 'error', listener: () => void): void;
  addEventListener(type: 'message', listener: (e: { data: unknown }) => void): void;
}

export interface ReplicaOptions {
  /** The game session module (may still be loading). */
  host: WasmHost | Promise<WasmHost>;
  /** Opens a new connection (called again to reconnect). */
  connect: () => SocketLike;
  credentials: RemoteCredentials;
  /** A one-time ticket of the session (`{ session }` credentials). Default: `wsTicket` of the api package. */
  ticket?: (session: string, guest: boolean) => Promise<string>;
  /** To the UI thread. */
  post: (m: WorkerMessage) => void;
  now?: () => number;
  /** First reconnect delay [ms] (doubles each attempt, up to 10×). Default 1000. */
  retryMs?: number;
  /** Reconnect attempts without a checkpoint in between before giving up. Default 8. */
  maxRetries?: number;
}

export interface Replica {
  /** A request of the UI. */
  request(m: RequestMessage): void;
  /** Loop tick (~16 ms): the replica's frame and snapshot when they changed. */
  tick(): void;
  /** Resolves on the first welcome. */
  readonly welcome: Promise<Welcome>;
  /** Times the replica asked the server for a new checkpoint. */
  readonly resyncs: number;
  /** Times the connection was opened again. */
  readonly reconnects: number;
  close(): void;
}

const TYPE = /^\{"type":"(\w+)"/;

export function createReplica(opts: ReplicaOptions): Replica {
  const now = opts.now ?? (() => Date.now());
  const retryMs = opts.retryMs ?? 1000;
  const maxRetries = opts.maxRetries ?? 8;
  let host: WasmHost | null = null;
  let socket: SocketLike;
  let ready = false; // a checkpoint is applied on this connection
  let everReady = false; // the replica holds a world (answers queries even while reconnecting)
  let final: string | null = null; // no more connections: every request fails with this
  let awaitingReset = false;
  let resyncs = 0;
  let reconnects = 0;
  let retries = 0;
  const inbox: string[] = []; // server messages that came before the module
  const waiting: RequestMessage[] = []; // UI requests until the next checkpoint
  const forwarded = new Set<number>();
  const galaxyRequests = new Set<number>(); // forwarded to the galaxy service
  let galaxy: GalaxyView | null = null;
  let resolveWelcome!: (w: Welcome) => void;
  let rejectWelcome!: (e: Error) => void;
  const welcome = new Promise<Welcome>((res, rej) => ((resolveWelcome = res), (rejectWelcome = rej)));
  welcome.catch(() => undefined);

  /** A snapshot (pushed, or a reply's value) shows the galaxy service's hubs and players. */
  const withGalaxy = (m: WorkerMessage): WorkerMessage => {
    if (!galaxy) return m;
    const g = { hubs: galaxy.hubs, players: galaxy.players };
    if (m.type === 'snapshot') return { ...m, snapshot: { ...m.snapshot, ...g } };
    if (m.type === 'reply' && m.ok && m.value && typeof m.value === 'object' && 'hubs' in m.value && 'players' in m.value) {
      return { ...m, value: { ...(m.value as GameSnapshot), ...g } };
    }
    return m;
  };
  const post = (messages: WorkerMessage[]) => messages.forEach((m) => opts.post(withGalaxy(m)));
  const fail = (id: number, error: string) => opts.post({ type: 'reply', id, ok: false, error });
  const failInFlight = (reason: string) => {
    for (const id of forwarded) fail(id, reason);
    forwarded.clear();
    galaxyRequests.clear();
  };

  const failAll = (reason: string) => {
    if (final) return;
    final = reason;
    rejectWelcome(new Error(reason));
    for (const m of waiting.splice(0)) fail(m.id, reason);
    failInFlight(reason);
  };

  function open(): void {
    const s = opts.connect();
    socket = s;
    let alive = true;
    const hello = (login: { ticket: string } | { callsign: string; password: string }) =>
      s.send(JSON.stringify({ type: 'hello', protocolVersion: REMOTE_PROTOCOL_VERSION, ...login }));
    s.addEventListener('open', () => {
      const c = opts.credentials;
      if (!('session' in c)) return hello({ callsign: c.callsign, password: c.password });
      // a new ticket for every connection (each is good once)
      (opts.ticket ?? wsTicket)(c.session, c.guest ?? false).then(
        (ticket) => alive && hello({ ticket }),
        (e: unknown) => {
          if (!alive) return;
          const why = e instanceof Error ? e.message : String(e);
          // refused (nobody logged in, no guests): the end; no server behind the proxy, limits: try again
          if (e instanceof AccountError && (e.status === 401 || e.status === 403)) failAll(why);
          else lost(why);
          s.close();
        },
      );
    });
    s.addEventListener('message', (e) => {
      if (!alive) return;
      const text = String(e.data);
      if (host) onText(text);
      else inbox.push(text);
    });
    const lost = (why: string) => {
      if (!alive) return;
      alive = false;
      if (!final) disconnected(why);
    };
    s.addEventListener('error', () => lost('serwer gry niedostępny'));
    s.addEventListener('close', () => lost('połączenie z serwerem gry zamknięte'));
  }

  function disconnected(why: string): void {
    failInFlight(why);
    ready = false;
    awaitingReset = false;
    inbox.length = 0;
    if (retries >= maxRetries) {
      failAll(why);
      return;
    }
    const delay = retryMs * Math.min(2 ** retries, 10);
    retries++;
    console.warn(`replica: ${why}; reconnecting in ${delay} ms`);
    setTimeout(() => {
      if (final) return;
      reconnects++;
      open();
    }, delay);
  }

  open();

  Promise.resolve(opts.host).then(
    (h) => {
      host = h;
      for (const t of inbox.splice(0)) onText(t);
    },
    (e: unknown) => {
      failAll(`game-wasm: ${e instanceof Error ? e.message : String(e)}`);
      socket.close();
    },
  );

  const resync = (why: string) => {
    if (awaitingReset || final) return;
    awaitingReset = true;
    resyncs++;
    console.warn(`replica: ${why}; asking the server for the world again`);
    socket.send(JSON.stringify({ type: 'resync' }));
  };

  function onText(text: string): void {
    const h = host!;
    const type = TYPE.exec(text)?.[1];
    switch (type) {
      case 'reset':
      case 'sync':
      case 'hash': {
        if (type !== 'reset' && (awaitingReset || !ready)) return; // stale until the new checkpoint
        const r = h.sync(text);
        if (!r.ok) {
          if (type === 'reset') {
            failAll(`replica: ${r.error}`);
            socket.close();
          } else resync(r.error);
          return;
        }
        post(r.out);
        if (type === 'reset') {
          awaitingReset = false;
          retries = 0;
          if (!ready) {
            ready = everReady = true;
            for (const m of waiting.splice(0)) route(m);
          }
        }
        return;
      }
      case 'welcome':
        resolveWelcome(JSON.parse(text) as Welcome);
        return;
      case 'error':
        // a refused login (or protocol): no retry
        failAll(`serwer: ${(JSON.parse(text) as { error: string }).error}`);
        return;
      case 'reply': {
        const m = JSON.parse(text) as Extract<WorkerMessage, { type: 'reply' }>;
        if (!forwarded.delete(m.id)) return;
        const market = galaxyRequests.delete(m.id);
        post([m]);
        // as the mock: a snapshot right after the reply to a change (its sync came before the reply);
        // the market's changes come as a galaxy view instead
        if (m.ok && !awaitingReset && !market) post(h.snapshot(now()));
        return;
      }
      case 'galaxy': {
        galaxy = (JSON.parse(text) as { view: GalaxyView }).view;
        opts.post({ type: 'galaxy', view: galaxy });
        if (everReady && !awaitingReset) post(h.snapshot(now()));
        return;
      }
    }
  }

  function route(m: RequestMessage): void {
    if (LOCAL.has(m.request.kind)) {
      post(host!.handle(m, now()));
      return;
    }
    forwarded.add(m.id);
    if (m.request.kind === 'galaxy') {
      galaxyRequests.add(m.id);
      socket.send(JSON.stringify({ id: m.id, galaxy: m.request.op }));
      return;
    }
    socket.send(JSON.stringify(m));
  }

  return {
    welcome,
    get resyncs() {
      return resyncs;
    },
    get reconnects() {
      return reconnects;
    },
    request(m) {
      if (final) fail(m.id, final);
      else if (ready) route(m);
      else if (everReady && host && LOCAL.has(m.request.kind)) post(host.handle(m, now()));
      else waiting.push(m);
    },
    tick() {
      if (everReady && host && !final) post(host.view(now()));
    },
    close() {
      failAll('GameApi disposed');
      socket.close();
    },
  };
}
