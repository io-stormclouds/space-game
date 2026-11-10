import { isNatureDecor, type TerrainBasin, type TerrainKind, type TerrainPlan } from '@space-game/domain';

/**
 * Muted palette of the hex kit (KayKit colours pulled 40 % towards grey and 20 % towards metal, see
 * docs/planet-terrain-design.md §4.7). Models carry no textures: colour is chosen by material name.
 * The design system mirrors this table as the `terrain` token group (`design-tokens.ts`, T-7);
 * `terrain-tones.spec.ts` keeps the two identical.
 */
export const TONE = {
  grass: 0x629a88,
  forest: 0x47767a,
  sand: 0xad9a87,
  rock: 0x997c6d,
  soil: 0x765a54,
  snow: 0xc4c6c9,
  water: 0x6aafb8,
  stone: 0x6e757b,
  stoneDark: 0x555c60,
  thatch: 0xc3a562,
  metal: 0x969fa5,
  dark: 0x31383d,
  dune: 0x8f7d6c,
  ice: 0xaec1c8,
  regolith: 0x8a8d8f,
  /** Crowns of the dry bushes (#8f9a4a muted like the rest). */
  olive: 0x7f8763,
} as const;

const GROUND: Record<TerrainKind, number> = {
  grass: TONE.grass,
  forest: TONE.grass,
  rock: TONE.rock,
  snow: TONE.snow,
  water: TONE.water,
  sand: TONE.sand,
  dune: TONE.dune,
  ice: TONE.ice,
  regolith: TONE.regolith,
};

/** Tone of the lowered `Water` surface per basin class (T5): lakes, frozen lakes, dune hollows and dried lake beds. */
const BASIN_TONE: Record<TerrainBasin, number> = {
  water: TONE.water,
  ice: TONE.ice,
  dune: TONE.dune,
};

/**
 * Colour of a tile material on a tile of the given class (`Green` is the top surface of every class). With
 * the body's `basin` and `ground` (`TerrainPlan`, T5): the forest floor is the ground (snow in winter), and
 * the `Water` surface of a land tile (a shore bay or a pond) the basin (frozen lakes, dunes, dried lake
 * beds). A basin tile (hex_water) keeps its own tone. Without them: forest on grass, and a bay of sand or
 * regolith (only dry bodies have them) faces dunes, any other one water.
 */
export function groundTone(mat: string, kind: TerrainKind, body?: { basin: TerrainBasin; ground: TerrainKind }): number {
  switch (mat) {
    case 'Green':
      return kind === 'forest' && body ? GROUND[body.ground] : GROUND[kind];
    case 'Water':
      if (kind === 'water' || kind === 'ice' || kind === 'dune') return BASIN_TONE[kind];
      return BASIN_TONE[body?.basin ?? (kind === 'sand' || kind === 'regolith' ? 'dune' : 'water')];
    case 'Beige':
      return TONE.sand; // roads
    case 'BrownDark':
      return TONE.soil;
    case 'Brown':
      return TONE.rock;
    case 'White':
      return TONE.snow;
    default:
      return TONE.stone;
  }
}

/**
 * Ruins of the settlement against the player's own buildings (decision T-23): the same kit models,
 * so the ruins are dimmed (`RUIN_FADE`) and pulled `RUIN_GREY` of the way towards the grey of equal
 * luminance; the player's medieval skin keeps the full `objectTone`.
 */
export const RUIN_FADE = 0.8;
export const RUIN_GREY = 0.3;

/** Decor models that are buildings of the settlement (faded), not trees, rocks, mountains, craters or crystals. */
export function isRuinBuilding(model: string): boolean {
  return !isNatureDecor(model);
}

/** `hex` (sRGB) as a ruin: mixed `RUIN_GREY` towards its luminance grey, then times `RUIN_FADE`. */
export function ruinTone(hex: number): number {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round((v + (y - v) * RUIN_GREY) * RUIN_FADE)));
  return (ch(r) << 16) | (ch(g) << 8) | ch(b);
}

/** Biome and ground of the body a decor model stands on (`TerrainPlan`). */
export type DecorBody = Pick<TerrainPlan, 'biome' | 'ground'>;

/** Material names of the Kenney Space Kit decor (`assets/kenney/*.glb`) that `objectTone` maps. */
export const KENNEY_MATERIALS: ReadonlyArray<string> = ['rockTrack', 'rock', 'rockDark', 'crystal'];

/** Floor of a Kenney crater (`rockDark`) by the ground around it: a step darker than the ground. */
const CRATER_FLOOR: Partial<Record<TerrainKind, number>> = {
  sand: TONE.dune,
  regolith: TONE.stoneDark,
  snow: TONE.stone,
};

/**
 * Colour of a decor model material (trees, rocks, buildings, Kenney craters and crystals). With the
 * body (T5): in `winter` the tree crowns take the ice tone and the trunks go darker; in `dry` the
 * bushes (small trees) get olive crowns. `mixed` and `medieval` (and no body: the player's medieval
 * skin) keep the plain table.
 *
 * Kenney Space Kit materials (lower case, one warm hue in three steps and a crystal green) map onto the
 * palette: `rockTrack` (the body of a boulder) is the kit's own rock `stone`; `rock` (the base of a
 * boulder, the rim of a crater) is the body's ground, so the model sits in the ground; `rockDark` (the
 * crater floor) a step darker than that ground; `crystal` the ice tone.
 */
export function objectTone(mat: string, body?: DecorBody): number {
  const biome = body?.biome;
  switch (mat) {
    case 'rockTrack':
      return TONE.stone;
    case 'rock':
      return GROUND[body?.ground ?? 'regolith'];
    case 'rockDark':
      return CRATER_FLOOR[body?.ground ?? 'regolith'] ?? TONE.stoneDark;
    case 'crystal':
      return TONE.ice;
    case 'Stone':
      return TONE.stone;
    case 'StoneDark':
      return TONE.stoneDark;
    case 'BrownDark':
    case 'WoodDark':
      return biome === 'winter' ? TONE.stoneDark : TONE.soil;
    case 'Brown':
      return TONE.rock;
    case 'Beige':
      return TONE.sand;
    case 'White':
      return TONE.snow;
    case 'Yellow':
    case 'Red':
      return TONE.thatch; // red stays reserved for alerts
    case 'GreenDark':
      return biome === 'winter' ? TONE.ice : biome === 'dry' ? TONE.olive : TONE.forest;
    case 'Green':
      return biome === 'winter' ? TONE.ice : biome === 'dry' ? TONE.olive : TONE.grass;
    case 'Metal':
      return TONE.metal;
    case 'Black':
      return TONE.dark;
    case 'Water':
      return TONE.water;
    default:
      return TONE.stone;
  }
}
