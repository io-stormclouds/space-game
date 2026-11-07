export class GameClock {
  private _time = 0;

  constructor(private readonly timeClamp: number) {}

  get time(): number {
    return this._time;
  }

  /** Advances game time by min(realDelta, clamp) × timeScale and returns that game delta. */
  advance(realDeltaSec: number, timeScale: number): number {
    const dt = Math.min(Math.max(realDeltaSec, 0), this.timeClamp) * timeScale;
    this._time += dt;
    return dt;
  }

  reset(t = 0): void {
    this._time = t;
  }
}
