import type { RequestMessage, WorkerLike, WorkerMessage } from './protocol';

// GameApi through the network game server (plan 02 B4, server/crates/game-server). The client keeps a
// replica of the player's world: the Rust game session in WebAssembly, in a Web Worker
// (`@space-game/wasm-host/replica-worker`). The worker logs in over a WebSocket, gets the world once
// (a checkpoint), then follows it from small sync messages (commands, tempo changes, steps) and
// checks a state hash every few seconds. The UI's queries are answered by the replica; requests that
// change the game go to the server. To the UI it is a worker like the mock's.

/** Version of the WebSocket protocol; 2: the client keeps a replica (no snapshots on the wire). */
export const REMOTE_PROTOCOL_VERSION = 2;

export interface RemoteCredentials {
  callsign: string;
  password: string;
}

/** The server's answer to the login (hello). */
export interface Welcome {
  type: 'welcome';
  protocolVersion: number;
  accountId: string;
  callsign: string;
  worldId: string;
  devMode: boolean;
  stepSeconds: number;
  serverTime: number;
}

/** UI thread → replica worker, once, before the first request: where to connect and as whom. */
export interface ConnectMessage {
  type: 'connect';
  url: string;
  credentials: RemoteCredentials;
}

/**
 * The replica worker as a WorkerLike: the connect message goes out right before the first request,
 * so the credentials are read then (the login page has stored the callsign by that time).
 */
export function connectOnFirstRequest(
  worker: Omit<WorkerLike, 'postMessage'> & { postMessage(m: RequestMessage | ConnectMessage): void },
  connect: () => ConnectMessage,
): WorkerLike {
  let connected = false;
  return {
    postMessage(m: RequestMessage) {
      if (!connected) {
        connected = true;
        worker.postMessage(connect());
      }
      worker.postMessage(m);
    },
    addEventListener: (t, l: (e: MessageEvent<WorkerMessage>) => void) => worker.addEventListener(t, l),
    removeEventListener: (t, l: (e: MessageEvent<WorkerMessage>) => void) => worker.removeEventListener(t, l),
    terminate: () => worker.terminate(),
  };
}
