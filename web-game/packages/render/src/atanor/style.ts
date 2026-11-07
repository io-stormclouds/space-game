// Visual style of the Atanor board: DS palette (flat, square, no glow), atom fills and labels.
// Pure data and helpers; no PixiJS import.

/** Mirror of design-system tokens `color.*` (style.spec.ts guards the values). */
export const ATANOR_PALETTE = {
  void: '#0B0C10',
  hull: '#111419',
  graphite: '#1F2833',
  graphiteHi: '#2A3644',
  metal: '#3B4756',
  line: 'rgba(112, 128, 146, 0.24)',
  lineFaint: 'rgba(112, 128, 146, 0.10)',
  text: '#C5C6C7',
  textDim: '#8A939D',
  textFaint: '#58616B',
  signal: '#FFB000',
  signalDim: 'rgba(255, 176, 0, 0.14)',
  alert: '#FF5A4A',
} as const;

export type AtanorPaletteKey = keyof typeof ATANOR_PALETTE;
export type AtanorPalette = Record<AtanorPaletteKey, string>;

/** PixiJS fill/stroke colour: 0xRRGGBB and alpha. */
export interface PixiColor {
  color: number;
  alpha: number;
}

export function cssToPixi(css: string): PixiColor {
  const s = css.trim();
  let m = /^#([0-9a-f]{6})$/i.exec(s);
  if (m) return { color: parseInt(m[1]!, 16), alpha: 1 };
  m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) {
    const [r, g, b] = m[1]!.split('').map((c) => parseInt(c + c, 16));
    return { color: (r! << 16) | (g! << 8) | b!, alpha: 1 };
  }
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(s);
  if (m) {
    const c = (Math.round(Number(m[1])) << 16) | (Math.round(Number(m[2])) << 8) | Math.round(Number(m[3]));
    return { color: c, alpha: m[4] === undefined ? 1 : Number(m[4]) };
  }
  return { color: 0xffffff, alpha: 1 };
}

const CSS_VAR: Record<AtanorPaletteKey, string> = {
  void: '--hud-color-void',
  hull: '--hud-color-hull',
  graphite: '--hud-color-graphite',
  graphiteHi: '--hud-color-graphite-hi',
  metal: '--hud-color-metal',
  line: '--hud-color-line',
  lineFaint: '--hud-color-line-faint',
  text: '--hud-color-text',
  textDim: '--hud-color-text-dim',
  textFaint: '--hud-color-text-faint',
  signal: '--hud-color-signal',
  signalDim: '--hud-color-signal-dim',
  alert: '--hud-color-alert',
};

/** DS CSS variables when present (signal presets), else the token defaults. */
export function resolveAtanorPalette(read?: (cssVar: string) => string | null | undefined): AtanorPalette {
  const out = { ...ATANOR_PALETTE } as AtanorPalette;
  if (!read) return out;
  for (const key of Object.keys(CSS_VAR) as AtanorPaletteKey[]) {
    const v = read(CSS_VAR[key])?.trim();
    if (v && /^(#[0-9a-f]{3}|#[0-9a-f]{6}|rgba?\(.+\))$/i.test(v)) out[key] = v;
  }
  return out;
}

/**
 * Muted flat fills per material (PROPOSAL; the DS has no material colours). Dark enough for the
 * text colour (#C5C6C7) on top; the label carries the identity (A5: material codes).
 */
export const ATOM_FILL: Readonly<Record<string, string>> = {
  MIE: '#6A4636',
  PLA: '#525B66',
  'PLA*': '#6F7C8C',
  H2: '#2B4660',
  KRZ: '#3C5043',
  STP: '#575041',
  KOM: '#4A4A5A',
  BET: '#4D4D4D',
  HE3: '#47395E',
  DEU: '#33456A',
  KWA: '#573B53',
  'KWA*': '#77506F',
  UKL: '#3A4D59',
  // PoC teaching levels
  A: '#6A3434',
  B: '#2C5459',
  FIRE: '#6A3A2A',
  WATER: '#2B4660',
  SALT: '#5E6268',
  EARTH: '#4D4433',
  LEAD: '#454E57',
  GOLD: '#6A5A2A',
  QUICKSILVER: '#4C5763',
};

const FALLBACK_FILLS = ['#4A4A5A', '#3A4D59', '#4D4433', '#573B53', '#3C5043', '#525B66'];

export function atomFill(element: string): string {
  const known = ATOM_FILL[element];
  if (known) return known;
  let h = 0;
  for (let i = 0; i < element.length; i++) h = (h * 31 + element.charCodeAt(i)) >>> 0;
  return FALLBACK_FILLS[h % FALLBACK_FILLS.length]!;
}

/** Short labels for the alchemical PoC atoms; material codes (A5) are shown as they are. */
const POC_LABEL: Readonly<Record<string, string>> = {
  FIRE: 'FIR',
  WATER: 'H2O',
  SALT: 'SAL',
  EARTH: 'TER',
  LEAD: 'Pb',
  GOLD: 'Au',
  QUICKSILVER: 'Hg',
};

export function atomLabel(element: string): string {
  return POC_LABEL[element] ?? element;
}

/** Canvas texts (Polish defaults; the app may pass its dictionary entries). */
export interface AtanorText {
  /** Input port tag. */
  input: string;
  /** Output port tag. */
  output: string;
  /** Prefix of the jam banner (domain FAULT_CODE). */
  jam: string;
}

export const ATANOR_TEXT_PL: AtanorText = { input: 'WEJ', output: 'WYJ', jam: 'JAM' };

/** Label under an input port: tag, material code and portion per atom (H2 ×10). */
export function inputPortLabel(text: AtanorText, element: string, portion = 1): string {
  return `${text.input} ${atomLabel(element)}${portion > 1 ? ` ×${portion}` : ''}`;
}

/** Label under an output port: tag and economy product (or the pattern name, shortened). */
export function outputPortLabel(text: AtanorText, product: { material: string; quantity: number } | undefined, patternName: string): string {
  if (product) return `${text.output} ${product.material}${product.quantity > 1 ? ` ×${product.quantity}` : ''}`;
  const name = patternName.length > 12 ? `${patternName.slice(0, 11)}…` : patternName;
  return `${text.output} ${name}`;
}
