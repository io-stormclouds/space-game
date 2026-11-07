/**
 * Amounts of materials by catalog code (FER, KRI, SIL, STA…). A missing code means 0.
 * PoC had three fixed kinds (FERRITE, CRYOL, SILICITE); they are now FER, KRI and SIL.
 */
export type MaterialCode = string;

export type Stockpile = Readonly<Record<MaterialCode, number>>;
/** A cost or a partial amount; missing codes mean 0. */
export type Cost = Stockpile;

export const emptyStockpile = (): Stockpile => ({});

export function amountOf(s: Stockpile, code: MaterialCode): number {
  return s[code] ?? 0;
}

export function addStock(a: Stockpile, b: Cost, k = 1): Stockpile {
  const out: Record<string, number> = { ...a };
  for (const [code, q] of Object.entries(b)) out[code] = (out[code] ?? 0) + q * k;
  return out;
}

/** Subtracts, clamping at zero. */
export function subtractStock(a: Stockpile, b: Cost): Stockpile {
  const out: Record<string, number> = { ...a };
  for (const [code, q] of Object.entries(b)) out[code] = Math.max(0, (out[code] ?? 0) - q);
  return out;
}

export function canAfford(a: Stockpile, cost: Cost): boolean {
  return Object.entries(cost).every(([code, q]) => (a[code] ?? 0) >= q);
}

/** What is short, per code; empty when affordable. */
export function missingFor(a: Stockpile, cost: Cost): Cost {
  const out: Record<string, number> = {};
  for (const [code, q] of Object.entries(cost)) {
    const need = q - (a[code] ?? 0);
    if (need > 0) out[code] = need;
  }
  return out;
}

export function stockTotal(a: Cost): number {
  return Object.values(a).reduce((s, q) => s + q, 0);
}

export function isEmptyStock(a: Cost): boolean {
  return stockTotal(a) <= 0;
}

/** Multiplies every amount, rounding to whole units (refunds). */
export function scaleStock(a: Cost, k: number): Stockpile {
  const out: Record<string, number> = {};
  for (const [code, q] of Object.entries(a)) {
    const v = Math.floor(q * k);
    if (v > 0) out[code] = v;
  }
  return out;
}

/** "FER 20 · SIL 10", the canvas style of costs and shortfalls. */
export function formatCost(cost: Cost): string {
  const parts = Object.entries(cost)
    .filter(([, q]) => q > 0)
    .map(([code, q]) => `${code} ${Math.ceil(q)}`);
  return parts.length ? parts.join(' · ') : '—';
}
