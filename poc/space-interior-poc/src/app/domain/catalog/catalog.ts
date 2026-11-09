import { MODELS, type ModelId, type ModelInfo } from './models';
import type {
  CatalogEntry,
  CategoryId,
  CategoryInfo,
  LightSpec,
  Placement,
  RoomTypeId,
  ShipStats,
  Variant,
} from './catalog.types';

/**
 * Editor semantics of the Molten Maps SciFi kit: which model is a floor, a wall, a door, a
 * piece of furniture… and how it snaps. Geometry numbers come from the generated table;
 * this file only says what each model MEANS. Labels are Polish (UI language).
 */

export const CATEGORIES: readonly CategoryInfo[] = [
  { id: 'floors', label: 'Podłogi', group: 'build' },
  { id: 'walls', label: 'Ściany', group: 'build' },
  { id: 'doors', label: 'Drzwi', group: 'build' },
  { id: 'windows', label: 'Szkło', group: 'build' },
  { id: 'structure', label: 'Konstrukcja', group: 'build' },
  { id: 'vertical', label: 'Schody i windy', group: 'build' },
  { id: 'command', label: 'Mostek i odprawy', group: 'furnish' },
  { id: 'crew', label: 'Kwatery', group: 'furnish' },
  { id: 'engineering', label: 'Maszynownia', group: 'furnish' },
  { id: 'medical', label: 'Ambulatorium', group: 'furnish' },
  { id: 'hydroponics', label: 'Hydroponika', group: 'furnish' },
  { id: 'mess', label: 'Mesa', group: 'furnish' },
  { id: 'wall-mounts', label: 'Na ścianę', group: 'furnish' },
  { id: 'lighting', label: 'Oświetlenie', group: 'furnish' },
  { id: 'decor', label: 'Drobiazgi', group: 'furnish' },
];

const SW = {
  blue: '#2f7fc1',
  green: '#3fae5a',
  grey: '#8a939d',
  orange: '#ee8a2a',
  red: '#d9473d',
  purple: '#9a55c9',
  white: '#e9ecef',
  off: '#2b3138',
  clear: '#bfe3ee',
  metal: '#b9c0c7',
} as const;

const COLOR_LABEL: Record<string, string> = {
  Blue: 'Niebieski',
  Green: 'Zielony',
  Grey: 'Szary',
  Orange: 'Pomarańczowy',
  Red: 'Czerwony',
  Purple: 'Fioletowy',
  White: 'Biały',
  Off: 'Wyłączony',
  Clear: 'Przezroczysty',
};

const SWATCH_OF: Record<string, string> = {
  Blue: SW.blue,
  Green: SW.green,
  Grey: SW.grey,
  Orange: SW.orange,
  Red: SW.red,
  Purple: SW.purple,
  White: SW.white,
  Off: SW.off,
  Clear: SW.clear,
};

type VariantSpec = readonly [key: string, label: string, model: ModelId, swatch: string, stats?: Partial<ShipStats>];

/** Colour variants from a model-name pattern, e.g. colors('Wall_{c}', ['Blue', 'Red']). */
function colors(pattern: string, names: readonly string[], stats?: (c: string) => Partial<ShipStats> | undefined): VariantSpec[] {
  return names.map((c) => [
    c.toLowerCase(),
    COLOR_LABEL[c] ?? c,
    pattern.replace('{c}', c) as ModelId,
    SWATCH_OF[c] ?? SW.grey,
    stats?.(c),
  ]);
}

interface EntrySpec {
  readonly id: string;
  readonly label: string;
  readonly category: CategoryId;
  readonly placement: Placement;
  readonly variants: readonly VariantSpec[];
  readonly hint?: string;
  readonly tags?: Partial<Record<RoomTypeId, number>>;
  readonly stats?: Partial<ShipStats>;
  readonly light?: LightSpec;
}

/** Light colours of colour variants (screens, lamps). */
const LIGHT_COLOR: Record<string, number> = {
  blue: 0x4aa3ff,
  green: 0x4dff8f,
  red: 0xff4433,
  orange: 0xff9433,
  purple: 0xbb66ff,
  white: 0xe6f2ff,
  grey: 0xcfd8e0,
};
const WARM = 0xffe6c4;
const COOL = 0xdde8ff;

const FIVE = ['Blue', 'Green', 'Grey', 'Orange', 'Red'] as const;
const SIX = ['Blue', 'Green', 'Grey', 'Orange', 'Purple', 'Red'] as const;
const SCREENS = ['Off', 'Blue', 'Green', 'Orange', 'Purple', 'Red'] as const;
const floor1: Placement = { kind: 'floor', size: 1 };
const stairs: Placement = { kind: 'floor', size: 1, noObjects: true, connector: 'stairs' };
const STAIRS_HINT = 'Wejście od frontu, szczyt pokład wyżej; R obraca. Robi otwór i barierki piętro wyżej';
const floor2: Placement = { kind: 'floor', size: 2 };
const onFloor: Placement = { kind: 'object', layer: 'floor' };
const onSurface: Placement = { kind: 'object', layer: 'surface' };
const table: Placement = { kind: 'object', layer: 'floor', surfaceHeight: 0.92 };
const screenPower = (c: string) => (c === 'Off' ? { power: 0 } : undefined);

const SPECS: readonly EntrySpec[] = [
  // ── Floors ──────────────────────────────────────────────────────────────
  {
    id: 'floor-metal',
    label: 'Podłoga metalowa',
    category: 'floors',
    placement: floor1,
    variants: [
      ['plain', 'Gładka', 'Floor_Metal_Square', SW.metal],
      ['tiles', 'Płyty', 'Floor_Tile_Metal', SW.metal],
      ['grate', 'Krata', 'Floor_Metal_Square_Grate', SW.grey],
      ['circles', 'Koła', 'Floor_Metal_Circles', SW.grey],
    ],
  },
  { id: 'floor-carpet', label: 'Wykładzina', category: 'floors', placement: floor1, variants: colors('Floor_Tile_Carpet_{c}', FIVE) },
  {
    id: 'floor-path',
    label: 'Ścieżka',
    category: 'floors',
    placement: floor1,
    hint: 'Obracaj klawiszem R',
    variants: [
      ['straight', 'Prosta', 'Floor_Mid_Path', SW.metal],
      ['corner-1', 'Narożnik A', 'Floor_Mid_Path_Corner_1', SW.metal],
      ['corner-2', 'Narożnik B', 'Floor_Mid_Path_Corner_2', SW.metal],
    ],
  },
  {
    id: 'floor-hazard',
    label: 'Strefa ostrzegawcza',
    category: 'floors',
    placement: floor1,
    tags: { engineering: 0.5 },
    variants: [
      ['a', 'Pasy A', 'Hazard_Floor_1', SW.orange],
      ['b', 'Pasy B', 'Hazard_Floor_2', SW.orange],
    ],
  },
  { id: 'floor-medbay', label: 'Posadzka medyczna', category: 'floors', placement: floor1, tags: { medbay: 0.5 }, variants: [['std', 'Standard', 'Floor_Medbay', SW.white]] },
  { id: 'floor-hydro', label: 'Podłoga uprawowa', category: 'floors', placement: floor1, tags: { hydroponics: 0.5 }, variants: [['std', 'Standard', 'Hydroponics_Floor', SW.green]] },
  { id: 'floor-medbay-large', label: 'Posadzka medyczna 2×2', category: 'floors', placement: floor2, tags: { medbay: 0.5 }, variants: [['std', 'Standard', 'Floor_Medbay_Large', SW.white]] },
  { id: 'floor-command', label: 'Posadzka mostka 2×2', category: 'floors', placement: floor2, tags: { bridge: 0.5 }, variants: [['std', 'Standard', 'Floor_Command_Large', SW.off]] },

  // ── Walls, doors, glass ─────────────────────────────────────────────────
  { id: 'wall', label: 'Ściana', category: 'walls', placement: { kind: 'edge', edge: 'wall', span: 1 }, variants: colors('Wall_{c}', FIVE) },
  { id: 'wall-tech', label: 'Ściana techniczna', category: 'walls', placement: { kind: 'edge', edge: 'wall', span: 1 }, tags: { engineering: 0.5 }, variants: [['blue', 'Niebieski', 'Wall_Blue_Greeblies', SW.blue]] },
  {
    id: 'wall-thin',
    label: 'Ściana antresoli',
    category: 'walls',
    placement: { kind: 'edge', edge: 'wall', span: 1 },
    hint: 'Cienka ściana wyższego pokładu',
    variants: colors('Wall_{c}_2nd_Floor', FIVE),
  },
  {
    id: 'wall-command',
    label: 'Ściana ekranowa 8 m',
    category: 'walls',
    placement: { kind: 'edge', edge: 'wall', span: 2 },
    tags: { bridge: 1 },
    stats: { power: -1 },
    light: { color: 0x8fe3ff, intensity: 5, height: 2.2, forward: 1.2 },
    variants: [['std', 'Standard', 'Command_Wall', SW.off]],
  },
  { id: 'door', label: 'Drzwi', category: 'doors', placement: { kind: 'edge', edge: 'door', span: 1 }, variants: colors('Wall_With_Door_{c}', FIVE) },
  {
    id: 'glass',
    label: 'Ściana szklana',
    category: 'windows',
    placement: { kind: 'edge', edge: 'glass', span: 1 },
    variants: colors('Wall_Glass_{c}', ['Clear', 'Blue', 'Green', 'Orange', 'Red']),
  },

  // ── Structure ───────────────────────────────────────────────────────────
  {
    id: 'deck-block',
    label: 'Blok pokładu',
    category: 'structure',
    placement: { kind: 'floor', size: 1, noObjects: true, raisesDeck: true },
    hint: 'Podnosi podłogę o pokład; wierzch to podłoga pokładu wyżej',
    variants: [['std', 'Metal', 'Deck_Height_Metal', SW.metal]],
  },
  {
    id: 'catwalk',
    label: 'Pomost',
    category: 'structure',
    placement: { kind: 'floor', size: 1, noObjects: true },
    hint: 'Kładka 2 m z poręczami',
    variants: [['std', 'Metal', 'Catwalk_1', SW.grey]],
  },
  { id: 'railing', label: 'Barierka', category: 'structure', placement: { kind: 'edge', edge: 'railing', span: 1 }, variants: [['std', 'Metal', 'Railing_Flat', SW.grey]] },
  { id: 'ceiling', label: 'Sufit', category: 'structure', placement: { kind: 'ceiling', size: 1 }, hint: 'Widoczny w trybie „ściany w górze” i spacerze', variants: [['std', 'Metal', 'Ceiling_Tile_Grey_Metal', SW.grey]] },

  // ── Between decks ───────────────────────────────────────────────────────
  {
    id: 'stairs',
    label: 'Schody',
    category: 'vertical',
    placement: stairs,
    hint: STAIRS_HINT,
    tags: { stairwell: 3 },
    light: { color: 'variant', intensity: 1.2, height: 1.4, reach: 5 },
    variants: [
      ['blue', 'Niebieskie', 'Stairs_Blue', SW.blue],
      ['orange', 'Pomarańczowe', 'Stairs_Orange', SW.orange],
      ['green', 'Zielone', 'Stairs_Green', SW.green],
      ['white', 'Białe', 'Stairs_White', SW.white],
    ],
  },
  { id: 'ramp', label: 'Rampa', category: 'vertical', placement: stairs, hint: STAIRS_HINT, tags: { stairwell: 3 }, variants: colors('Ramp_{c}', FIVE) },
  { id: 'ramp-wall-l', label: 'Rampa ze ścianą (L)', category: 'vertical', placement: stairs, hint: STAIRS_HINT, tags: { stairwell: 3 }, variants: colors('Ramp_Wall_{c}_L', FIVE) },
  { id: 'ramp-wall-r', label: 'Rampa ze ścianą (P)', category: 'vertical', placement: stairs, hint: STAIRS_HINT, tags: { stairwell: 3 }, variants: colors('Ramp_Wall_{c}_R', FIVE) },
  {
    id: 'lift',
    label: 'Winda',
    category: 'vertical',
    placement: { kind: 'floor', size: 1, noObjects: true, connector: 'lift' },
    hint: 'Przystanek: platforma, szklany szyb i drzwi od frontu (R obraca). Przystanki jeden nad drugim tworzą szyb',
    tags: { lift: 3 },
    stats: { power: -1 },
    light: { color: 'variant', intensity: 2.5, height: 2.4, reach: 6 },
    variants: [
      ['blue', 'Niebieska', 'Lift_Platform_Blue', SW.blue],
      ['orange', 'Pomarańczowa', 'Lift_Platform_Orange', SW.orange],
      ['green', 'Zielona', 'Lift_Platform_Green', SW.green],
      ['white', 'Biała', 'Lift_Platform_White', SW.white],
    ],
  },

  // ── Bridge & briefing ───────────────────────────────────────────────────
  { id: 'command-console', label: 'Konsola dowodzenia', category: 'command', placement: onFloor, tags: { bridge: 5 }, stats: { power: -2 }, light: { color: 0x8fe3ff, intensity: 5, height: 1.8 }, variants: [['std', 'Standard', 'Command_Console', SW.white]] },
  { id: 'orrery', label: 'Hologram układu', category: 'command', placement: onFloor, tags: { bridge: 3 }, stats: { power: -1 }, light: { color: 0xc070ff, intensity: 5, height: 2.5 }, variants: [['std', 'Standard', 'Orrery', SW.purple]] },
  { id: 'orrery-tall', label: 'Hologram układu (2 pokłady)', category: 'command', placement: onFloor, tags: { bridge: 3 }, stats: { power: -1 }, light: { color: 0xc070ff, intensity: 6, height: 3 }, variants: [['std', 'Standard', 'Orrery_Tall', SW.purple]] },
  {
    id: 'large-monitor',
    label: 'Duży monitor',
    category: 'command',
    placement: onFloor,
    tags: { bridge: 1, briefing: 1 },
    stats: { power: -0.5 },
    light: { color: 'variant', intensity: 3, height: 1.8, forward: 1.2, reach: 8 },
    variants: colors('Large_Monitor_{c}', [...SCREENS, 'White'], screenPower),
  },
  { id: 'briefing-screen', label: 'Ekran odpraw', category: 'command', placement: onFloor, tags: { briefing: 3 }, stats: { power: -0.5 }, light: { color: 'variant', intensity: 3.5, height: 2, forward: 1.4, reach: 9 }, variants: colors('Briefing_Screen_{c}', SCREENS, screenPower) },
  { id: 'meeting-table', label: 'Stół konferencyjny', category: 'command', placement: table, tags: { briefing: 3 }, variants: [['std', 'Standard', 'Meeting_Table', SW.grey]] },
  { id: 'octo-table', label: 'Stół ośmiokątny', category: 'command', placement: table, tags: { briefing: 3 }, variants: [['std', 'Standard', 'Octo_Table', SW.grey]] },
  { id: 'chair', label: 'Krzesło', category: 'command', placement: onFloor, tags: { briefing: 1, mess: 1, bridge: 0.5 }, variants: [['std', 'Standard', 'Chair_1', SW.white]] },

  // ── Crew quarters ───────────────────────────────────────────────────────
  { id: 'bunk-single', label: 'Koja', category: 'crew', placement: onFloor, tags: { quarters: 3 }, stats: { berths: 1 }, variants: colors('Bunk_Single_{c}', SIX) },
  { id: 'bunk-double', label: 'Koja piętrowa', category: 'crew', placement: onFloor, tags: { quarters: 3 }, stats: { berths: 2 }, variants: colors('Bunk_Double_{c}', SIX) },
  { id: 'sleeper', label: 'Kapsuła snu', category: 'crew', placement: onFloor, tags: { quarters: 2, medbay: 1 }, stats: { berths: 1, power: -0.5 }, light: { color: 0x9fe8ff, intensity: 1.5, height: 1.5, reach: 5 }, variants: [['std', 'Standard', 'Sleeper_Casket_Static', SW.white]] },
  { id: 'end-table', label: 'Szafka nocna', category: 'crew', placement: { kind: 'object', layer: 'floor', surfaceHeight: 0.92 }, tags: { quarters: 1 }, variants: [['std', 'Standard', 'End_Table', SW.white]] },
  {
    id: 'floor-lamp',
    label: 'Lampa stojąca',
    category: 'lighting',
    placement: { kind: 'object', layer: 'floor', pivot: 'model', footprint: [1, 1] },
    tags: { quarters: 0.5 },
    light: { color: WARM, intensity: 4, height: 1.6, reach: 7 },
    variants: [['std', 'Standard', 'Floor_Lamp', SW.white]],
  },

  // ── Engineering ─────────────────────────────────────────────────────────
  { id: 'generator', label: 'Reaktor', category: 'engineering', placement: onFloor, tags: { engineering: 5 }, stats: { power: 12 }, light: { color: 0xffa040, intensity: 7, height: 2.5 }, variants: [['std', 'Standard', 'Generator', SW.orange]] },
  { id: 'pile-large', label: 'Stos zasilający duży', category: 'engineering', placement: onFloor, tags: { engineering: 3 }, stats: { power: 5 }, light: { color: 0xffb050, intensity: 4, height: 2.2, reach: 8 }, variants: [['std', 'Standard', 'Generator_Pile_Chonky', SW.orange]] },
  { id: 'pile-small', label: 'Stos zasilający mały', category: 'engineering', placement: onFloor, tags: { engineering: 2 }, stats: { power: 2 }, light: { color: 0xffb050, intensity: 3, height: 2.2, reach: 7 }, variants: [['std', 'Standard', 'Generator_Pile_Small', SW.orange]] },
  { id: 'battery', label: 'Akumulator', category: 'engineering', placement: onFloor, tags: { storage: 2, engineering: 0.5 }, stats: { storage: 10 }, light: { color: 'variant', intensity: 0.8, height: 0.9, reach: 3 }, variants: colors('Battery_{c}', FIVE) },

  // ── Medbay ──────────────────────────────────────────────────────────────
  { id: 'biomonitor', label: 'Biomonitor', category: 'medical', placement: onFloor, tags: { medbay: 3 }, stats: { care: 1, power: -0.5 }, light: { color: 'variant', intensity: 2.5, height: 1.5, forward: 0.8, reach: 6 }, variants: colors('BioMonitor_{c}', ['Blue', 'Green', 'Red']) },
  {
    id: 'cryo-tube',
    label: 'Komora kriogeniczna',
    category: 'medical',
    placement: onFloor,
    tags: { medbay: 3 },
    light: { color: 0x7fe8ff, intensity: 3, height: 1.8, forward: 0.8, reach: 7 },
    variants: [
      ['on', 'Włączona', 'Cryo_Tube_ON', SW.clear, { care: 1, power: -1 }],
      ['off', 'Wyłączona', 'Cryo_Tube_OFF', SW.off, { care: 0 }],
    ],
  },

  // ── Hydroponics ─────────────────────────────────────────────────────────
  {
    id: 'hydro-bed',
    label: 'Grządka hydroponiczna',
    category: 'hydroponics',
    placement: onFloor,
    tags: { hydroponics: 3 },
    variants: [
      ['full', 'Obsadzona', 'Hydroponics_Full', SW.green, { food: 2, power: -0.5 }],
      ['empty', 'Pusta', 'Hydroponics_Empty', SW.grey, { food: 0 }],
    ],
  },
  { id: 'hydro-planter', label: 'Skrzynka uprawowa', category: 'hydroponics', placement: onFloor, tags: { hydroponics: 1 }, stats: { food: 0.5 }, variants: [['std', 'Standard', 'Hydroponic_Bay', SW.green]] },
  {
    id: 'hydro-lamp',
    label: 'Lampa wzrostowa',
    category: 'hydroponics',
    placement: { kind: 'object', layer: 'floor', pivot: 'model', footprint: [1, 1] },
    tags: { hydroponics: 1 },
    stats: { power: -0.5 },
    light: { color: 0xfff4d6, intensity: 4, height: 1.8, forward: 1.3, reach: 7 },
    variants: [['std', 'Standard', 'Hydroponics_Lamp', SW.white]],
  },

  // ── Mess ────────────────────────────────────────────────────────────────
  {
    id: 'cafeteria-table',
    label: 'Stół mesy',
    category: 'mess',
    placement: table,
    tags: { mess: 3 },
    variants: [
      ['plain', 'Biały', 'Cafeteria_Table', SW.white],
      ['inset', 'Z czerwonym blatem', 'Cafeteria_Table_Inset_Red', SW.red],
    ],
  },

  // ── Wall-mounted ────────────────────────────────────────────────────────
  { id: 'wall-display', label: 'Panel ścienny', category: 'wall-mounts', placement: { kind: 'object', layer: 'wall', mountY: 0 }, tags: { bridge: 0.5 }, stats: { power: -0.2 }, light: { color: 'variant', intensity: 2.5, height: 2, forward: 1, reach: 7 }, variants: colors('Wall_Display_{c}', SCREENS, screenPower) },
  { id: 'air-con', label: 'Klimatyzator', category: 'wall-mounts', placement: { kind: 'object', layer: 'wall', mountY: 3.1 }, stats: { power: -0.5 }, variants: [['std', 'Standard', 'Air_Con', SW.grey]] },
  { id: 'wall-pipe', label: 'Przyłącze rur', category: 'wall-mounts', placement: { kind: 'object', layer: 'wall', mountY: 0 }, tags: { engineering: 1 }, variants: [['std', 'Standard', 'Wall_Pipe', SW.grey]] },
  { id: 'wall-light', label: 'Kinkiet', category: 'lighting', placement: { kind: 'object', layer: 'wall', mountY: 2.7 }, light: { color: 'variant', intensity: 5, height: 2.6, forward: 1.4, reach: 10 }, variants: colors('Wall_Light_{c}', ['White', 'Blue', 'Green', 'Orange', 'Red']) },
  { id: 'wall-light-slope', label: 'Listwa świetlna', category: 'lighting', placement: { kind: 'object', layer: 'wall', mountY: 3.55 }, light: { color: COOL, intensity: 5, height: 3.2, forward: 1.4 }, variants: [['std', 'Standard', 'Wall_Light_Slope', SW.white]] },
  { id: 'ceiling-light', label: 'Lampa sufitowa', category: 'lighting', placement: { kind: 'object', layer: 'ceiling' }, light: { color: COOL, intensity: 9, height: 3.4, reach: 10 }, variants: [['std', 'Standard', 'Ceiling_Light', SW.white]] },

  // ── Decor (stands on the floor or on a table top) ───────────────────────
  { id: 'table-light', label: 'Lampka', category: 'decor', placement: onSurface, tags: { quarters: 0.5 }, light: { color: WARM, intensity: 1.5, height: 1.2, reach: 5 }, variants: [['std', 'Standard', 'Table_Light', SW.white]] },
  { id: 'lava-lamp', label: 'Lampa lava', category: 'decor', placement: onSurface, tags: { quarters: 0.5 }, light: { color: 0xc070ff, intensity: 1.2, height: 1.2, reach: 4 }, variants: [['std', 'Standard', 'Lava_Lamp', SW.purple]] },
  { id: 'chess', label: 'Szachy 3D', category: 'decor', placement: onSurface, tags: { quarters: 0.5, mess: 0.5 }, variants: [['std', 'Standard', '3D_Chess_Board', SW.off]] },
  { id: 'plant', label: 'Roślina', category: 'decor', placement: onSurface, tags: { hydroponics: 0.5 }, variants: [['std', 'Standard', 'Plant_1', SW.green]] },
  { id: 'ketchup', label: 'Keczup kosmiczny', category: 'decor', placement: onSurface, tags: { mess: 0.5 }, variants: [['std', 'Standard', 'Space_Ketchup', SW.red]] },
  { id: 'mayo', label: 'Majonez kosmiczny', category: 'decor', placement: onSurface, tags: { mess: 0.5 }, variants: [['std', 'Standard', 'Space_Mayo_Naise', SW.white]] },
];

function build(spec: EntrySpec): CatalogEntry {
  const variants: Variant[] = spec.variants.map(([key, label, model, swatch, stats]) => ({
    id: `${spec.id}/${key}`,
    key,
    label,
    model,
    swatch,
    ...(stats ? { stats } : {}),
  }));
  return {
    id: spec.id,
    label: spec.label,
    category: spec.category,
    placement: spec.placement,
    variants,
    ...(spec.hint ? { hint: spec.hint } : {}),
    ...(spec.tags ? { tags: spec.tags } : {}),
    ...(spec.stats ? { stats: spec.stats } : {}),
    ...(spec.light ? { light: spec.light } : {}),
  };
}

export const CATALOG: readonly CatalogEntry[] = SPECS.map(build);

export interface ResolvedItem {
  readonly entry: CatalogEntry;
  readonly variant: Variant;
  readonly info: ModelInfo;
}

const BY_VARIANT = new Map<string, ResolvedItem>();
const BY_ENTRY = new Map<string, CatalogEntry>();
for (const entry of CATALOG) {
  BY_ENTRY.set(entry.id, entry);
  for (const variant of entry.variants) {
    BY_VARIANT.set(variant.id, { entry, variant, info: MODELS[variant.model] });
  }
}

export const resolveItem = (variantId: string): ResolvedItem | undefined => BY_VARIANT.get(variantId);
export const entryById = (id: string): CatalogEntry | undefined => BY_ENTRY.get(id);
export const allVariants = (): IterableIterator<ResolvedItem> => BY_VARIANT.values();

/** Stats of one piece: the variant overrides the entry field by field. */
export function statsOf(item: ResolvedItem): Partial<ShipStats> {
  return { ...(item.entry.stats ?? {}), ...(item.variant.stats ?? {}) };
}

/** Light of one piece with its colour resolved; variants keyed 'off' (screens, cryo tube) give none. */
export function lightOf(item: ResolvedItem): (LightSpec & { readonly color: number }) | null {
  const l = item.entry.light;
  if (!l || item.variant.key === 'off') return null;
  return { ...l, color: l.color === 'variant' ? (LIGHT_COLOR[item.variant.key] ?? 0xe6f2ff) : l.color };
}

/** Every model the catalog uses (for loading). */
export const CATALOG_MODELS: readonly ModelId[] = [...new Set(CATALOG.flatMap((e) => e.variants.map((v) => v.model)))];

/** How a piece joins decks, if it does. */
export function connectorOf(item: ResolvedItem) {
  const p = item.entry.placement;
  return p.kind === 'floor' ? p.connector : undefined;
}
