import { InjectionToken } from '@angular/core';
import { connectOnFirstRequest, createWorkerGameApi, SESSION_API, type GameApi, type RemoteCredentials, type WorkerLike } from '@space-game/api';

/**
 * Which implementation of GameApi the app runs (plan 02 B3/B4):
 * - `mock-ts`: the TypeScript mock server in a worker (default),
 * - `wasm`: the Rust game session compiled to WebAssembly in a worker (`npm run wasm:build`),
 * - `remote`: the game server (`server/crates/game-server`); a worker keeps a replica of the world in
 *   WebAssembly (needs `npm run wasm:build` too) and follows the server over a WebSocket. The server
 *   shares the page's origin (`/ws`, `/api`): Caddy in deploy/, the dev server's proxy in development
 *   (`proxy.conf.mjs`, `GAME_SERVER`), so the session cookie is first-party (R-25).
 * Chosen with `?api=…` in the address (remembered) or localStorage `sg.api`.
 */
export type ApiMode = 'mock-ts' | 'wasm' | 'remote';
const MODES: readonly ApiMode[] = ['mock-ts', 'wasm', 'remote'];

export const API_STORAGE_KEY = 'sg.api';

export function apiMode(): ApiMode {
  try {
    const params = new URLSearchParams(globalThis.location?.search ?? '');
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

/**
 * Login of the remote mode: a ticket of the session cookie (the login page logs in); nobody logged
 * in, a guest account where the server allows them.
 */
export function remoteCredentials(): RemoteCredentials {
  return { session: SESSION_API, guest: true };
}

function serverUrl(): string {
  const loc = globalThis.location;
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}/ws`;
}

/** Factory of the GameApi the app talks to. Tests provide an in-thread one. */
export const GAME_API = new InjectionToken<() => GameApi>('GAME_API', {
  providedIn: 'root',
  factory: () => () => {
    const mode = apiMode();
    if (mode === 'remote') {
      const replica = new Worker(new URL('./game-replica.worker', import.meta.url), { type: 'module', name: 'game-replica' });
      return createWorkerGameApi(connectOnFirstRequest(replica, () => ({ type: 'connect', url: serverUrl(), credentials: remoteCredentials() })));
    }
    const worker =
      mode === 'wasm'
        ? new Worker(new URL('./game-wasm.worker', import.meta.url), { type: 'module', name: 'game-wasm' })
        : new Worker(new URL('./game.worker', import.meta.url), { type: 'module', name: 'mock-server' });
    return createWorkerGameApi(worker as unknown as WorkerLike);
  },
});
