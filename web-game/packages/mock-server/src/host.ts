import type { ReplyValue, Request, RequestMessage, WorkerMessage } from '@space-game/api';
import { MockServer, type MockServerOptions } from './server';

/** Requests that do not change the game (no snapshot push after them). */
const QUERIES = new Set<Request['kind']>(['snapshot', 'save', 'catalog', 'availability', 'previewBuild', 'suggestTile']);

export interface HostOptions extends MockServerOptions {
  /** Real ms between loop ticks (≈ display refresh). */
  tickMs?: number;
  /** Real ms between pushed snapshots (HUD state). */
  snapshotMs?: number;
}

/**
 * Runs a MockServer behind the message protocol: a timer advances the fixed-step simulation and
 * pushes events every tick, frame positions every tick and snapshots at ~10 Hz. Used by the
 * worker entry and, in tests, directly in the same thread.
 */
export class ServerHost {
  readonly server: MockServer;
  private readonly tickMs: number;
  private readonly snapshotMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private last = 0;
  private lastSnapshot = 0;

  constructor(
    private readonly post: (msg: WorkerMessage) => void,
    opts: HostOptions = {},
  ) {
    this.server = new MockServer(opts);
    this.tickMs = opts.tickMs ?? 16;
    this.snapshotMs = opts.snapshotMs ?? 100;
  }

  run(): void {
    if (this.timer) return;
    this.last = Date.now();
    this.timer = setInterval(() => this.tick(), this.tickMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  tick(nowMs = Date.now()): void {
    const dt = (nowMs - this.last) / 1000;
    this.last = nowMs;
    const events = this.server.advance(dt);
    if (events.length) this.post({ type: 'events', events });
    this.post({ type: 'frame', frame: this.server.frame() });
    if (nowMs - this.lastSnapshot >= this.snapshotMs) this.pushSnapshot(nowMs);
  }

  pushSnapshot(nowMs = Date.now()): void {
    this.lastSnapshot = nowMs;
    this.post({ type: 'snapshot', snapshot: this.server.snapshot() });
  }

  handle(msg: RequestMessage): void {
    try {
      const value = this.dispatch(msg.request);
      this.post({ type: 'reply', id: msg.id, ok: true, value });
      if (!QUERIES.has(msg.request.kind)) this.pushSnapshot();
    } catch (e) {
      this.post({ type: 'reply', id: msg.id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }

  private dispatch(r: Request): ReplyValue {
    const s = this.server;
    switch (r.kind) {
      case 'start':
        return s.start(r.scenarioId, r.economy);
      case 'command': {
        const result = s.command(r.command);
        if (result.events.length) this.post({ type: 'events', events: result.events });
        return result;
      }
      case 'setTempo':
        s.setTempo(r.tempo);
        return null;
      case 'pause':
        s.pause();
        return null;
      case 'resume':
        s.resume();
        return null;
      case 'stepOnce': {
        const events = s.stepMany(Math.max(1, Math.floor(r.steps)));
        if (events.length) this.post({ type: 'events', events });
        return s.snapshot();
      }
      case 'save':
        return s.save();
      case 'load':
        return s.load(r.file);
      case 'replay':
        return s.replay(r.file);
      case 'snapshot':
        return s.snapshot();
      case 'catalog':
        return s.catalog();
      case 'availability':
        return s.availability(r.bodyId, r.kinds);
      case 'previewBuild':
        return s.previewBuild(r.bodyId, r.tileIndex, r.buildingKind, r.rotation);
      case 'suggestTile':
        return s.suggestTile(r.bodyId, r.buildingKind, r.material);
    }
  }
}
