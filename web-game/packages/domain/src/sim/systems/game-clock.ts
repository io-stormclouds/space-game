/** Real seconds per model minute at tempo ×1 (Z6: the model's time unit is one minute). */
export const SECONDS_PER_MODEL_MINUTE = 60;

/** Tempo at which the game runs like the 3D PoC (one model minute per real second). */
export const POC_TEMPO = 60;

/** Game clock in model minutes. Pausing or changing tempo never desynchronises anything. */
export class GameClock {
  private _time = 0;

  /** @param timeClamp upper bound on one real frame [s], against the spiral of death */
  constructor(private readonly timeClamp: number) {}

  get time(): number {
    return this._time;
  }

  /** Advances by min(realDelta, clamp) × tempo / 60 and returns that delta in model minutes. */
  advance(realDeltaSec: number, tempo: number): number {
    const dt = (Math.min(Math.max(realDeltaSec, 0), this.timeClamp) * tempo) / SECONDS_PER_MODEL_MINUTE;
    this._time += dt;
    return dt;
  }

  reset(t = 0): void {
    this._time = t;
  }
}
