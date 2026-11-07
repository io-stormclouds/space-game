// Pure helpers of the galaxy view (no Three.js, no DOM): palette, star look, scene mapping,
// map marks from the snapshot, range rings, camera limits, label choice and picking.
// Unit of the scene: light year. Tested in plain vitest (galaxy-model.spec.ts).
import type { GameSnapshot } from '@space-game/api';
import { LY_PER_PARSEC, STARS, maxStarRadius, type Star } from '@space-game/domain';

// ---------------------------------------------------------------------------------------------
// Palette (mirror of design-system tokens `color.*`; galaxy-model.spec.ts guards the values)

export interface Rgba {
  /** sRGB components 0..1. */
  r: number;
  g: number;
  b: number;
  a: number;
}

export const GALAXY_PALETTE = {
  void: '#0B0C10',
  text: '#C5C6C7',
  textDim: '#8A939D',
  textFaint: '#58616B',
  metal: '#3B4756',
  line: 'rgba(112, 128, 146, 0.24)',
  lineFaint: 'rgba(112, 128, 146, 0.10)',
  signal: '#FFB000',
  alert: '#FF5A4A',
} as const;

export type GalaxyPaletteKey = keyof typeof GALAXY_PALETTE;
export type GalaxyPalette = Record<GalaxyPaletteKey, string>;

const CSS_VAR: Record<GalaxyPaletteKey, string> = {
  void: '--hud-color-void',
  text: '--hud-color-text',
  textDim: '--hud-color-text-dim',
  textFaint: '--hud-color-text-faint',
  metal: '--hud-color-metal',
  line: '--hud-color-line',
  lineFaint: '--hud-color-line-faint',
  signal: '--hud-color-signal',
  alert: '--hud-color-alert',
};

/**
 * Palette from the DS CSS variables when present (so `data-hud-signal="cyan"` also recolours the
 * map), else the token defaults. `read` returns the computed value of a custom property.
 */
export function resolvePalette(read?: (cssVar: string) => string | null | undefined): GalaxyPalette {
  const out = { ...GALAXY_PALETTE } as GalaxyPalette;
  if (!read) return out;
  for (const key of Object.keys(CSS_VAR) as GalaxyPaletteKey[]) {
    const v = read(CSS_VAR[key])?.trim();
    if (v && parseCssColor(v)) out[key] = v;
  }
  return out;
}

/** #RGB, #RRGGBB, rgb(), rgba() → sRGB 0..1; null when not understood. */
export function parseCssColor(css: string): Rgba | null {
  const s = css.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) {
    const h = m[1]!;
    return { r: parseInt(h[0]! + h[0], 16) / 255, g: parseInt(h[1]! + h[1], 16) / 255, b: parseInt(h[2]! + h[2], 16) / 255, a: 1 };
  }
  m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) {
    const n = parseInt(m[1]!, 16);
    return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255, a: 1 };
  }
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s);
  if (m) {
    return { r: Number(m[1]) / 255, g: Number(m[2]) / 255, b: Number(m[3]) / 255, a: m[4] === undefined ? 1 : Number(m[4]) };
  }
  return null;
}

function rgbaOf(css: string): Rgba {
  return parseCssColor(css) ?? { r: 1, g: 1, b: 1, a: 1 };
}

/** Linear mix of two sRGB colours (t = 0 → a, t = 1 → b). */
export function mixRgb(a: Rgba, b: Rgba, t: number): Rgba {
  return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t, a: 1 };
}

// ---------------------------------------------------------------------------------------------
// Star look (W14 C: flat dots, no glow)

export type SpectralType = 'O' | 'B' | 'A' | 'F' | 'G' | 'K' | 'M' | 'BD' | 'WD';
export type LuminosityClass = 'I' | 'II' | 'III' | 'IV' | 'V';

export function spectralType(spectralClass: string): SpectralType {
  const c = spectralClass.trim().charAt(0).toUpperCase();
  if (c === 'D') return 'WD';
  if (c === 'L' || c === 'T' || c === 'Y') return 'BD';
  if ('OBAFGKM'.includes(c) && c !== '') return c as SpectralType;
  return 'G';
}

/** Luminosity class of the primary (`B8Ia` → I, `K0IIIb` → III, `F5IV-V` → IV); null if absent. */
export function luminosityClass(spectralClass: string): LuminosityClass | null {
  const m = /^[OBAFGKM][0-9.]*\s*(IV|V|III|II|I)/i.exec(spectralClass.trim());
  return m ? (m[1]!.toUpperCase() as LuminosityClass) : null;
}

/** Dot size [CSS px] per spectral type: canvas board "Galaktyka" (A 10, G 9, K 7, M 5, brown 6). */
export const STAR_BASE_SIZE: Readonly<Record<SpectralType, number>> = {
  O: 10, B: 10, A: 10, F: 10, G: 9, K: 7, M: 5, BD: 6, WD: 4,
};

/** Giants and supergiants read larger (PROPOSAL; the board shows dwarfs only). */
export const LUMINOSITY_BONUS: Readonly<Record<LuminosityClass, number>> = { I: 4, II: 3, III: 2, IV: 0, V: 0 };

export type StarShape = 'disc' | 'ring';

export interface StarLook {
  size: number;
  color: Rgba;
  shape: StarShape;
}

/** Share of the catalogue colour kept after desaturating toward the DS text colours. */
export const STAR_TINT = 0.3;

export function starLook(star: Pick<Star, 'spectralClass' | 'color'>, palette: GalaxyPalette = GALAXY_PALETTE): StarLook {
  const type = spectralType(star.spectralClass);
  const lum = luminosityClass(star.spectralClass);
  const size = STAR_BASE_SIZE[type] + (lum ? LUMINOSITY_BONUS[lum] : 0);
  // Board: A/G/K dots in text colour, M and brown dwarfs dimmer.
  const base = rgbaOf(type === 'M' || type === 'BD' ? palette.textDim : palette.text);
  const color = mixRgb(base, rgbaOf(star.color), STAR_TINT);
  return { size, color, shape: type === 'BD' ? 'ring' : 'disc' };
}

// ---------------------------------------------------------------------------------------------
// Scene mapping

export type Vec3 = readonly [number, number, number];

/**
 * Domain position [pc] → scene [ly]. The board draws domain z as screen "up", so z becomes the
 * scene's Y (Three's up); (x, y, z) → (x, z, −y) is a proper rotation (no mirror).
 */
export function starScenePosition(star: Pick<Star, 'pos'>): Vec3 {
  const k = LY_PER_PARSEC;
  return [star.pos.x * k, star.pos.z * k, -star.pos.y * k];
}

export function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// ---------------------------------------------------------------------------------------------
// Map marks from the snapshot

/** FACT (W06, canvas): the default scenario lands at Tau Ceti; the PoC preset is the Solar System. */
export const SCENARIO_COLONY_STAR: Readonly<Record<string, string>> = {
  'tau-ceti': 'Tau Ceti',
  'planeta-matka': 'Sol (Sun)',
};

/** Names used elsewhere in the game for catalogue stars. */
export const STAR_ALIASES: Readonly<Record<string, string>> = {
  'słońce': 'Sol (Sun)',
  sun: 'Sol (Sun)',
  sol: 'Sol (Sun)',
};

/**
 * Catalogue star by name, case-insensitive. A system name resolves to its primary component
 * ('Alpha Centauri' → 'Alpha Centauri A': the mock and the board use system names).
 */
export function findStar(name: string | null | undefined, stars: ReadonlyArray<Star> = STARS): Star | null {
  if (!name) return null;
  const key = name.trim().toLowerCase();
  const canonical = (STAR_ALIASES[key] ?? name).trim().toLowerCase();
  return (
    stars.find((s) => s.name.toLowerCase() === canonical) ??
    stars.find((s) => s.name.toLowerCase() === `${canonical} a`) ??
    null
  );
}

export interface GalaxyMarks {
  /** Catalogue name of the player's colony star. */
  colony: string | null;
  /** Star → market hub names (Sirius A → ['Syriusz']). */
  hubs: Map<string, string[]>;
  /** Star → number of simulated players with their home colony there. */
  others: Map<string, number>;
  /** Names from the snapshot that are not in the catalogue (should stay empty). */
  unresolved: string[];
}

type MarkSource = Pick<GameSnapshot, 'scenarioId' | 'players' | 'hubs'> & { world?: Pick<GameSnapshot['world'], 'bodies'> };

/** Colony star: scenario id first, then the world's STAR body (for future scenarios). */
export function colonyStarName(snapshot: MarkSource, stars: ReadonlyArray<Star> = STARS): string | null {
  const byScenario = findStar(SCENARIO_COLONY_STAR[snapshot.scenarioId], stars);
  if (byScenario) return byScenario.name;
  const body = snapshot.world?.bodies.find((b) => b.kind === 'STAR');
  return findStar(body?.name, stars)?.name ?? null;
}

export function resolveMarks(snapshot: MarkSource, stars: ReadonlyArray<Star> = STARS): GalaxyMarks {
  const unresolved: string[] = [];
  const hubs = new Map<string, string[]>();
  for (const hub of snapshot.hubs ?? []) {
    const star = findStar(hub.star, stars);
    if (!star) {
      unresolved.push(hub.star);
      continue;
    }
    hubs.set(star.name, [...(hubs.get(star.name) ?? []), hub.name]);
  }
  const others = new Map<string, number>();
  for (const p of snapshot.players ?? []) {
    const star = findStar(p.homeStar, stars);
    if (!star) {
      unresolved.push(p.homeStar);
      continue;
    }
    others.set(star.name, (others.get(star.name) ?? 0) + 1);
  }
  return { colony: colonyStarName(snapshot, stars), hubs, others, unresolved };
}

export function marksKey(m: GalaxyMarks): string {
  const hubs = [...m.hubs.keys()].sort().join(',');
  const others = [...m.others.entries()].map(([k, v]) => `${k}:${v}`).sort().join(',');
  return `${m.colony ?? '-'}|${hubs}|${others}`;
}

// ---------------------------------------------------------------------------------------------
// Markers drawn over the stars (one Points draw call)

export type MarkerShape = 'square' | 'diamond' | 'ring' | 'brackets';

export interface Marker {
  starName: string;
  shape: MarkerShape;
  /** Outer size [CSS px]. */
  size: number;
  color: GalaxyPaletteKey;
}

/**
 * Board conventions: player colony = signal square frame (24 px), selection = signal corner
 * brackets. PROPOSAL: hub = text diamond, other player's colony = dim ring, hover = text brackets.
 */
export function buildMarkers(marks: GalaxyMarks, selected: string | null, hovered: string | null): Marker[] {
  const out: Marker[] = [];
  if (marks.colony) out.push({ starName: marks.colony, shape: 'square', size: 24, color: 'signal' });
  for (const star of marks.hubs.keys()) out.push({ starName: star, shape: 'diamond', size: 22, color: 'text' });
  for (const star of marks.others.keys()) out.push({ starName: star, shape: 'ring', size: 18, color: 'textDim' });
  if (hovered && hovered !== selected) out.push({ starName: hovered, shape: 'brackets', size: 30, color: 'text' });
  if (selected) out.push({ starName: selected, shape: 'brackets', size: 32, color: 'signal' });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Range rings

export interface RangeRing {
  id: string;
  /** Radius [ly]. */
  ly: number;
  label: string;
  edge: GalaxyPaletteKey;
  labelColor: GalaxyPaletteKey;
}

/**
 * FACT: canvas board "Galaktyka" (Mk I 5 ly in signal, Mk II 9 ly in metal) and the economy
 * catalogue ('Napęd fuzyjny Mk I (5 ly)', 'Napęd Mk II (9 ly)').
 */
export const RANGE_RINGS: readonly RangeRing[] = [
  { id: 'MK1', ly: 5, label: 'Mk I · 5 ly', edge: 'signal', labelColor: 'signal' },
  { id: 'MK2', ly: 9, label: 'Mk II · 9 ly', edge: 'metal', labelColor: 'textDim' },
];

/** Unit circle in the XY plane as line-segment pairs (for LineSegments with dashes). */
export function circleSegments(segments = 96): Float32Array {
  const out = new Float32Array(segments * 6);
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    out.set([Math.cos(a0), Math.sin(a0), 0, Math.cos(a1), Math.sin(a1), 0], i * 6);
  }
  return out;
}

/**
 * Outline of a sphere of radius `r` seen from distance `d` (perspective): a circle of radius
 * r·√(d²−r²)/d whose plane lies `offset` = r²/d from the centre toward the camera.
 * Null when the camera is inside the sphere.
 */
export function sphereSilhouette(r: number, d: number): { radius: number; offset: number } | null {
  if (!(d > r * 1.0001)) return null;
  return { radius: (r * Math.sqrt(d * d - r * r)) / d, offset: (r * r) / d };
}

/** Stars within `ly` of `from` (the Mk I list of the board), nearest first. */
export function starsWithin(from: Star, ly: number, stars: ReadonlyArray<Star> = STARS): Array<{ star: Star; ly: number }> {
  const p = starScenePosition(from);
  return stars
    .filter((s) => s !== from)
    .map((s) => ({ star: s, ly: distance(p, starScenePosition(s)) }))
    .filter((x) => x.ly <= ly)
    .sort((a, b) => a.ly - b.ly);
}

// ---------------------------------------------------------------------------------------------
// Camera

export interface CameraLimits {
  fov: number;
  near: number;
  far: number;
  minDistance: number;
  maxDistance: number;
  startDistance: number;
}

export const GALAXY_FOV = 45;

/**
 * W09 fix: the PoC far plane (5000 scene units at 16 units/pc ≈ 1019 ly) clipped Deneb.
 * Here the camera orbits `focus`; at the widest zoom every catalogue star fits the vertical field
 * of view, and the far plane reaches the farthest star from the farthest camera position.
 */
export function cameraLimits(focus: Vec3, fov = GALAXY_FOV): CameraLimits {
  const reach = Math.hypot(focus[0], focus[1], focus[2]) + maxStarRadius() * LY_PER_PARSEC;
  const half = ((fov / 2) * Math.PI) / 180;
  const maxDistance = (reach / Math.sin(half)) * 1.05;
  // Start: the Mk II ring (9 ly) plus margin fills the height, a ~22 ly neighbourhood.
  const startDistance = 11 / Math.tan(half);
  return { fov, near: 0.05, far: (maxDistance + reach) * 1.1, minDistance: 1.5, maxDistance, startDistance };
}

/** Board-like start direction (from the board's oblique projection), unit vector in scene axes. */
export const START_DIRECTION: Vec3 = (() => {
  const v: [number, number, number] = [0.37, -0.45, 0.79];
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
})();

// ---------------------------------------------------------------------------------------------
// Labels

export interface LabelRequest {
  name: string;
  marked: boolean;
}

/**
 * Which stars get a DOM label: every marked star, then the nearest to the focus within the
 * visible neighbourhood; once the camera is far out (> 150 ly), luminous stars (absolute
 * magnitude ≤ −3) come first, brightest first. At most `max` labels (marked ones always
 * included).
 */
export function selectLabels(
  stars: ReadonlyArray<Star>,
  focus: Vec3,
  cameraDistance: number,
  marked: ReadonlySet<string>,
  max = 14,
): LabelRequest[] {
  const out: LabelRequest[] = [];
  for (const s of stars) if (marked.has(s.name)) out.push({ name: s.name, marked: true });
  const reach = cameraDistance * 1.2;
  const rest = stars
    .filter((s) => !marked.has(s.name))
    .map((s) => {
      const d = distance(focus, starScenePosition(s));
      const landmark = s.absoluteMag <= -3;
      // Far out the neighbourhood collapses to a few pixels: luminous stars become the landmarks,
      // brightest first (Deneb, Rigel, Betelgeuse…); near the colony, distance decides.
      const score = landmark && cameraDistance > 150 ? -2 + s.absoluteMag / 10 : d / Math.max(cameraDistance, 1e-6) - (landmark ? 0.3 : 0);
      return { s, d, score };
    })
    .filter((x) => x.d <= reach || (x.s.absoluteMag <= -3 && cameraDistance > 150))
    .sort((a, b) => a.score - b.score || a.s.name.localeCompare(b.s.name));
  for (const x of rest) {
    if (out.length >= max) break;
    out.push({ name: x.s.name, marked: false });
  }
  return out;
}

export interface LabelBox {
  name: string;
  /** Screen position of the star (or ring top) the label belongs to. */
  ax: number;
  ay: number;
  /** Gap between the anchor and the label [px]. */
  gap: number;
  w: number;
  h: number;
  /** Marked star: shown even when every side overlaps, unless its star sits in a cluster. */
  force: boolean;
  /** Only the right-hand position (ring labels). */
  fixed?: boolean;
}

/** Candidate top-left corners: right of the anchor (board), left, above, below. */
export function labelCandidates(b: LabelBox): Array<{ x: number; y: number }> {
  const right = { x: b.ax + b.gap, y: b.ay - 5 };
  if (b.fixed) return [right];
  return [right, { x: b.ax - b.gap - b.w, y: b.ay - 5 }, { x: b.ax - b.w / 2, y: b.ay - b.gap - b.h }, { x: b.ax - b.w / 2, y: b.ay + b.gap }];
}

/** Anchors closer than this are one cluster on screen: only the first label is kept. */
export const LABEL_CLUSTER_PX = 14;

/**
 * Greedy placement in the given order. Each label takes its first free side; unforced labels
 * with no free side are dropped, forced ones take the right side anyway unless their star sits
 * within LABEL_CLUSTER_PX of an already labelled star (far zoom: the neighbourhood collapses).
 * Labels whose anchor is off-screen are dropped. Returns name -> top-left corner.
 */
export function placeLabels(boxes: ReadonlyArray<LabelBox>, width: number, height: number): Map<string, { x: number; y: number }> {
  const placed: Array<{ x: number; y: number; w: number; h: number }> = [];
  const anchors: Array<{ x: number; y: number }> = [];
  const out = new Map<string, { x: number; y: number }>();
  const hits = (x: number, y: number, w: number, h: number) => placed.some((p) => x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y);
  for (const b of boxes) {
    if (b.ax < 0 || b.ay < 0 || b.ax > width || b.ay > height) continue;
    const candidates = labelCandidates(b).filter((c) => c.x + b.w > 0 && c.y + b.h > 0 && c.x < width && c.y < height);
    let at = candidates.find((c) => !hits(c.x, c.y, b.w, b.h)) ?? null;
    if (!at && b.force && candidates.length > 0) {
      const clustered = anchors.some((a) => Math.hypot(a.x - b.ax, a.y - b.ay) < LABEL_CLUSTER_PX);
      if (!clustered) at = candidates[0]!;
    }
    if (!at) continue;
    placed.push({ x: at.x, y: at.y, w: b.w, h: b.h });
    anchors.push({ x: b.ax, y: b.ay });
    out.set(b.name, at);
  }
  return out;
}

/** Approximate label box for 10 px bold mono uppercase text with 0.1 em tracking. */
export function estimateLabelSize(name: string, tag: string | null): { w: number; h: number } {
  const ch = 7.1;
  const w = Math.max(name.length * ch, tag ? tag.length * ch * 0.95 + 12 : 0) + 4;
  return { w, h: tag ? 32 : 14 };
}

// ---------------------------------------------------------------------------------------------
// Picking

export interface ScreenStar {
  name: string;
  x: number;
  y: number;
  /** Dot radius on screen [px]. */
  r: number;
}

/** Nearest star whose dot lies within `slop` px of (x, y); null when none. */
export function pickNearest(points: ReadonlyArray<ScreenStar>, x: number, y: number, slop = 6): string | null {
  let best: string | null = null;
  let bestD = Infinity;
  for (const p of points) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d <= p.r + slop && d < bestD) {
      best = p.name;
      bestD = d;
    }
  }
  return best;
}
