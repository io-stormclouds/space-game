import type { RequestMessage, WorkerMessage } from '@space-game/api';

// Loader of the Rust game session compiled to WebAssembly (server/crates/game-wasm). The module has
// a plain C ABI: JSON requests go into an input buffer in linear memory, the result is a JSON array
// of outgoing messages (replies and pushes of `protocol.ts`). No generated glue.

interface Exports {
  memory: WebAssembly.Memory;
  sg_version(): number;
  sg_input(len: number): number;
  sg_output_ptr(): number;
  sg_handle(len: number, nowMs: number): number;
  sg_tick(nowMs: number): number;
  sg_snapshot(nowMs: number): number;
  sg_sync(len: number): number;
  sg_view(nowMs: number): number;
}

/** Result of a sync message applied to the replica: its pushes, or why it can no longer follow. */
export type SyncResult = { ok: true; out: WorkerMessage[] } | { ok: false; error: string };

/** The ServerHost of the mock, implemented in Rust: same requests, same messages. */
export interface WasmHost {
  /** One request → its reply and the pushes it causes (events, snapshot). */
  handle(message: RequestMessage, nowMs: number): WorkerMessage[];
  /** One loop tick: fixed steps for the real time passed, events, frame, snapshot every 100 ms. */
  tick(nowMs: number): WorkerMessage[];
  /** A snapshot push now. */
  snapshot(nowMs: number): WorkerMessage[];
  /** Replica of a server world: applies a sync message (JSON text: reset, sync, hash). */
  sync(json: string): SyncResult;
  /** Replica loop tick: the frame after a step, the snapshot when something changed (≤ 10 Hz). */
  view(nowMs: number): WorkerMessage[];
  /** Crate version of the module (major × 10000 + minor × 100 + patch). */
  readonly version: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** Default clock of the step statistics. */
const performanceNow = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/**
 * Instantiates the module from its bytes or a compiled module. `now` is the clock of the step
 * statistics (performance.now by default).
 */
export async function createWasmHost(source: BufferSource | WebAssembly.Module, now: () => number = performanceNow): Promise<WasmHost> {
  let exports: Exports | null = null;
  let panicMessage = '';
  const imports = {
    env: {
      sg_now: () => now(),
      sg_panic: (ptr: number, len: number) => {
        if (exports) panicMessage = decoder.decode(new Uint8Array(exports.memory.buffer, ptr, len));
      },
    },
  };
  const instance =
    source instanceof WebAssembly.Module
      ? await WebAssembly.instantiate(source, imports)
      : (await WebAssembly.instantiate(source, imports)).instance;
  exports = instance.exports as unknown as Exports;
  const ex = exports;

  const read = <T = WorkerMessage[]>(len: number): T => JSON.parse(decoder.decode(new Uint8Array(ex.memory.buffer, ex.sg_output_ptr(), len)));
  const input = (text: string): number => {
    const bytes = encoder.encode(text);
    const ptr = ex.sg_input(bytes.length);
    new Uint8Array(ex.memory.buffer, ptr, bytes.length).set(bytes);
    return bytes.length;
  };
  const guard = <T>(f: () => T): T => {
    try {
      return f();
    } catch (e) {
      // a Rust panic traps (unreachable); the message came through sg_panic just before
      throw new Error(panicMessage ? `game-wasm: ${panicMessage}` : `game-wasm: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return {
    version: ex.sg_version(),
    handle: (message, nowMs) => guard(() => read(ex.sg_handle(input(JSON.stringify(message)), nowMs))),
    tick: (nowMs) => guard(() => read(ex.sg_tick(nowMs))),
    snapshot: (nowMs) => guard(() => read(ex.sg_snapshot(nowMs))),
    sync: (json) => guard(() => read<SyncResult>(ex.sg_sync(input(json)))),
    view: (nowMs) => guard(() => read(ex.sg_view(nowMs))),
  };
}
