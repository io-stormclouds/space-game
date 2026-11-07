// Colours of the system/planet scene (W14 C: limited palette, flat shading, vector overlays, no glow).
// Pure data and colour math, no Three.js: unit-tested in `palette.spec.ts`.

/** Design-system tokens (design-system/src/tokens/design-tokens.ts) as numbers for Three.js. */
export const DS = {
  void: 0x0b0c10,
  hull: 0x111419,
  graphite: 0x1f2833,
  graphiteHi: 0x2a3644,
  metal: 0x3b4756,
  text: 0xc5c6c7,
  textDim: 0x8a939d,
  textFaint: 0x58616b,
  /** The only accent: selection and important data. */
  signal: 0xffb000,
  /** Critical / invalid only. */
  alert: 0xff5a4a,
} as const;

/** Roles in the scene. Signal and alert appear only where the DS allows them. */
export const SCENE = {
  background: DS.void,
  ambient: 0xffffff,
  orbit: DS.metal,
  orbitFocus: DS.textFaint,
  gridEdge: DS.void,
  flightPath: DS.textDim,
  flightPathSelected: DS.signal,
  selection: DS.signal,
  hover: DS.textDim,
  placementValid: DS.signal,
  placementInvalid: DS.alert,
  site: DS.textDim,
  unknownBody: DS.graphiteHi,
  starfield: DS.textFaint,
  marker: DS.text,
  label: DS.textDim,
  labelFocus: DS.text,
  placeholder: DS.metal,
} as const;

/** Deposit tints by material code: muted, distinct, never the signal or alert colour. */
export const DEPOSIT_TINTS: Readonly<Record<string, number>> = {
  FER: 0x7a5c4c, // iron oxide
  SIL: 0x9c9a86, // sand
  KRI: 0x6e8fa3, // ice
  KAR: 0x3c3f44, // carbon
  KUP: 0x5f8270, // malachite
  TYT: 0x7c7a96, // titanium violet-grey
  URA: 0x7f8a4e, // olive
  PLA: 0xa7adb4, // platinum
  HE3: 0x6a7fa0,
  DEU: 0x5a7090,
  KWA: 0x7a6390,
};

/** Unknown codes (and regolith) stay neutral. */
export const NEUTRAL_DEPOSIT = DS.textFaint;

export function depositTint(code: string | null | undefined): number {
  return (code && DEPOSIT_TINTS[code]) || NEUTRAL_DEPOSIT;
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function hexToRgb(hex: number): Rgb {
  return { r: ((hex >> 16) & 255) / 255, g: ((hex >> 8) & 255) / 255, b: (hex & 255) / 255 };
}

export function rgbToHex(c: Rgb): number {
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (ch(c.r) << 16) | (ch(c.g) << 8) | ch(c.b);
}

export function cssHex(hex: number): string {
  return `#${hex.toString(16).padStart(6, '0')}`;
}

export function mixHex(a: number, b: number, t: number): number {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return rgbToHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
}

/** HSL saturation 0..1. */
export function saturation(hex: number): number {
  const { r, g, b } = hexToRgb(hex);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return 0;
  const d = max - min;
  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}

/** Relative luminance (sRGB weights, no gamma), 0..1. */
export function luma(hex: number): number {
  const { r, g, b } = hexToRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Body colour in the limited palette: the scenario hue kept as a hint, pulled towards grey and the
 * DS metal so planets read as part of the HUD, not as saturated balls.
 */
export function muteBodyColor(hex: number): number {
  const l = luma(hex);
  const grey = rgbToHex({ r: l, g: l, b: l });
  return mixHex(mixHex(hex, grey, 0.55), DS.metal, 0.25);
}

/** The star: a flat warm disc pulled towards the DS text colour (no glow, W14). */
export function muteStarColor(hex: number): number {
  return mixHex(hex, DS.text, 0.45);
}

// KayKit "Space Base Bits" share one 1024² atlas of 8 × 4 gradient swatches (128 px each). The
// models are recoloured per vertex from their UVs into these tones, so no texture is loaded.

export const MODEL_TONES = {
  dark: 0x1a1f26,
  graphite: DS.graphite,
  metal: DS.metal,
  steel: DS.textFaint,
  dim: DS.textDim,
  light: DS.text,
  /** Muted warm for the orange/red/yellow swatches (stripes, lights); far from the signal amber. */
  warm: 0x6f6450,
  /** Muted cool for blue/green swatches (glass, solar cells). */
  cool: 0x34506a,
} as const;

const T = MODEL_TONES;

/** Row-major, row 0 = top of the image = glTF v ∈ [0, 0.25). */
export const ATLAS_TONES: ReadonlyArray<number> = [
  // near-black, white, light grey, dark grey, black-grey, grey-blue, brown, orange
  T.dark, T.light, T.dim, T.metal, T.graphite, T.dim, T.warm, T.warm,
  // light blue, blue, steel blue, yellow-orange, red, beige, warm grey, orange-red
  T.cool, T.cool, T.metal, T.warm, T.warm, T.dim, T.steel, T.warm,
  // yellow, teal, green, dark green, white→black, cream, orange→magenta, salmon
  T.warm, T.cool, T.cool, T.metal, T.dim, T.light, T.warm, T.warm,
  // taupe (2 cells), yellow-orange, white→black, blue, blue, solar cells (2 cells)
  T.steel, T.steel, T.warm, T.dim, T.cool, T.cool, T.cool, T.cool,
];

export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 4;

const frac = (x: number) => x - Math.floor(x);

/** Swatch index (0..31) of a texture coordinate, wrapping outside [0, 1). */
export function atlasCell(u: number, v: number): number {
  const col = Math.min(ATLAS_COLS - 1, Math.floor(frac(u) * ATLAS_COLS));
  const row = Math.min(ATLAS_ROWS - 1, Math.floor(frac(v) * ATLAS_ROWS));
  return row * ATLAS_COLS + col;
}

/** Tone of the swatch under (u, v). */
export function atlasTone(u: number, v: number): number {
  return ATLAS_TONES[atlasCell(u, v)]!;
}

/** Brightness factor that keeps the swatch's vertical gradient: lighter at the top of a cell. */
export function atlasShade(v: number): number {
  const inCell = frac(frac(v) * ATLAS_ROWS);
  return 1.15 - 0.35 * inCell;
}
