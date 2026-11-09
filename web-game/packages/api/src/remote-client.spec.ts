import { createRemoteWorker, type SocketLike } from './remote-client';
import { createWorkerGameApi } from './worker-client';

// B4: the WebSocket adapter behaves like the worker: hello first, requests after the welcome,
// replies matched by id, a refused login or a lost connection fails the pending requests.

class FakeSocket implements SocketLike {
  sent: unknown[] = [];
  private readonly l: Record<string, Array<(e: { data: unknown }) => void>> = {};
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close() {
    this.emit('close');
  }
  addEventListener(type: string, listener: (e: { data: unknown }) => void) {
    (this.l[type] ??= []).push(listener);
  }
  emit(type: string, data?: unknown) {
    for (const f of this.l[type] ?? []) f({ data: data === undefined ? undefined : JSON.stringify(data) });
  }
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createRemoteWorker (GameApi over WebSocket)', () => {
  it('opens on the first request, logs in, then sends the queued requests', async () => {
    const socket = new FakeSocket();
    let opened = 0;
    const worker = createRemoteWorker(
      () => (opened++, socket),
      () => ({ callsign: 'Kestrel', password: 'tajne-haslo' }),
    );
    const api = createWorkerGameApi(worker);
    expect(opened).toBe(0);
    const reply = api.catalog();
    expect(opened).toBe(1);
    socket.emit('open');
    expect(socket.sent).toEqual([{ type: 'hello', protocolVersion: 1, callsign: 'Kestrel', password: 'tajne-haslo' }]);
    socket.emit('message', { type: 'welcome', protocolVersion: 1, accountId: 'acc-1', callsign: 'Kestrel', worldId: 'acc-1', devMode: true, stepSeconds: 1 / 60, serverTime: 0 });
    expect(socket.sent[1]).toEqual({ id: 1, request: { kind: 'catalog' } });
    socket.emit('message', { type: 'reply', id: 1, ok: true, value: { stars: [] } });
    await expect(reply).resolves.toEqual({ stars: [] });
    await expect(worker.welcome).resolves.toMatchObject({ worldId: 'acc-1' });

    const events: unknown[] = [];
    api.onEvents((e) => events.push(e));
    socket.emit('message', { type: 'events', events: [{ type: 'SCAN_STARTED' }] });
    expect(events).toHaveLength(1);
  });

  it('a refused login and a closed socket fail the pending requests', async () => {
    const socket = new FakeSocket();
    const api = createWorkerGameApi(createRemoteWorker(() => socket, () => ({ callsign: 'x', password: 'y' })));
    const first = api.snapshot();
    socket.emit('open');
    socket.emit('message', { type: 'error', error: 'błędny kod dostępu' });
    await expect(first).rejects.toThrow('błędny kod dostępu');
    const later = expect(api.catalog()).rejects.toThrow('błędny kod dostępu');
    await flush();
    await later;
  });
});
