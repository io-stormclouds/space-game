// Pure layout of the Atanor board (no PixiJS, no DOM): level lookup, board radius, hex → pixel
// fitting and hex corners. Pointy-top axial hexes as in the domain engine (grid/hex.ts).
import { Atanor } from '@space-game/domain';

type LevelConfig = Atanor.LevelConfig;
type HexCoord = Atanor.HexCoord;

/** Default recipe of the Fabryka atanorowa view (W08 A). */
export const DEFAULT_ATANOR_LEVEL = 'A_NAD';

/**
 * Level by recipe id ('A_NAD', 'A_KAT') or level id ('recipe-a-nad', 'level-1-dimer', …).
 * Short PoC aliases: 'L1'…'L4'.
 */
export function resolveAtanorLevel(id: string | null | undefined): LevelConfig | null {
  const key = (id ?? DEFAULT_ATANOR_LEVEL).trim();
  if (!key) return null;
  const poc = /^L([1-4])$/i.exec(key);
  if (poc) return Atanor.listAtanorLevels('poc')[Number(poc[1]) - 1] ?? null;
  return Atanor.findRecipeLevel(key.toUpperCase()) ?? Atanor.getAtanorLevel(key) ?? null;
}

/**
 * Every hex a level touches: ports, glyph cells, tracks, arm bases and gripper reach.
 * (The output pattern offsets are not board positions: the engine matches the molecule at the
 * output hex in any orientation.)
 */
export function levelHexes(level: LevelConfig): HexCoord[] {
  const out: HexCoord[] = [];
  for (const g of level.glyphs) out.push(...Atanor.glyphCells(g));
  for (const t of level.tracks ?? []) out.push(...t.path);
  for (const arm of level.initialArms) {
    out.push(arm.basePos);
    // The gripper sweeps the full circle around the base at the arm's length.
    for (let dir = 0; dir < 6; dir++) out.push(Atanor.hexAdd(arm.basePos, Atanor.hexScale(Atanor.hexDirection(dir), arm.length)));
  }
  return out;
}

/**
 * Board radius: the building level's board (§8.1, e.g. L1 = 19 hexes = radius 2) for recipe
 * levels, but never smaller than what the level touches (PoC levels have no building level).
 */
export function boardRadius(level: LevelConfig): number {
  const origin = { q: 0, r: 0 };
  const content = Math.max(0, ...levelHexes(level).map((h) => Atanor.hexDistance(origin, h)));
  const building = level.recipe ? Atanor.getAtanorBuildingLevel(level.recipe.buildingLevel)?.boardRadius ?? 0 : 0;
  return Math.max(2, building, content);
}

/** All hexes within `radius` of (0,0), row by row. */
export function boardHexes(radius: number): HexCoord[] {
  const out: HexCoord[] = [];
  for (let r = -radius; r <= radius; r++) {
    for (let q = Math.max(-radius, -r - radius); q <= Math.min(radius, -r + radius); q++) out.push({ q, r });
  }
  return out;
}

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface HexLayout {
  /** Hex circumradius [px]. */
  size: number;
  /** Pixel position of hex (0,0). */
  origin: { x: number; y: number };
  radius: number;
}

/**
 * Largest hex size that fits a board of `radius` (plus a margin of 0.6 hex for the jam banner
 * above the first row) into the area left by `insets`, centred in it. Size is clamped to
 * [8, 72] px.
 */
export function fitHexLayout(width: number, height: number, radius: number, insets: Insets = { top: 24, right: 24, bottom: 24, left: 24 }): HexLayout {
  const w = Math.max(1, width - insets.left - insets.right);
  const h = Math.max(1, height - insets.top - insets.bottom);
  const bySize = Math.min(w / (Math.sqrt(3) * (2 * radius + 1)), h / (3 * radius + 2 + 0.6));
  const size = Math.max(8, Math.min(72, bySize));
  return {
    size,
    origin: { x: insets.left + w / 2, y: insets.top + h / 2 + 0.3 * size },
    radius,
  };
}

export function hexToScreen(hex: HexCoord, layout: HexLayout): { x: number; y: number } {
  return Atanor.hexToPixel(hex, layout.size, layout.origin);
}

export function screenToHex(x: number, y: number, layout: HexLayout): HexCoord {
  const h = Atanor.pixelToHex({ x, y }, layout.size, layout.origin);
  return Atanor.hexCreate(h.q, h.r);
}

/** Corner points of a pointy-top hex (flat array x0, y0, x1, y1, …), `scale` of the circumradius. */
export function hexCorners(cx: number, cy: number, size: number, scale = 1): number[] {
  const pts: number[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 180) * (60 * i - 30);
    pts.push(cx + size * scale * Math.cos(a), cy + size * scale * Math.sin(a));
  }
  return pts;
}

/** Screen angle of an arm direction index: 0 = east, +60° per clockwise step (screen y down). */
export function armAngle(rotation: number): number {
  return (rotation * Math.PI) / 3;
}

/** Distance between neighbouring hex centres [px] (one arm length unit). */
export function hexStep(layout: HexLayout): number {
  return layout.size * Math.sqrt(3);
}
