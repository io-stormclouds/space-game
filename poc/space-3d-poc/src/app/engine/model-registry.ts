import { COLONY_A_ID, COLONY_B_ID, COLONY_C_ID } from '../game/config/initial-world';
import { DressKind, LinkKind, PropKind } from '../game/colony/colony-layout';
import { StructureKind } from '../game/models/structure.model';
import { BodyId } from '../shared/ids';
import { MODEL_BOUNDS } from './model-bounds';

/**
 * Which model stands for what, and how it is fitted to a tile. Pure data + math, no Three.js:
 * unit-tested in `model-registry.spec.ts`, bounds checked against the files in `model-library.spec.ts`.
 *
 * Two CC0 packs, both Y up:
 * - **KayKit Space Base Bits** (Kay Lousberg): `.gltf` + `.bin`, one shared texture atlas, 2-unit grid.
 *   Served from `public/assets/kaykit/`.
 * - **Kenney Space Kit 2.0** (kenney.nl): `.glb`, flat colours (no textures), 1-unit grid; modular kit
 *   pieces, so several buildings here are composites of a few pieces. Served from `public/assets/kenney/`.
 */
export type ModelPack = 'kaykit' | 'kenney';

export const PACK_BASES: Record<ModelPack, string> = { kaykit: '/assets/kaykit', kenney: '/assets/kenney' };

/** One file placed inside a composite model (authored units of that pack, before fitting). */
export interface ModelPart {
  pack: ModelPack;
  file: string;
  x?: number;
  y?: number;
  z?: number;
  yaw?: number;
  scale?: number;
}

export interface ModelSpec {
  /** Unique id; for a single-file model also the file name without extension. */
  file: string;
  /** Pack of a single-file model (default KayKit). Ignored when `parts` is set. */
  pack?: ModelPack;
  /** Composite model: these parts merged into one geometry. */
  parts?: ReadonlyArray<ModelPart>;
  /**
   * Recentre the merged geometry (footprint centred on the origin, lowest point at y = 0). Always on
   * for Kenney and composites; the original KayKit specs keep their authored pivot.
   */
  recenter?: boolean;
  /** Footprint (max of x/z) and height of the FLATTENED scene, from `model-library.spec.ts`. */
  footprint: number;
  height: number;
  /** Where the authored pivot sits relative to the lowest point (0 = at the base). */
  baseOffset: number;
  /** Rotation about the local up axis, radians. */
  yaw: number;
  /** Fraction of the tile width the footprint should cover. */
  fill: number;
  /** Triangle count of the file, checked by the library test. */
  triangles: number;
  /**
   * Turn the model so a corner sits on tile vertex 0 (hexagonal buildings on hexagonal tiles): the
   * value is the model's own corner angle, atan2(x, z) of one footprint corner. Unset = no alignment.
   */
  alignCorner?: number;
  /** Connectors only: the authored axis the piece runs along (stretched to span two tiles). Default z. */
  linkAxis?: 'x' | 'z';
}

export function partsOf(spec: ModelSpec): ReadonlyArray<ModelPart> {
  return spec.parts ?? [{ pack: spec.pack ?? 'kaykit', file: spec.file }];
}

/** True when the library recentres the merged geometry (see `ModelSpec.recenter`). */
export function isRecentred(spec: ModelSpec): boolean {
  return !!spec.recenter || !!spec.parts || spec.pack === 'kenney';
}

export function packOf(spec: ModelSpec): ModelPack {
  return spec.parts ? spec.parts[0].pack : (spec.pack ?? 'kaykit');
}

// ── original KayKit set (numbers verified by model-library.spec.ts) ────────────────────────────────

export const STRUCTURE_MODELS: Record<StructureKind, ModelSpec> = {
  MINE: { file: 'drill_structure', footprint: 1.75, height: 2.0, baseOffset: 0, yaw: 0, fill: 0.7, triangles: 1198 },
  ICE_EXTRACTOR: { file: 'water_storage', footprint: 2.05, height: 1.05, baseOffset: 0, yaw: 0, fill: 0.75, triangles: 326 },
  SILICITE_EXTRACTOR: { file: 'structure_tall', footprint: 1.75, height: 2.0, baseOffset: 0, yaw: 0, fill: 0.7, triangles: 670 },
  SOLAR: { file: 'roofmodule_solarpanels', footprint: 1.4, height: 0.57, baseOffset: 0.1, yaw: 0, fill: 0.7, triangles: 284 },
  WIND: { file: 'windturbine_tall', footprint: 1.67, height: 3.0, baseOffset: 0, yaw: 0, fill: 0.6, triangles: 632 },
  HABITAT: { file: 'basemodule_A', footprint: 2.25, height: 1.0, baseOffset: 0, yaw: 0, fill: 0.8, triangles: 586 },
  DEPOT: { file: 'cargodepot_A', footprint: 2.08, height: 1.12, baseOffset: 0, yaw: 0, fill: 0.8, triangles: 924 },
  LANDING_PAD: { file: 'landingpad_small', footprint: 1.9, height: 0.5, baseOffset: 0, yaw: 0, fill: 0.9, triangles: 454 },
};

/** The ship: 3.0 wide (doors), 2.3 long along the authored forward axis, pivot at the belly. */
export const SHIP_MODEL: ModelSpec = { file: 'dropship', footprint: 2.3, height: 1.3, baseOffset: 0, yaw: 0, fill: 1, triangles: 914 };

/** Surface vehicle: 0.89 long along forward, wheels at the base. */
export const ROVER_MODEL: ModelSpec = { file: 'spacetruck', footprint: 0.89, height: 0.57, baseOffset: 0.08, yaw: 0, fill: 0.45, triangles: 1118 };

/** Deposit marker. */
export const ROCK_MODEL: ModelSpec = { file: 'rocks_A', footprint: 1.64, height: 0.35, baseOffset: 0, yaw: 0, fill: 0.55, triangles: 88 };

// ── new specs: bounds come from the generated MODEL_BOUNDS table ───────────────────────────────────

type SpecInput = Omit<ModelSpec, 'footprint' | 'height' | 'baseOffset' | 'triangles' | 'yaw'> & { yaw?: number };

/** A recentred spec whose bounds are looked up in MODEL_BOUNDS (0 until generated; the test fails then). */
function spec(input: SpecInput): ModelSpec {
  const b = MODEL_BOUNDS[input.file] ?? { footprint: 0, height: 0, triangles: 0 };
  return { yaw: 0, ...input, recenter: true, baseOffset: 0, footprint: b.footprint, height: b.height, triangles: b.triangles };
}
const kenney = (file: string, fill: number, extra: Partial<SpecInput> = {}): ModelSpec => spec({ file, pack: 'kenney', fill, ...extra });
const kaykit = (file: string, fill: number, extra: Partial<SpecInput> = {}): ModelSpec => spec({ file, pack: 'kaykit', fill, ...extra });
const composite = (file: string, fill: number, parts: ModelPart[], extra: Partial<SpecInput> = {}): ModelSpec =>
  spec({ file, fill, parts, ...extra });
const k = (file: string, x = 0, y = 0, z = 0, scale = 1, yaw = 0): ModelPart => ({ pack: 'kenney', file, x, y, z, scale, yaw });
const kk = (file: string, x = 0, y = 0, z = 0, scale = 1, yaw = 0): ModelPart => ({ pack: 'kaykit', file, x, y, z, scale, yaw });

/** Kenney hexagonal hangars have corners on ±x: atan2(1, 0) = π/2. */
const HEX_X = Math.PI / 2;

const KENNEY = {
  habitatA: kenney('hangar_roundB', 0.82, { alignCorner: HEX_X }),
  habitatB: kenney('hangar_roundA', 0.82, { alignCorner: HEX_X }),
  command: composite('kenney_command', 0.84, [k('hangar_roundA'), k('satelliteDish_detailed', 0.6, 1.5, 0.2, 0.9, 2.4), k('machine_wireless', -0.7, 1.5, -0.3, 0.8)], {
    alignCorner: HEX_X,
  }),
  farm: kenney('hangar_roundGlass', 0.82, { alignCorner: HEX_X }),
  depotA: kenney('hangar_largeA', 0.72),
  depotB: kenney('hangar_largeB', 0.72),
  garageA: kenney('hangar_smallA', 0.62),
  garageB: kenney('hangar_smallB', 0.62),
  pad: composite('kenney_pad', 0.9, [k('platform_large'), k('platform_small', 0, 0.1, 0, 0.6)]),
  mine: composite('kenney_mine', 0.62, [k('structure_detailed', 0, 0, 0, 1.5), k('machine_barrelLarge', 0, 0, 0, 1.25), k('pipe_ring', 0, 1.5, 0, 0.9)]),
  ice: composite('kenney_ice', 0.72, [k('machine_barrelLarge', 0, 0, 0, 1.4), k('machine_barrel', -0.75, 0, 0.35, 1.1, 0.4), k('machine_barrel', 0.7, 0, -0.4, 1.1, 3.4)]),
  silicite: composite('kenney_silicite', 0.66, [k('chimney_detailed', 0, 0, 0, 1.1), k('rock_crystalsLargeA', 0.55, 0, 0.1, 1.2), k('rock_crystals', -0.5, 0, 0.35, 1.0, 1.2)]),
  solar: kenney('machine_generatorLarge', 0.62),
  power: composite('kenney_power', 0.66, [k('machine_generator', -0.45, 0, 0), k('machine_generator', 0.45, 0, 0.1, 1, Math.PI), k('chimney', 0, 0, -0.55, 1.2)]),
  comms: kenney('satelliteDish_large', 0.6),
  defense: kenney('turret_double', 0.48),
  defenseB: kenney('turret_single', 0.42),
  storage: composite('kenney_storage', 0.58, [k('barrels', -0.3, 0, -0.1), k('barrels', 0.32, 0, 0.15, 1, 1.7), k('barrels_rail', 0, 0, 0.45, 1)]),
  launch: composite('kenney_launch', 0.6, [k('platform_large', 0, 0, 0, 1.0), k('rocket_finsA', 0, 0.1), k('rocket_fuelA', 0, 0.8), k('rocket_sidesA', 0, 1.3), k('rocket_topA', 0, 2.3)]),
  crewA: kenney('astronautA', 0.1),
  crewB: kenney('astronautB', 0.1),
  barrels: kenney('barrels', 0.15),
  barrel: kenney('barrel', 0.06),
  rover: kenney('rover', 0.14),
  dish: kenney('satelliteDish', 0.16),
  wireless: kenney('machine_wireless', 0.16),
  rocksA: kenney('rocks_smallA', 0.34),
  rocksB: kenney('rocks_smallB', 0.3),
  crater: kenney('crater', 0.4),
  craterLarge: kenney('craterLarge', 0.5),
  boulderA: kenney('rock_largeA', 0.3),
  boulderB: kenney('rock_largeB', 0.3),
  crystals: kenney('rock_crystals', 0.28),
  crystalsLarge: kenney('rock_crystalsLargeA', 0.3),
  corridor: kenney('corridor', 0.17),
  pipe: kenney('pipe_straight', 0.07),
  deposit: kenney('rocks_smallA', 0.5),
};

const KAYKIT = {
  habitatB: kaykit('basemodule_B', 0.8),
  command: kaykit('basemodule_D', 0.84),
  farm: kaykit('space_farm_large', 0.82),
  eco: kaykit('eco_module', 0.62),
  depotB: kaykit('cargodepot_B', 0.8),
  garage: kaykit('basemodule_garage', 0.8),
  comms: kaykit('lights', 0.46),
  defense: kaykit('structure_low', 0.55),
  storage: kaykit('containers_A', 0.62),
  storageB: kaykit('cargo_A_stacked', 0.55),
  launch: composite('kaykit_launch', 0.72, [kk('lander_base'), kk('lander_A', 0, 0.35)]),
  cargo: kaykit('cargo_A_packed', 0.16),
  containers: kaykit('containers_B', 0.18),
  truck: kaykit('spacetruck', 0.2),
  rocksB: kaykit('rocks_B', 0.36),
  rockA: kaykit('rock_A', 0.3),
  rockB: kaykit('rock_B', 0.3),
  corridor: kaykit('tunnel_straight_A', 0.2, { linkAxis: 'x' }),
  pipe: kaykit('tunnel_straight_B', 0.09, { linkAxis: 'x' }),
};

// ── themes ─────────────────────────────────────────────────────────────────────────────────────────

export type ThemeId = 'KAYKIT' | 'KENNEY' | 'MIXED';

export interface ModelTheme {
  id: ThemeId;
  name: string;
  /** What the build bar builds on a body of this theme. */
  structures: Record<StructureKind, ModelSpec>;
  /** Colony dressing; several entries = variants, picked per tile. Empty = the pack has nothing for it. */
  dressing: Record<DressKind, ReadonlyArray<ModelSpec>>;
  props: Record<PropKind, ReadonlyArray<ModelSpec>>;
  links: Record<LinkKind, ModelSpec>;
  /** Deposit marker. */
  deposit: ModelSpec;
}

const KAYKIT_STRUCTURES = STRUCTURE_MODELS;

const KENNEY_STRUCTURES: Record<StructureKind, ModelSpec> = {
  MINE: KENNEY.mine,
  ICE_EXTRACTOR: KENNEY.ice,
  SILICITE_EXTRACTOR: KENNEY.silicite,
  SOLAR: KENNEY.solar,
  WIND: KENNEY.power,
  HABITAT: KENNEY.habitatA,
  DEPOT: KENNEY.depotA,
  LANDING_PAD: KENNEY.pad,
};

/** Mixed: each kind from the pack that has the better (or the only) model for it. */
const MIXED_STRUCTURES: Record<StructureKind, ModelSpec> = {
  MINE: STRUCTURE_MODELS.MINE,
  ICE_EXTRACTOR: STRUCTURE_MODELS.ICE_EXTRACTOR,
  SILICITE_EXTRACTOR: KENNEY.silicite,
  SOLAR: STRUCTURE_MODELS.SOLAR,
  WIND: STRUCTURE_MODELS.WIND,
  HABITAT: KENNEY.habitatA,
  DEPOT: KENNEY.depotA,
  LANDING_PAD: STRUCTURE_MODELS.LANDING_PAD,
};

function dressingOf(structures: Record<StructureKind, ModelSpec>, extra: Partial<Record<DressKind, ReadonlyArray<ModelSpec>>>): Record<DressKind, ReadonlyArray<ModelSpec>> {
  const base = Object.fromEntries(Object.entries(structures).map(([kind, s]) => [kind, [s]])) as unknown as Record<StructureKind, ReadonlyArray<ModelSpec>>;
  return { COMMAND: [], GARAGE: [], COMMS: [], DEFENSE: [], FARM: [], STORAGE: [], LAUNCH: [], ...base, ...extra };
}

export const THEMES: Record<ThemeId, ModelTheme> = {
  KAYKIT: {
    id: 'KAYKIT',
    name: 'KayKit Space Base Bits',
    structures: KAYKIT_STRUCTURES,
    dressing: dressingOf(KAYKIT_STRUCTURES, {
      HABITAT: [STRUCTURE_MODELS.HABITAT, KAYKIT.habitatB],
      DEPOT: [STRUCTURE_MODELS.DEPOT, KAYKIT.depotB],
      COMMAND: [KAYKIT.command],
      GARAGE: [KAYKIT.garage],
      COMMS: [KAYKIT.comms],
      DEFENSE: [KAYKIT.defense],
      FARM: [KAYKIT.farm, KAYKIT.eco],
      STORAGE: [KAYKIT.storage, KAYKIT.storageB],
      LAUNCH: [KAYKIT.launch],
    }),
    props: {
      CREW: [],
      CARGO: [KAYKIT.cargo, KAYKIT.containers],
      VEHICLE: [KAYKIT.truck],
      ANTENNA: [], // KayKit has no small antenna
      ROCKS: [KAYKIT.rocksB],
      CRATER: [KAYKIT.rockA],
      BOULDER: [KAYKIT.rockB],
      CRYSTALS: [],
    },
    links: { CORRIDOR: KAYKIT.corridor, PIPE: KAYKIT.pipe },
    deposit: ROCK_MODEL,
  },
  KENNEY: {
    id: 'KENNEY',
    name: 'Kenney Space Kit',
    structures: KENNEY_STRUCTURES,
    dressing: dressingOf(KENNEY_STRUCTURES, {
      HABITAT: [KENNEY.habitatA, KENNEY.habitatB],
      DEPOT: [KENNEY.depotA, KENNEY.depotB],
      COMMAND: [KENNEY.command],
      GARAGE: [KENNEY.garageA, KENNEY.garageB],
      COMMS: [KENNEY.comms],
      DEFENSE: [KENNEY.defense, KENNEY.defenseB],
      FARM: [KENNEY.farm],
      STORAGE: [KENNEY.storage],
      LAUNCH: [KENNEY.launch],
    }),
    props: {
      CREW: [KENNEY.crewA, KENNEY.crewB],
      CARGO: [KENNEY.barrels, KENNEY.barrel],
      VEHICLE: [KENNEY.rover],
      ANTENNA: [KENNEY.dish, KENNEY.wireless],
      ROCKS: [KENNEY.rocksA, KENNEY.rocksB],
      CRATER: [KENNEY.crater, KENNEY.craterLarge],
      BOULDER: [KENNEY.boulderA, KENNEY.boulderB],
      CRYSTALS: [KENNEY.crystals, KENNEY.crystalsLarge],
    },
    links: { CORRIDOR: KENNEY.corridor, PIPE: KENNEY.pipe },
    deposit: KENNEY.deposit,
  },
  MIXED: {
    id: 'MIXED',
    name: 'KayKit + Kenney',
    structures: MIXED_STRUCTURES,
    dressing: dressingOf(MIXED_STRUCTURES, {
      HABITAT: [KENNEY.habitatA, KENNEY.habitatB],
      DEPOT: [KENNEY.depotA, STRUCTURE_MODELS.DEPOT],
      COMMAND: [KENNEY.command],
      GARAGE: [KAYKIT.garage],
      COMMS: [KENNEY.comms],
      DEFENSE: [KENNEY.defense],
      FARM: [KAYKIT.farm, KAYKIT.eco],
      STORAGE: [KAYKIT.storage, KENNEY.storage],
      LAUNCH: [KENNEY.launch],
    }),
    props: {
      CREW: [KENNEY.crewA, KENNEY.crewB],
      CARGO: [KAYKIT.cargo, KENNEY.barrels],
      VEHICLE: [KAYKIT.truck, KENNEY.rover],
      ANTENNA: [KENNEY.dish],
      ROCKS: [KENNEY.rocksA, KAYKIT.rocksB],
      CRATER: [KENNEY.crater, KENNEY.craterLarge],
      BOULDER: [KENNEY.boulderA, KAYKIT.rockB],
      CRYSTALS: [KENNEY.crystals, KENNEY.crystalsLarge],
    },
    links: { CORRIDOR: KENNEY.corridor, PIPE: KENNEY.pipe },
    deposit: ROCK_MODEL,
  },
};

/** Art style per body; everything not listed (home planet, moon) stays KayKit. */
export const BODY_THEMES: ReadonlyMap<BodyId, ThemeId> = new Map([
  [COLONY_A_ID, 'KAYKIT'],
  [COLONY_B_ID, 'KENNEY'],
  [COLONY_C_ID, 'MIXED'],
]);

export function themeOf(bodyId: BodyId): ModelTheme {
  return THEMES[BODY_THEMES.get(bodyId) ?? 'KAYKIT'];
}

/** Deterministic variant for a tile (and a corner, for props). */
export function pickVariant<T>(variants: ReadonlyArray<T>, tileIndex: number, salt = 0): T | null {
  if (variants.length === 0) return null;
  const h = Math.imul((tileIndex + 1) | 0, 0x9e3779b1) ^ Math.imul((salt + 7) | 0, 0x85ebca6b);
  return variants[((h >>> 0) % variants.length) | 0];
}

/** Every distinct spec any theme (or the ship/rover) uses. */
export const ALL_MODELS: ReadonlyArray<ModelSpec> = (() => {
  const seen = new Map<string, ModelSpec>();
  const add = (s: ModelSpec) => seen.set(s.file, s);
  [...Object.values(STRUCTURE_MODELS), SHIP_MODEL, ROVER_MODEL, ROCK_MODEL].forEach(add);
  for (const t of Object.values(THEMES)) {
    Object.values(t.structures).forEach(add);
    Object.values(t.dressing).forEach((list) => list.forEach(add));
    Object.values(t.props).forEach((list) => list.forEach(add));
    Object.values(t.links).forEach(add);
    add(t.deposit);
  }
  return [...seen.values()];
})();

/** Uniform scale so the model's footprint covers `fill` of a tile of the given width. */
export function fitScale(spec: ModelSpec, tileWidth: number): number {
  return (tileWidth * spec.fill) / spec.footprint;
}

/** Vertical lift (in scaled units) that puts the model's lowest point on the tile surface. */
export function baseLift(spec: ModelSpec, scale: number): number {
  return spec.baseOffset * scale;
}

export function partUrl(base: string, part: ModelPart): string {
  return `${base.replace(/\/$/, '')}/${part.file}.${part.pack === 'kenney' ? 'glb' : 'gltf'}`;
}

/** URL of a single-file model. */
export function modelUrl(base: string, spec: ModelSpec): string {
  return partUrl(base, partsOf(spec)[0]);
}
