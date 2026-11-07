import { createWorkerGameApi, type GameApi, type RequestMessage, type WorkerLike, type WorkerMessage } from '@space-game/api';
import { ServerHost, type HostOptions } from './host';

/**
 * The same protocol without a Worker: for unit tests and debugging (W03 B as a fallback).
 * `autoRun: false` leaves the clock to the caller (`host.tick(ms)`), which tests use.
 */
export function createInThreadGameApi(opts: HostOptions & { autoRun?: boolean } = {}): { api: GameApi; host: ServerHost } {
  const listeners = new Set<(e: MessageEvent<WorkerMessage>) => void>();
  const host = new ServerHost((msg) => {
    const event = { data: msg } as MessageEvent<WorkerMessage>;
    // async like a real worker
    queueMicrotask(() => listeners.forEach((l) => l(event)));
  }, opts);
  const fake: WorkerLike = {
    postMessage: (m: RequestMessage) => queueMicrotask(() => host.handle(structuredClone(m))),
    addEventListener: (_t, l) => listeners.add(l),
    removeEventListener: (_t, l) => listeners.delete(l),
    terminate: () => host.stop(),
  };
  if (opts.autoRun !== false) host.run();
  return { api: createWorkerGameApi(fake), host };
}
