// Pure helpers of the designer panel (F6): time series, axis ticks, measured rates. No Angular.

/** One sample of the colony, taken every `interval` model minutes. */
export interface Sample {
  /** Game time [min]. */
  t: number;
  stock: Readonly<Record<string, number>>;
  powerProduced: number;
  powerConsumed: number;
  crewDemand: number;
  crewCapacity: number;
}

/** Keeps at most `max` samples: when full, drops every other one and doubles the interval. */
export function pushSample(samples: readonly Sample[], s: Sample, interval: number, max: number): { samples: Sample[]; interval: number } {
  const next = [...samples, s];
  if (next.length <= max) return { samples: next, interval };
  return { samples: next.filter((_, i) => i % 2 === 0 || i === next.length - 1), interval: interval * 2 };
}

/** Round axis ticks from 0 to at least `max` (1, 2, 2.5, 5 × 10^n steps). */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw)!;
  const ticks: number[] = [];
  for (let v = 0; v < max + step * 0.999; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

/** Flows of one model minute on the colony body, from events. */
export interface Bucket {
  minute: number;
  extraction: Record<string, number>;
  production: Record<string, number>;
  consumption: Record<string, number>;
}

export interface MeasuredRates {
  /** Minutes the rates average over. */
  window: number;
  extraction: Record<string, number>;
  production: Record<string, number>;
  consumption: Record<string, number>;
}

/** Mean rate per minute over the last `window` whole minutes before `now` (fewer at the start). */
export function measuredRates(buckets: ReadonlyArray<Bucket>, now: number, window: number, since: number): MeasuredRates {
  const end = Math.floor(now);
  const start = Math.max(Math.floor(since), end - window);
  const span = end - start;
  const out: MeasuredRates = { window: span, extraction: {}, production: {}, consumption: {} };
  if (span <= 0) return out;
  for (const b of buckets) {
    if (b.minute < start || b.minute >= end) continue;
    for (const k of ['extraction', 'production', 'consumption'] as const) {
      for (const [id, q] of Object.entries(b[k])) out[k][id] = (out[k][id] ?? 0) + q / span;
    }
  }
  return out;
}

/** "06:30" on day 1, "D3 06:30" later (chart axes and the event log). */
export function timeLabel(minutes: number): string {
  const total = Math.floor(minutes);
  const day = Math.floor(total / 1440) + 1;
  const hm = `${String(Math.floor((total % 1440) / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  return day > 1 ? `D${day} ${hm}` : hm;
}

/** Relative difference of `current` vs `doc` in %, null when both are 0 or doc is 0. */
export function diffPct(doc: number, current: number): number | null {
  if (doc === current) return 0;
  if (doc === 0) return null;
  return ((current - doc) / Math.abs(doc)) * 100;
}

const PL = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 });
const PL3 = new Intl.NumberFormat('pl-PL', { maximumSignificantDigits: 3 });

/** Polish number: up to 2 decimals, or 3 significant digits for small values. */
export function num(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return Math.abs(n) > 0 && Math.abs(n) < 0.1 ? PL3.format(n) : PL.format(n);
}

/** "+12,5%", "−3%", "0%", or "—". */
export function pct(p: number | null): string {
  if (p === null) return '—';
  if (Math.abs(p) < 0.05) return '0%';
  const s = PL.format(Math.round(Math.abs(p) * 10) / 10);
  return `${p > 0 ? '+' : '−'}${s}%`;
}
