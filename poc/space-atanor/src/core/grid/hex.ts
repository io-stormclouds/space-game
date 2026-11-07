/**
 * Axial Hexagonal Coordinates (q, r)
 * Third coordinate s is implicitly -q - r (q + r + s = 0).
 * Pointy-topped hexagonal grid orientation.
 */

export interface HexCoord {
  readonly q: number;
  readonly r: number;
}

export interface HexCoord3D {
  readonly q: number;
  readonly r: number;
  readonly s: number;
}

function cleanZero(n: number): number {
  return n === 0 ? 0 : n;
}

export function hexCreate(q: number, r: number): HexCoord {
  return { q: cleanZero(q), r: cleanZero(r) };
}

export function hexTo3D(hex: HexCoord): HexCoord3D {
  return { q: cleanZero(hex.q), r: cleanZero(hex.r), s: cleanZero(-hex.q - hex.r) };
}

export function hexFrom3D(hex3: HexCoord3D): HexCoord {
  return { q: cleanZero(hex3.q), r: cleanZero(hex3.r) };
}

export function hexKey(hex: HexCoord): string {
  return `${cleanZero(hex.q)},${cleanZero(hex.r)}`;
}

export function hexFromKey(key: string): HexCoord {
  const parts = key.split(',').map(Number);
  return { q: cleanZero(parts[0]), r: cleanZero(parts[1]) };
}

export function hexEquals(a: HexCoord, b: HexCoord): boolean {
  return a.q === b.q && a.r === b.r;
}

export function hexAdd(a: HexCoord, b: HexCoord): HexCoord {
  return { q: cleanZero(a.q + b.q), r: cleanZero(a.r + b.r) };
}

export function hexSubtract(a: HexCoord, b: HexCoord): HexCoord {
  return { q: cleanZero(a.q - b.q), r: cleanZero(a.r - b.r) };
}

export function hexScale(hex: HexCoord, factor: number): HexCoord {
  return { q: cleanZero(hex.q * factor), r: cleanZero(hex.r * factor) };
}

export function hexDistance(a: HexCoord, b: HexCoord): number {
  const a3 = hexTo3D(a);
  const b3 = hexTo3D(b);
  return Math.max(
    Math.abs(a3.q - b3.q),
    Math.abs(a3.r - b3.r),
    Math.abs(a3.s - b3.s)
  );
}

/**
 * 6 directions in axial coordinates for pointy-topped hexes.
 * Index 0..5 in clockwise order:
 * 0: +r / South-East (or East-like)
 * 1: +r, -q / South-West
 * 2: -q / West
 * 3: -r / North-West
 * 4: -r, +q / North-East
 * 5: +q / East
 * Let's standardize with standard axial coordinate geometry:
 * Direction 0: (+1, 0)       -> E (3 o'clock)
 * Direction 1: (0, +1)       -> SE (5 o'clock)
 * Direction 2: (-1, +1)      -> SW (7 o'clock)
 * Direction 3: (-1, 0)       -> W (9 o'clock)
 * Direction 4: (0, -1)       -> NW (11 o'clock)
 * Direction 5: (+1, -1)      -> NE (1 o'clock)
 */
export const HEX_DIRECTIONS: readonly HexCoord[] = [
  { q: 1, r: 0 },   // 0: East
  { q: 0, r: 1 },   // 1: South-East
  { q: -1, r: 1 },  // 2: South-West
  { q: -1, r: 0 },  // 3: West
  { q: 0, r: -1 },  // 4: North-West
  { q: 1, r: -1 },  // 5: North-East
] as const;

export function hexDirection(dirIndex: number): HexCoord {
  const normalized = ((dirIndex % 6) + 6) % 6;
  return HEX_DIRECTIONS[normalized];
}

export function hexNeighbor(hex: HexCoord, dirIndex: number): HexCoord {
  return hexAdd(hex, hexDirection(dirIndex));
}

export function hexAllNeighbors(hex: HexCoord): HexCoord[] {
  return HEX_DIRECTIONS.map(dir => hexAdd(hex, dir));
}

/**
 * Rotate a relative coordinate 60° Clockwise around origin (0, 0).
 * In 3D cube coordinates: (q, r, s) -> (-r, -s, -q) where s = -q - r.
 * So: q' = -r, r' = -( -q - r ) = q + r, s' = -q.
 */
export function hexRotateCW(rel: HexCoord): HexCoord {
  return {
    q: cleanZero(-rel.r),
    r: cleanZero(rel.q + rel.r),
  };
}

/**
 * Rotate a relative coordinate 60° Counter-Clockwise around origin (0, 0).
 * In 3D cube coordinates: (q, r, s) -> (-s, -q, -r) where s = -q - r.
 * So: q' = q + r, r' = -q.
 */
export function hexRotateCCW(rel: HexCoord): HexCoord {
  return {
    q: cleanZero(rel.q + rel.r),
    r: cleanZero(-rel.q),
  };
}

/**
 * Rotate a coordinate around a center point by `steps` of 60°.
 * Positive steps = Clockwise, Negative steps = Counter-Clockwise.
 */
export function hexRotateAround(point: HexCoord, center: HexCoord, steps: number): HexCoord {
  const normSteps = ((steps % 6) + 6) % 6;
  if (normSteps === 0) return { ...point };

  let rel = hexSubtract(point, center);
  for (let i = 0; i < normSteps; i++) {
    rel = hexRotateCW(rel);
  }
  return hexAdd(center, rel);
}

/**
 * Convert axial hex coordinates to 2D pixel coordinates (Pointy-topped).
 * size: radius of the circumscribed circle (center to vertex).
 */
export function hexToPixel(hex: HexCoord, size: number, origin = { x: 0, y: 0 }): { x: number; y: number } {
  const x = size * (Math.sqrt(3) * hex.q + (Math.sqrt(3) / 2) * hex.r);
  const y = size * ((3 / 2) * hex.r);
  return {
    x: x + origin.x,
    y: y + origin.y,
  };
}

/**
 * Convert 2D pixel coordinate back to axial hex coordinate (with rounding).
 */
export function pixelToHex(pixel: { x: number; y: number }, size: number, origin = { x: 0, y: 0 }): HexCoord {
  const ptX = pixel.x - origin.x;
  const ptY = pixel.y - origin.y;

  const q = ((Math.sqrt(3) / 3) * ptX - (1 / 3) * ptY) / size;
  const r = ((2 / 3) * ptY) / size;
  return hexRound(q, r);
}

/**
 * Cube round fractional coordinates to nearest integer hex.
 */
export function hexRound(fracQ: number, fracR: number): HexCoord {
  const fracS = -fracQ - fracR;

  let q = Math.round(fracQ);
  let r = Math.round(fracR);
  let s = Math.round(fracS);

  const qDiff = Math.abs(q - fracQ);
  const rDiff = Math.abs(r - fracR);
  const sDiff = Math.abs(s - fracS);

  if (qDiff > rDiff && qDiff > sDiff) {
    q = -r - s;
  } else if (rDiff > sDiff) {
    r = -q - s;
  } else {
    s = -q - r;
  }

  return { q, r };
}
