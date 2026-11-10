/**
 * Tactical HUD design tokens — the single source of truth.
 *
 * Rules encoded here (see README.md):
 *  - matte black / graphite surfaces, one signal colour for important data, frames and interaction;
 *  - alert red is reserved for critical states (deficit, cap reached, hostile);
 *  - square geometry: radius 0, optional chamfered corners;
 *  - no shadows, no glows, no soft transitions: hover and press swap instantly.
 *
 * `npm run tokens` writes src/tokens/tokens.generated.css from this file;
 * `npm run tokens:check` fails when the CSS is out of date.
 */

export const color = {
  /** Screen background. */
  void: '#0B0C10',
  /** Recessed surfaces: panel bodies, empty slots, disabled fills. */
  hull: '#111419',
  /** Raised surfaces: buttons, cells. */
  graphite: '#1F2833',
  /** Hover fill. */
  graphiteHi: '#2A3644',
  /** Structural edges of controls. */
  metal: '#3B4756',
  /** 1px grid and division lines. */
  line: 'rgba(112, 128, 146, 0.24)',
  lineFaint: 'rgba(112, 128, 146, 0.10)',
  text: '#C5C6C7',
  /** Labels and secondary data — 4.6:1 on graphite, 6.1:1 on void. */
  textDim: '#8A939D',
  /** Decoration only (serial tags, rulers): fails text contrast on purpose, keep it aria-hidden. */
  textFaint: '#58616B',
  /** The only accent. Important data, frames, focus, hover, press. */
  signal: '#FFB000',
  /** Translucent signal for overlays on plain surfaces. */
  signalDim: 'rgba(255, 176, 0, 0.14)',
  /** Opaque 14% signal over graphite — selected fills (a translucent fill would show the edge layer through). */
  signalTint: '#3E3B2C',
  /** Text on a signal fill. */
  signalInk: '#0B0C10',
  /** Critical only — 4.8:1 on graphite. */
  alert: '#FF5A4A',
  alertDim: 'rgba(255, 90, 74, 0.14)',
} as const;

/** Alternative signal colours, switched with `data-hud-signal="cyan"` on any ancestor. */
export const signalPresets = {
  amber: { signal: '#FFB000', signalDim: 'rgba(255, 176, 0, 0.14)', signalTint: '#3E3B2C' },
  cyan: { signal: '#4FFFB0', signalDim: 'rgba(79, 255, 176, 0.14)', signalTint: '#264644' },
} as const;

/**
 * Muted terrain tones of the planet surfaces (PROPOSAL T-7, pending acceptance of the biome screenshots):
 * KayKit colours pulled 40 % towards the grey of equal luminance and 20 % towards `metal`, so planets
 * read as part of the HUD (docs/planet-terrain-design.md §4.7). None comes near `signal` or `alert`:
 * the warmest, `thatch`, has luminance ≈ 0.65 and saturation ≈ 0.45. The 3D renderer keeps a numeric
 * copy (`web-game/packages/render/src/system/terrain-tones.ts`) that a test holds identical to this table.
 */
export const terrain = {
  /** Grass (mixed, medieval). */
  grass: '#629A88',
  /** Tree crowns. */
  forest: '#47767A',
  /** Sand; roads in mixed and medieval; plaster. */
  sand: '#AD9A87',
  /** Dunes, dune hollows, dried lake beds. */
  dune: '#8F7D6C',
  /** Rock tiles, roofs. */
  rock: '#997C6D',
  /** Soil band, wood, trunks. */
  soil: '#765A54',
  /** Snow, white plaster. */
  snow: '#C4C6C9',
  /** Frozen lakes (winter), winter tree crowns, crystals. */
  ice: '#AEC1C8',
  /** Lake surface. */
  water: '#6AAFB8',
  /** Stone, mountains, rocks, boulders. */
  stone: '#6E757B',
  /** Dark stone, winter trunks, crater floors on regolith. */
  stoneDark: '#555C60',
  /** Grain and thatch; stands in for KayKit red (red is reserved for `alert`). */
  thatch: '#C3A562',
  /** Metal parts. */
  metal: '#969FA5',
  /** Interiors, black. */
  dark: '#31383D',
  /** Grey regolith ground (airless dry bodies). */
  regolith: '#8A8D8F',
  /** Crowns of the dry bushes. */
  olive: '#7F8763',
} as const;

export const font = {
  /** One technical face for everything; JetBrains Mono has full Polish coverage. */
  mono: '"JetBrains Mono", "IBM Plex Mono", "Cascadia Mono", Consolas, monospace',
} as const;

/** Micro-typography for dense RTS panels. Nothing below 10px. */
export const fontSize = {
  /** Serial tags, units, rates. */
  micro: '10px',
  /** Data labels above values. */
  label: '11px',
  /** Button labels, inspector text. */
  body: '12px',
  /** Resource values and other key numbers. */
  value: '14px',
  /** Panel titles. */
  title: '16px',
  /** Rare: screen titles, alerts. */
  display: '22px',
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  bold: '700',
} as const;

export const lineHeight = {
  tight: '1.1',
  normal: '1.3',
} as const;

export const tracking = {
  /** Uppercase labels. */
  label: '0.14em',
  /** Uppercase titles and button labels. */
  title: '0.08em',
  /** Numbers. */
  value: '0.02em',
} as const;

/** 2px base; 6px exists because HUD panels need tighter steps than a 4px grid. */
export const space = {
  0: '0px',
  1: '2px',
  2: '4px',
  3: '6px',
  4: '8px',
  5: '12px',
  6: '16px',
  7: '24px',
} as const;

export const stroke = {
  hair: '1px',
  heavy: '2px',
} as const;

export const shape = {
  radius: '0px',
  /** Corner cut for buttons. */
  chamfer: '6px',
  /** Corner cut for command-card cells. */
  chamferSm: '4px',
} as const;

export const size = {
  /** Minimum pointer target. */
  hit: '44px',
  /** Resource bar height. */
  bar: '44px',
  /** Command-card cell. */
  cellW: '96px',
  cellH: '72px',
  /** Corner tick length on frames. */
  tick: '8px',
} as const;

/** RTS feedback is instant. `flash` is how long a programmatic (hotkey) press stays inverted. */
export const motion = {
  instant: '0ms',
  flash: '70ms',
  blink: '1000ms',
} as const;

export const tokens = {
  color,
  terrain,
  font,
  fontSize,
  fontWeight,
  lineHeight,
  tracking,
  space,
  stroke,
  shape,
  size,
  motion,
} as const;

type Tokens = typeof tokens;
export type TokenGroup = keyof Tokens;

const PREFIX = '--hud';
const kebab = (s: string) => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
const groupName = (g: string) => kebab(g);

/** `--hud-color-graphite-hi` for (`color`, `graphiteHi`). */
export function cssVarName(group: TokenGroup, key: string): string {
  return `${PREFIX}-${groupName(group)}-${kebab(key)}`;
}

/** Typed `var(--hud-…)` references for inline styles in TS. */
export const cssVar = Object.fromEntries(
  (Object.keys(tokens) as TokenGroup[]).map((g) => [
    g,
    Object.fromEntries(Object.keys(tokens[g]).map((k) => [k, `var(${cssVarName(g, k)})`])),
  ]),
) as { [G in TokenGroup]: { [K in keyof Tokens[G]]: string } };

/** The full stylesheet written to tokens.generated.css. */
export function cssVariables(): string {
  const lines: string[] = [':root {'];
  for (const g of Object.keys(tokens) as TokenGroup[]) {
    for (const [k, v] of Object.entries(tokens[g])) lines.push(`  ${cssVarName(g, k)}: ${v};`);
  }
  lines.push('}');
  for (const [name, preset] of Object.entries(signalPresets)) {
    lines.push('', `[data-hud-signal="${name}"] {`);
    for (const [k, v] of Object.entries(preset)) lines.push(`  ${cssVarName('color', k)}: ${v};`);
    lines.push('}');
  }
  return lines.join('\n') + '\n';
}
