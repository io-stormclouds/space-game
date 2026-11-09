import type { RequestMessage, WorkerLike, WorkerMessage } from './protocol';

// GameApi over the network (plan 02 B4): the game server (server/crates/game-server) speaks the same
// messages as the worker, as JSON text frames on a WebSocket. This adapter makes the socket look like
// a Worker, so `createWorkerGameApi` serves both. First frame: hello (login); the server answers
// welcome or an error. The socket opens on the first request (the login page has set the callsign by
// then); requests sent before the welcome wait; a lost connection fails the pending ones.

export const REMOTE_PROTOCOL_VERSION = 1;

export interface RemoteCredentials {
  callsign: string;
  password: string;
}

export interface Welcome {
  type: 'welcome';
  protocolVersion: number;
  accountId: string;
  callsign: string;
  worldId: string;
  devMode: boolean;
  stepSeconds: number;
  serverTime: number;
}

/** The part of a WebSocket the adapter needs (tests pass a fake). */
export interface SocketLike {
  send(data: string): void;
  close(): void;
  addEventListener(type: 'open' | 'close' | 'error', listener: () => void): void;
  addEventListener(type: 'message', listener: (e: { data: unknown }) => void): void;
}

export interface RemoteWorker extends WorkerLike {
  /** Resolves on the server's welcome; rejects when the login is refused or the socket fails. */
  readonly welcome: Promise<Welcome>;
}

export function createRemoteWorker(connect: () => SocketLike, credentials: () => RemoteCredentials): RemoteWorker {
  let socket: SocketLike | null = null;
  const listeners = new Set<(e: MessageEvent<WorkerMessage>) => void>();
  const waiting: RequestMessage[] = [];
  const pending = new Set<number>();
  let ready = false;
  let closed: string | null = null;
  let resolveWelcome!: (w: Welcome) => void;
  let rejectWelcome!: (e: Error) => void;
  const welcome = new Promise<Welcome>((res, rej) => ((resolveWelcome = res), (rejectWelcome = rej)));
  welcome.catch(() => undefined);

  const emit = (msg: WorkerMessage) => listeners.forEach((l) => l({ data: msg } as MessageEvent<WorkerMessage>));
  const failAll = (reason: string) => {
    closed = reason;
    rejectWelcome(new Error(reason));
    for (const m of waiting.splice(0)) pending.add(m.id);
    for (const id of [...pending]) emit({ type: 'reply', id, ok: false, error: reason });
    pending.clear();
  };

  const open = (): SocketLike => {
    const ws = connect();
    ws.addEventListener('open', () => {
      const c = credentials();
      ws.send(JSON.stringify({ type: 'hello', protocolVersion: REMOTE_PROTOCOL_VERSION, callsign: c.callsign, password: c.password }));
    });
    ws.addEventListener('message', (e) => onMessage(ws, e));
    ws.addEventListener('error', () => failAll('serwer gry niedostępny'));
    ws.addEventListener('close', () => failAll(closed ?? 'połączenie z serwerem gry zamknięte'));
    return ws;
  };
  const onMessage = (ws: SocketLike, e: { data: unknown }) => {
    const msg = JSON.parse(String(e.data)) as WorkerMessage | Welcome | { type: 'error'; error: string };
    if (msg.type === 'welcome') {
      ready = true;
      resolveWelcome(msg);
      for (const m of waiting.splice(0)) ws.send(JSON.stringify(m));
      return;
    }
    if (msg.type === 'error') {
      failAll(`serwer: ${msg.error}`);
      return;
    }
    if (msg.type === 'reply') pending.delete(msg.id);
    emit(msg);
  };

  return {
    welcome,
    postMessage(m: RequestMessage) {
      if (closed) {
        queueMicrotask(() => emit({ type: 'reply', id: m.id, ok: false, error: closed! }));
        return;
      }
      pending.add(m.id);
      socket ??= open();
      if (ready) socket.send(JSON.stringify(m));
      else waiting.push(m);
    },
    addEventListener: (_t, l) => listeners.add(l),
    removeEventListener: (_t, l) => listeners.delete(l),
    terminate: () => socket?.close(),
  };
}
