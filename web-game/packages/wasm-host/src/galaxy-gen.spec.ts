import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Task E1-09 (P-16 a): the galaxy generator gives the same bytes on wasm32 as natively. The module's
// test hook `sg_galaxy` (outside GameApi) runs the request of the recorded file; its text must equal
// server/conformance/vectors/galaxy-gen.json, recorded natively by `conformance galaxy-record`,
// byte for byte. Needs the module from `npm run wasm:build`; skipped without it, like the other
// specs of this package.

const here = dirname(fileURLToPath(import.meta.url));
const WASM = resolve(here, '../../../apps/game/public/wasm/game_wasm.wasm');
const VECTORS = resolve(here, '../../../../server/conformance/vectors/galaxy-gen.json');

interface GalaxyExports {
  memory: WebAssembly.Memory;
  sg_input(len: number): number;
  sg_output_ptr(): number;
  sg_galaxy(len: number): number;
}

interface CellCoord {
  x: number;
  y: number;
  z: number;
}

/** The request of the recorded file (`conformance::galaxy::request` in Rust): the defaults with the
 * seed 20261111; 25 cells around Sol and 25 far cells; the first 200 systems of the far row. */
function recordedRequest(): string {
  const cell = (x: number, y: number): CellCoord => ({ x, y, z: 0 });
  const cells: CellCoord[] = [];
  for (let x = -2; x <= 2; x++) for (let y = -2; y <= 2; y++) cells.push(cell(x, y));
  for (let x = 2000; x <= 2024; x++) cells.push(cell(x, 0));
  return JSON.stringify({ seed: 20261111, cells, systems: { from: cell(2000, 0), count: 200 } });
}

/** Runs one request through the module's input and output buffers; returns the output bytes. */
async function galaxyOnWasm(request: string): Promise<Uint8Array> {
  let exports: GalaxyExports | null = null;
  let panicMessage = '';
  const imports = {
    env: {
      sg_now: () => 0,
      sg_panic: (ptr: number, len: number) => {
        if (exports) panicMessage = new TextDecoder().decode(new Uint8Array(exports.memory.buffer, ptr, len));
      },
    },
  };
  const { instance } = await WebAssembly.instantiate(readFileSync(WASM), imports);
  const ex = instance.exports as unknown as GalaxyExports;
  exports = ex;
  const bytes = new TextEncoder().encode(request);
  try {
    const ptr = ex.sg_input(bytes.length);
    new Uint8Array(ex.memory.buffer, ptr, bytes.length).set(bytes);
    const len = ex.sg_galaxy(bytes.length);
    // a copy: the next call may move or reuse the output buffer
    return new Uint8Array(ex.memory.buffer, ex.sg_output_ptr(), len).slice();
  } catch (e) {
    throw new Error(`game-wasm: ${panicMessage || (e instanceof Error ? e.message : String(e))}`);
  }
}

/** Where two byte strings first differ (`null` when equal), with the text around it for the message. */
function firstDifference(a: Uint8Array, b: Uint8Array): string | null {
  const n = Math.min(a.length, b.length);
  let at = 0;
  while (at < n && a[at] === b[at]) at++;
  if (at === n && a.length === b.length) return null;
  const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes.subarray(Math.max(0, at - 60), at + 60));
  const line = a.subarray(0, at).filter((c) => c === 0x0a).length + 1;
  return `byte ${at} (line ${line}; wasm ${a.length} bytes, recorded ${b.length}):\n  wasm:     …${text(a)}…\n  recorded: …${text(b)}…`;
}

describe.skipIf(!existsSync(WASM))('galaxy generator on wasm32 (E1-09)', () => {
  it('sg_galaxy returns galaxy-gen.json byte for byte', async () => {
    const recorded = new Uint8Array(readFileSync(VECTORS));
    // the file holds what the task names: not an empty or truncated recording
    const file = JSON.parse(new TextDecoder().decode(recorded)) as { params: { seed: number }; cells: unknown[]; systems: unknown[] };
    expect(file.params.seed).toBe(20261111);
    expect(file.cells.length).toBe(50);
    expect(file.systems.length).toBe(200);

    const wasm = await galaxyOnWasm(recordedRequest());
    expect(firstDifference(wasm, recorded)).toBeNull();
    expect(wasm.length).toBe(recorded.length);
  });
});
