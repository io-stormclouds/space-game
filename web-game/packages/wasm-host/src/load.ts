import { createWasmHost, type WasmHost } from './wasm-host';

/** Where `npm run wasm:build` puts the module (apps/game/public/wasm), next to the worker script. */
export const WASM_PATH = 'wasm/game_wasm.wasm';

/** Fetches and instantiates the game module relative to `base` (the worker's location). */
export async function fetchWasmHost(base: string): Promise<WasmHost> {
  const url = new URL(WASM_PATH, base);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url.pathname}: HTTP ${response.status} (npm run wasm:build)`);
  return createWasmHost(await response.arrayBuffer());
}
