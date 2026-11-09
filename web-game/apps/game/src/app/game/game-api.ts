import { InjectionToken } from '@angular/core';
import { createRemoteWorker, createWorkerGameApi, type GameApi, type RemoteCredentials, type WorkerLike } from '@space-game/api';

/**
 * Which implementation of GameApi the app runs (plan 02 B3/B4):
 * - `mock-ts`: the TypeScript mock server in a worker (default),
 * - `wasm`: the Rust game session compiled to WebAssembly in a worker (`npm run wasm:build`),
 * - `remote`: the game server (`server/crates/game-server`) over a WebSocket; address from
 *   `?server=ws://…/ws` or localStorage `sg.server` (default: port 8080 of this host).
 * Chosen with `?api=…` in the address (remembered) or localStorage `sg.api`.
 */
export type ApiMode = 'mock-ts' | 'wasm' | 'remote';
const MODES: readonly ApiMode[] = ['mock-ts', 'wasm', 'remote'];

export const API_STORAGE_KEY = 'sg.api';

export function apiMode(): ApiMode {
  try {
    const params = new URLSearchParams(globalThis.location?.search ?? '');
    const server = params.get('server');
    if (server) globalThis.localStorage?.setItem('sg.server', server);
    const fromUrl = params.get('api') as ApiMode | null;
    if (fromUrl && MODES.includes(fromUrl)) {
      globalThis.localStorage?.setItem(API_STORAGE_KEY, fromUrl);
      return fromUrl;
    }
    const stored = globalThis.localStorage?.getItem(API_STORAGE_KEY) as ApiMode | null;
    return stored && MODES.includes(stored) ? stored : 'mock-ts';
  } catch {
    return 'mock-ts';
  }
}

function stored(key: string, make: () => string): string {
  try {
    const v = localStorage.getItem(key);
    if (v) return v;
    const fresh = make();
    localStorage.setItem(key, fresh);
    return fresh;
  } catch {
    return make();
  }
}

const randomId = (n: number) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');

/**
 * Login of the remote mode: the callsign the login page stored (`sg.callsign`), else a guest one;
 * the access code is a secret kept in this browser (the login form's code field is still a mock-up).
 */
export function remoteCredentials(): RemoteCredentials {
  return { callsign: stored(CALLSIGN_KEY, () => `gosc-${randomId(6)}`), password: stored('sg.secret', () => randomId(20)) };
}

export const CALLSIGN_KEY = 'sg.callsign';

function serverUrl(): string {
  const set = globalThis.localStorage?.getItem('sg.server');
  if (set) return set;
  const loc = globalThis.location;
  const scheme = loc.protocol === 'https:' ? 'wss' : 'ws';
  // behind Caddy (deploy/, standard port) the server shares the origin; the dev server talks to :8080
  return loc.port === '' ? `${scheme}://${loc.host}/ws` : `${scheme}://${loc.hostname}:8080/ws`;
}

/** Factory of the GameApi the app talks to. Tests provide an in-thread one. */
export const GAME_API = new InjectionToken<() => GameApi>('GAME_API', {
  providedIn: 'root',
  factory: () => () => {
    const mode = apiMode();
    if (mode === 'remote') return createWorkerGameApi(createRemoteWorker(() => new WebSocket(serverUrl()), remoteCredentials));
    const worker =
      mode === 'wasm'
        ? new Worker(new URL('./game-wasm.worker', import.meta.url), { type: 'module', name: 'game-wasm' })
        : new Worker(new URL('./game.worker', import.meta.url), { type: 'module', name: 'mock-server' });
    return createWorkerGameApi(worker as unknown as WorkerLike);
  },
});
