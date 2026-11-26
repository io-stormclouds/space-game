import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Plan 08 E1-09 (P-16 a): the galaxy generator gives the same bytes on wasm32 as natively. The
// recorded vectors (server/conformance/vectors/galaxy-gen.json) are the text the native build wrote
// for the request kept in the file itself. The module gets that request through `sg_galaxy`, a test
// export outside GameApi, and has to answer with the same bytes. Needs the module from
// `npm run wasm:build`; skipped without it.

const here = dirname(fileURLToPath(import.meta.url));
const WASM = resolve(here, '../../../apps/game/public/wasm/game_wasm.wasm');
const VECTORS = resolve(here, '../../../../server/conformance/vectors/galaxy-gen.json');

/** What the test calls: the two buffers of the module's C ABI and the test export. */
interface GalaxyExports {
  memory: WebAssembly.Memory;
  sg_input(len: number): number;
  sg_output_ptr(): number;
  sg_galaxy(len: number): number;
}

/** The recorded document, as far as the test reads it by name. */
interface Vectors {
  request: { params: { seed: number } };
  cells: unknown[];
  systems: unknown[];
}

/** A fresh instance of the module as a function: request text in, the bytes of the answer out. */
async function galaxyOf(module: WebAssembly.Module): Promise<(request: string) => Buffer> {
  let memory: WebAssembly.Memory | null = null;
  let panicMessage = '';
  const instance = await WebAssembly.instantiate(module, {
    env: {
      sg_now: () => 0,
      sg_panic: (ptr: number, len: number) => {
        if (memory) panicMessage = new TextDecoder().decode(new Uint8Array(memory.buffer, ptr, len));
      },
    },
  });
  const ex = instance.exports as unknown as GalaxyExports;
  memory = ex.memory;
  if (typeof ex.sg_galaxy !== 'function') throw new Error('game_wasm.wasm has no sg_galaxy export (npm run wasm:build)');
  return (request) => {
    const bytes = new TextEncoder().encode(request);
    try {
      const ptr = ex.sg_input(bytes.length);
      new Uint8Array(ex.memory.buffer, ptr, bytes.length).set(bytes);
      const len = ex.sg_galaxy(bytes.length);
      // a copy: the view dies with the next call into the module
      return Buffer.from(new Uint8Array(ex.memory.buffer, ex.sg_output_ptr(), len));
    } catch (e) {
      // a Rust panic traps (unreachable); the message came through sg_panic just before
      throw new Error(`game-wasm: ${panicMessage || (e instanceof Error ? e.message : String(e))}`);
    }
  };
}

/** Where two texts part, for the failure message; null when every byte and the length agree. */
function firstDifference(wasm: Uint8Array, recorded: Uint8Array): string | null {
  const shorter = Math.min(wasm.length, recorded.length);
  let at = 0;
  while (at < shorter && wasm[at] === recorded[at]) at++;
  if (at === shorter && wasm.length === recorded.length) return null;
  let line = 1;
  for (let i = 0; i < at; i++) if (recorded[i] === 10) line++;
  const around = (bytes: Uint8Array) => new TextDecoder().decode(bytes.subarray(Math.max(0, at - 60), at + 60));
  return [
    `byte ${at} (line ${line}); ${wasm.length} bytes from wasm32, ${recorded.length} recorded`,
    `  recorded: ${around(recorded)}`,
    `  wasm32:   ${around(wasm)}`,
  ].join('\n');
}

describe.skipIf(!existsSync(WASM))('galaxy generator on wasm32 gives the natively recorded bytes (E1-09)', () => {
  let module: WebAssembly.Module;
  let recorded: Buffer;
  let vectors: Vectors;
  beforeAll(async () => {
    module = await WebAssembly.compile(readFileSync(WASM));
    recorded = readFileSync(VECTORS);
    vectors = JSON.parse(recorded.toString('utf8')) as Vectors;
  });

  it('answers the recorded request with the recorded text, byte for byte', async () => {
    // the recorded document is the pilot's: the seed, 50 cells and 200 systems, not an empty one
    expect(vectors.request.params.seed).toBe(20261111);
    expect(vectors.cells.length).toBe(50);
    expect(vectors.systems.length).toBe(200);

    const galaxy = await galaxyOf(module);
    const answer = galaxy(JSON.stringify(vectors.request));
    // the whole text: the first difference is for the message, `equals` is the verdict
    expect(firstDifference(answer, recorded)).toBeNull();
    expect(answer.equals(recorded)).toBe(true);
  });

  it('computes the text from the request: another seed gives other stars and systems', async () => {
    const galaxy = await galaxyOf(module);
    const request = { ...vectors.request, params: { ...vectors.request.params, seed: vectors.request.params.seed + 1 } };
    const answer = galaxy(JSON.stringify(request));
    const other = JSON.parse(answer.toString('utf8')) as Vectors;
    expect(other.request.params.seed).toBe(20261112);
    expect(other.cells.length).toBe(50);
    expect(other.systems.length).toBe(200);
    expect(answer.equals(recorded)).toBe(false);
    expect(JSON.stringify(other.systems)).not.toBe(JSON.stringify(vectors.systems));
  });
});
