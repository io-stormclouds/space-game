import { Injectable, signal } from '@angular/core';
import type { RenderStats } from '@space-game/render';

export interface FrameStats {
  fps: number;
  p50: number;
  p95: number;
  p99: number;
}

const WINDOW = 120;

/** Frame timing of the render loop and the scene counters, sampled at ~4 Hz for the overlay. */
@Injectable({ providedIn: 'root' })
export class PerfService {
  readonly frames = signal<FrameStats>({ fps: 0, p50: 0, p95: 0, p99: 0 });
  readonly render = signal<RenderStats | null>(null);
  private readonly times: number[] = [];
  private last = 0;
  private lastPublish = 0;

  /** Called once per animation frame with its timestamp [ms]. */
  frame(now: number, render?: () => RenderStats | null): void {
    if (this.last) {
      this.times.push(now - this.last);
      if (this.times.length > WINDOW) this.times.shift();
    }
    this.last = now;
    if (now - this.lastPublish < 250 || this.times.length < 2) return;
    this.lastPublish = now;
    const sorted = [...this.times].sort((a, b) => a - b);
    const q = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
    const mean = this.times.reduce((s, x) => s + x, 0) / this.times.length;
    this.frames.set({ fps: 1000 / mean, p50: q(0.5), p95: q(0.95), p99: q(0.99) });
    if (render) this.render.set(render());
  }

  reset(): void {
    this.times.length = 0;
    this.last = 0;
  }
}
