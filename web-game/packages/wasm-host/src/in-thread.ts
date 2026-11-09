import { createWorkerGameApi, type GameApi, type RequestMessage, type WorkerLike, type WorkerMessage } from '@space-game/api';
import type { WasmHost } from './wasm-host';

/**
 * GameApi over a loaded WasmHost without a Worker (tests, Node). The clock is the caller's:
 * `tick(ms)` advances the loop, as `ServerHost.tick` in the mock's in-thread API.
 */
export function createInThreadWasmGameApi(host: WasmHost): { api: GameApi; tick: (nowMs: number) => void } {
  const listeners = new Set<(e: MessageEvent<WorkerMessage>) => void>();
  let now = 0;
  const deliver = (messages: WorkerMessage[]) =>
    queueMicrotask(() => messages.forEach((m) => listeners.forEach((l) => l({ data: m } as MessageEvent<WorkerMessage>))));
  const fake: WorkerLike = {
    postMessage: (m: RequestMessage) => queueMicrotask(() => deliver(host.handle(m, now))),
    addEventListener: (_t, l) => listeners.add(l),
    removeEventListener: (_t, l) => listeners.delete(l),
    terminate: () => undefined,
  };
  return {
    api: createWorkerGameApi(fake),
    tick: (nowMs) => {
      now = nowMs;
      deliver(host.tick(nowMs));
    },
  };
}
