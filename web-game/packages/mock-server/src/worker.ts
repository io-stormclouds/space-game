/// <reference lib="webworker" />
// Web Worker entry of the mock server (W03 A): the simulation runs off the UI thread, as it later
// will on a real server. The app starts it with `new Worker(new URL('…/worker', import.meta.url))`.
import type { RequestMessage, WorkerMessage } from '@space-game/api';
import { ServerHost } from './host';

declare const self: DedicatedWorkerGlobalScope;

const host = new ServerHost((msg: WorkerMessage) => self.postMessage(msg));
self.addEventListener('message', (e: MessageEvent<RequestMessage>) => host.handle(e.data));
host.run();
host.pushSnapshot();
