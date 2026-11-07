import { STAR_DATA, type StarData } from './stars.data';

export type { StarData };

/** Light years in one parsec. */
export const LY_PER_PARSEC = 3.26156;

/** Star with a position consistent with its distance. */
export interface Star extends StarData {
  /** Position in parsecs from Sol: direction from the source x, y, z; length = distance / 3.26156. */
  pos: { x: number; y: number; z: number };
  /** |x, y, z| of the source data in light years, before W10 (for the register). */
  sourceDistance: number;
}

/**
 * W10 A: for part of the 41 stars the distance computed from x, y, z disagrees with `distance`
 * (Vega about 41 ly vs 25.04 ly, Deneb about 1650 vs 2615 ly). The economy doc reads `distance`
 * (starship range), so it stays authoritative: keep the direction, rescale the vector.
 */
export function normalizeStar(s: StarData): Star {
  const len = Math.hypot(s.x, s.y, s.z);
  const sourceDistance = len * LY_PER_PARSEC;
  if (len === 0 || s.distance <= 0) return { ...s, pos: { x: 0, y: 0, z: 0 }, sourceDistance };
  const k = s.distance / LY_PER_PARSEC / len;
  return { ...s, pos: { x: s.x * k, y: s.y * k, z: s.z * k }, sourceDistance };
}

/** The 41 stars of the galaxy PoC (source: poc/space-galaxy-poc, stars.data.ts), positions made consistent. */
export const STARS: ReadonlyArray<Star> = STAR_DATA.map(normalizeStar);

/** Stars whose source coordinates were off by more than `tolerance` (relative). */
export function inconsistentSourceStars(tolerance = 0.05): Star[] {
  return STARS.filter((s) => s.distance > 0 && Math.abs(s.sourceDistance - s.distance) / s.distance > tolerance);
}

/** Distance between two stars [ly]. */
export function lightYearsBetween(a: Star, b: Star): number {
  return Math.hypot(a.pos.x - b.pos.x, a.pos.y - b.pos.y, a.pos.z - b.pos.z) * LY_PER_PARSEC;
}

/** Farthest star from Sol [pc]; the galaxy camera's far plane must reach beyond it (W09: Deneb). */
export function maxStarRadius(): number {
  return Math.max(...STARS.map((s) => Math.hypot(s.pos.x, s.pos.y, s.pos.z)));
}
