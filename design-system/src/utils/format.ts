// Number formatting for HUD readouts: Polish locale, fixed decimals, true minus sign.

const int = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
const one = new Intl.NumberFormat('pl-PL', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const compact = new Intl.NumberFormat('pl-PL', { notation: 'compact', maximumFractionDigits: 1 });

const MINUS = '−';

/** 1240 → "1240", 12400 → "12 400", 2 400 000 → "2,4 mln". */
export function formatQty(n: number): string {
  if (Math.abs(n) >= 1_000_000) return compact.format(n);
  return Number.isInteger(n) ? int.format(n) : one.format(n);
}

/** 6.4 → "+6,4", −0.5 → "−0,5", 0 → "±0,0". */
export function formatRate(n: number): string {
  const sign = n > 0 ? '+' : n < 0 ? MINUS : '±';
  return sign + one.format(Math.abs(n));
}

/** 21.5 → "21,5" — one decimal for loads such as energy. */
export function formatLoad(n: number): string {
  return Number.isInteger(n) ? int.format(n) : one.format(n);
}
