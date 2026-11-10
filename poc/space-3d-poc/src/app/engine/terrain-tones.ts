import { TerrainKind } from '../game/terrain/terrain-types';

/**
 * Muted palette of the hex kit (KayKit colours pulled 40 % towards grey and 20 % towards metal, see
 * docs/planet-terrain-design.md §4.7). Models carry no textures: colour is chosen by material name.
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
} as const;

const GROUND: Record<TerrainKind, number> = {
  grass: TONE.grass,
  forest: TONE.grass,
  rock: TONE.rock,
  snow: TONE.snow,
  water: TONE.water,
};

/** Colour of a tile material on a tile of the given class (`Green` is the top surface of every class). */
export function groundTone(mat: string, kind: TerrainKind): number {
  switch (mat) {
    case 'Green':
      return GROUND[kind];
    case 'Water':
      return TONE.water;
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

/** Colour of a decor model material (trees, rocks, buildings). */
export function objectTone(mat: string): number {
  switch (mat) {
    case 'Stone':
      return TONE.stone;
    case 'StoneDark':
      return TONE.stoneDark;
    case 'BrownDark':
    case 'WoodDark':
      return TONE.soil;
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
      return TONE.forest;
    case 'Green':
      return TONE.grass;
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
