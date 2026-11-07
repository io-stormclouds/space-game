import { DestroyRef, Injectable, effect, inject, signal, untracked } from '@angular/core';
import type { DomainEvent, Structure } from '@space-game/api';
import { GameService, type LogEntry } from '../game/game.service';
import { measuredRates, pushSample, type Bucket, type MeasuredRates, type Sample } from './series';

/** Events emitted every minute or every batch: kept apart so they do not push the rest out of the log. */
export const TICK_EVENTS = new Set<DomainEvent['type']>(['EXTRACTION_TICK', 'MINING_TICK', 'BATCH_STARTED', 'BATCH_COMPLETED', 'ROVER_ARRIVED', 'ROVER_MOVE_ORDERED']);

const MAX_SAMPLES = 360;
const MAX_LOG = 1000;
const MAX_TICKS = 300;
/** Minutes the measured rates average over. */
export const RATE_WINDOW = 30;

/**
 * Designer telemetry (F6): samples of the colony's storage, power and crew over game time, the full
 * event log, and flows per model minute from events. Collected from the start of every game, so the
 * panel has history when opened. Signals are updated with the snapshots (~10 Hz), not per event.
 */
@Injectable({ providedIn: 'root' })
export class Telemetry {
  private readonly game = inject(GameService);

  readonly samples = signal<ReadonlyArray<Sample>>([]);
  /** Model minutes between samples (doubles when the buffer fills). */
  readonly interval = signal(1);
  /** Events other than ticks, newest first. */
  readonly log = signal<ReadonlyArray<LogEntry>>([]);
  /** The latest tick events, newest first. */
  readonly ticks = signal<ReadonlyArray<LogEntry>>([]);
  /** Count of every event type since the start. */
  readonly counts = signal<Readonly<Record<string, number>>>({});
  readonly measured = signal<MeasuredRates>({ window: 0, extraction: {}, production: {}, consumption: {} });

  private pendingLog: LogEntry[] = [];
  private pendingTicks: LogEntry[] = [];
  private pendingCounts: Record<string, number> = {};
  private buckets: Bucket[] = [];
  private since = 0;
  private nextSampleAt = 0;

  constructor() {
    const off = [this.game.onEvents((events, time) => this.collect(events, time)), this.game.onRestart(() => this.reset())];
    inject(DestroyRef).onDestroy(() => off.forEach((o) => o()));
    effect(() => {
      const snap = this.game.snapshot();
      if (snap) untracked(() => this.flush());
    });
  }

  reset(): void {
    this.samples.set([]);
    this.interval.set(1);
    this.log.set([]);
    this.ticks.set([]);
    this.counts.set({});
    this.measured.set({ window: 0, extraction: {}, production: {}, consumption: {} });
    this.pendingLog = [];
    this.pendingTicks = [];
    this.pendingCounts = {};
    this.buckets = [];
    this.since = this.game.time();
    this.nextSampleAt = this.since;
  }

  private collect(events: DomainEvent[], time: number): void {
    const body = this.game.colonyBodyId();
    let byId: Map<string, Structure['bodyId']> | null = null;
    const bodyOf = (id: string) => (byId ??= new Map((this.game.world()?.structures ?? []).map((s) => [s.id, s.bodyId]))).get(id);
    let bucket: Bucket | null = null;
    const minute = Math.floor(time);
    const flows = () => {
      if (bucket) return bucket;
      const last = this.buckets[this.buckets.length - 1];
      if (last?.minute === minute) return (bucket = last);
      bucket = { minute, extraction: {}, production: {}, consumption: {} };
      this.buckets.push(bucket);
      if (this.buckets.length > RATE_WINDOW * 4) this.buckets.shift();
      return bucket;
    };
    const add = (to: Record<string, number>, q: Readonly<Record<string, number>>) => {
      for (const [id, n] of Object.entries(q)) to[id] = (to[id] ?? 0) + n;
    };
    for (const e of events) {
      this.pendingCounts[e.type] = (this.pendingCounts[e.type] ?? 0) + 1;
      (TICK_EVENTS.has(e.type) ? this.pendingTicks : this.pendingLog).push({ time, event: e });
      if (!body) continue;
      if (e.type === 'EXTRACTION_TICK' && e.bodyId === body) add(flows().extraction, { [e.resource]: e.amount });
      else if (e.type === 'BATCH_COMPLETED' && bodyOf(e.structureId) === body) add(flows().production, e.produced);
      else if (e.type === 'BATCH_STARTED' && bodyOf(e.structureId) === body) add(flows().consumption, e.consumed);
    }
    // keep the pending buffers bounded between flushes (×600 on the L load sends thousands per second)
    if (this.pendingTicks.length > MAX_TICKS) this.pendingTicks = this.pendingTicks.slice(-MAX_TICKS);
    if (this.pendingLog.length > MAX_LOG) this.pendingLog = this.pendingLog.slice(-MAX_LOG);
  }

  private flush(): void {
    const snap = this.game.snapshot()!;
    const time = snap.world.time;
    if (time + 1e-9 < this.since) this.reset();
    if (this.pendingLog.length) {
      const fresh = this.pendingLog.reverse();
      this.log.update((l) => [...fresh, ...l].slice(0, MAX_LOG));
      this.pendingLog = [];
    }
    if (this.pendingTicks.length) {
      const fresh = this.pendingTicks.reverse();
      this.ticks.update((l) => [...fresh, ...l].slice(0, MAX_TICKS));
      this.pendingTicks = [];
    }
    if (Object.keys(this.pendingCounts).length) {
      const add = this.pendingCounts;
      this.counts.update((c) => {
        const next = { ...c };
        for (const [k, n] of Object.entries(add)) next[k] = (next[k] ?? 0) + n;
        return next;
      });
      this.pendingCounts = {};
    }
    const body = this.game.colonyBodyId();
    const colony = body ? snap.colonies[body] : undefined;
    if (colony && time + 1e-9 >= this.nextSampleAt) {
      const s: Sample = {
        t: time,
        stock: { ...colony.storage },
        powerProduced: colony.power.produced,
        powerConsumed: colony.power.consumed,
        crewDemand: colony.crew.demand,
        crewCapacity: colony.crew.capacity,
      };
      const { samples, interval } = pushSample(this.samples(), s, this.interval(), MAX_SAMPLES);
      this.samples.set(samples);
      this.interval.set(interval);
      this.nextSampleAt = time + interval;
      this.measured.set(measuredRates(this.buckets, time, RATE_WINDOW, this.since));
    }
  }
}
