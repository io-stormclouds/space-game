/// <reference lib="webworker" />
// Web Worker entry of the network game (plan 02 B4, `?api=remote`): a replica of the player's world on
// the game server (replica.ts). The UI thread sends `{type:'connect', url, credentials}` before its
// first request (api `connectOnFirstRequest`); the module loads while the socket logs in.
import type { ConnectMessage, RequestMessage } from '@space-game/api';
import { fetchWasmHost } from './load';
import { createReplica, type Replica } from './replica';

declare const self: DedicatedWorkerGlobalScope;

const TICK_MS = 16;
let replica: Replica | null = null;
const early: RequestMessage[] = [];

self.addEventListener('message', (e: MessageEvent<RequestMessage | ConnectMessage>) => {
  const m = e.data;
  if ('type' in m && m.type === 'connect') {
    if (replica) return;
    const r = createReplica({
      host: fetchWasmHost(self.location.href),
      connect: () => new WebSocket(m.url),
      credentials: m.credentials,
      post: (msg) => self.postMessage(msg),
    });
    replica = r;
    for (const q of early.splice(0)) r.request(q);
    setInterval(() => r.tick(), TICK_MS);
    return;
  }
  if (replica) replica.request(m as RequestMessage);
  else early.push(m as RequestMessage);
});
