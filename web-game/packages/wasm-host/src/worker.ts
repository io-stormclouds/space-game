/// <reference lib="webworker" />
// Web Worker entry of the game on WebAssembly (plan 02 B3): the Rust session (server/crates/game-wasm)
// runs here instead of the TypeScript mock and speaks the same protocol. Requests that arrive while
// the module loads wait in a queue; if it fails to load, every request gets an error reply.
import type { RequestMessage, WorkerMessage } from '@space-game/api';
import { createWasmHost, type WasmHost } from './wasm-host';

declare const self: DedicatedWorkerGlobalScope;

/** Where `npm run wasm:build` puts the module (apps/game/public/wasm), next to the worker script. */
export const WASM_PATH = 'wasm/game_wasm.wasm';
const TICK_MS = 16;

const post = (messages: WorkerMessage[]) => messages.forEach((m) => self.postMessage(m));
const queue: RequestMessage[] = [];
let host: WasmHost | null = null;
let failure: string | null = null;

const fail = (m: RequestMessage) => self.postMessage({ type: 'reply', id: m.id, ok: false, error: failure ?? 'game-wasm not loaded' } satisfies WorkerMessage);

self.addEventListener('message', (e: MessageEvent<RequestMessage>) => {
  if (host) post(host.handle(e.data, Date.now()));
  else if (failure) fail(e.data);
  else queue.push(e.data);
});

async function boot(): Promise<void> {
  try {
    const url = new URL(WASM_PATH, self.location.href);
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url.pathname}: HTTP ${response.status} (npm run wasm:build)`);
    const h = await createWasmHost(await response.arrayBuffer());
    host = h;
    post(h.snapshot(Date.now()));
    for (const m of queue.splice(0)) post(h.handle(m, Date.now()));
    setInterval(() => post(h.tick(Date.now())), TICK_MS);
  } catch (e) {
    failure = `game-wasm: ${e instanceof Error ? e.message : String(e)}`;
    console.error(failure);
    for (const m of queue.splice(0)) fail(m);
  }
}

void boot();
