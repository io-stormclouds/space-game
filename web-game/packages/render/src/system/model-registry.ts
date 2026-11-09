import type { CelestialBody, StructureKind } from '@space-game/domain';

/**
 * Which KayKit model stands for what, and how it is fitted to the surface.
 * Pure data + math, no Three.js (PoC `engine/model-registry.ts`, extended to the catalog kinds).
 *
 * Two sources (CC0, Kay Lousberg), one loading path (`ModelLibrary`):
 * - `spacebits` (default): Space Base Bits, `${assetsBase}kaykit/<file>.gltf` + `.bin`, coloured
 *   from the atlas UVs; authored on a 2-unit grid, Y up;
 * - `hex`: Medieval Hexagon objects, `${assetsBase}kaykit-hex/<file>.gltf.glb`, coloured by material
 *   name (`objectTone`); authored on a hex tile 2 units flat to flat, corners on ±Z.
 * Bounds and triangle counts are of the FLATTENED geometry and `model-library.spec.ts` checks every
 * number against the files on disk.
 */
export type ModelId = SpaceBitsModelId | HexModelId;

/** Medieval Hexagon objects (player structures of the `medieval` skin). */
export type HexModelId =
  | 'archeryrange'
  | 'barracks'
  | 'castle'
  | 'farm_plot'
  | 'house'
  | 'lumbermill'
  | 'market'
  | 'mill'
  | 'mine'
  | 'watchtower'
  | 'watermill'
  | 'well';

export type SpaceBitsModelId =
  | 'basemodule_A'
  | 'basemodule_B'
  | 'basemodule_D'
  | 'basemodule_E'
  | 'basemodule_garage'
  | 'cargo_A_packed'
  | 'cargo_A_stacked'
  | 'cargodepot_A'
  | 'cargodepot_B'
  | 'cargodepot_C'
  | 'containers_A'
  | 'drill_structure'
  | 'dropship'
  | 'eco_module'
  | 'lander_base'
  | 'landingpad_large'
  | 'landingpad_small'
  | 'lights'
  | 'rocks_A'
  | 'rocks_B'
  | 'rock_A'
  | 'rock_B'
  | 'roofmodule_cargo_A'
  | 'roofmodule_solarpanels'
  | 'solarpanel'
  | 'space_farm_large'
  | 'space_farm_large_sprinkler'
  | 'space_farm_small'
  | 'spacetruck'
  | 'structure_low'
  | 'structure_tall'
  | 'terrain_mining'
  | 'tunnel_straight_B'
  | 'water_storage'
  | 'windturbine_low'
  | 'windturbine_tall';

export type ModelSource = 'spacebits' | 'hex';

export interface ModelSpec {
  file: ModelId;
  /** Kit the file comes from (loading and colouring); omitted = `spacebits`. */
  source?: ModelSource;
  /** Footprint (max of x/z; z for vehicles = length along forward) of the flattened scene. */
  footprint: number;
  height: number;
  /** Distance of the authored pivot above the lowest point (0 = pivot at the base, < 0 = below it). */
  baseOffset: number;
  /** Rotation about the local up axis applied at load time, radians. */
  yaw: number;
  /** Fraction of the target width the footprint should cover. */
  fill: number;
  triangles: number;
}

export const MODELS: Readonly<Record<ModelId, ModelSpec>> = {
  basemodule_A: { file: 'basemodule_A', footprint: 2.25, height: 1.0, baseOffset: 0, yaw: 0, fill: 0.8, triangles: 586 },
  basemodule_B: { file: 'basemodule_B', footprint: 2.32, height: 1.0, baseOffset: 0, yaw: 0, fill: 0.8, triangles: 620 },
  basemodule_D: { file: 'basemodule_D', footprint: 2.44, height: 1.0, baseOffset: 0, yaw: 0, fill: 0.85, triangles: 780 },
  basemodule_E: { file: 'basemodule_E', footprint: 2.28, height: 1.65, baseOffset: 0, yaw: 0, fill: 0.8, triangles: 732 },
  basemodule_garage: { file: 'basemodule_garage', footprint: 2.37, height: 1.0, baseOffset: 0, yaw: 0, fill: 0.8, triangles: 770 },
  cargo_A_packed: { file: 'cargo_A_packed', footprint: 0.52, height: 0.53, baseOffset: 0.01, yaw: 0, fill: 0.3, triangles: 176 },
  cargo_A_stacked: { file: 'cargo_A_stacked', footprint: 1.02, height: 1.02, baseOffset: 0.01, yaw: 0, fill: 0.6, triangles: 488 },
  cargodepot_A: { file: 'cargodepot_A', footprint: 2.08, height: 1.12, baseOffset: 0, yaw: 0, fill: 0.8, triangles: 924 },
  cargodepot_B: { file: 'cargodepot_B', footprint: 2.18, height: 1.02, baseOffset: 0, yaw: 0, fill: 0.8, triangles: 966 },
  cargodepot_C: { file: 'cargodepot_C', footprint: 2.1, height: 1.02, baseOffset: 0, yaw: 0, fill: 0.85, triangles: 1310 },
  containers_A: { file: 'containers_A', footprint: 0.5, height: 0.2, baseOffset: 0, yaw: 0, fill: 0.6, triangles: 280 },
  drill_structure: { file: 'drill_structure', footprint: 1.75, height: 2.0, baseOffset: 0, yaw: 0, fill: 0.7, triangles: 1198 },
  dropship: { file: 'dropship', footprint: 2.3, height: 1.3, baseOffset: 0, yaw: 0, fill: 1, triangles: 914 },
  eco_module: { file: 'eco_module', footprint: 2.0, height: 2.0, baseOffset: 0, yaw: 0, fill: 0.65, triangles: 1841 },
  lander_base: { file: 'lander_base', footprint: 1.34, height: 0.5, baseOffset: 0, yaw: 0, fill: 0.8, triangles: 638 },
  landingpad_large: { file: 'landingpad_large', footprint: 2.5, height: 0.5, baseOffset: 0, yaw: 0, fill: 0.92, triangles: 478 },
  landingpad_small: { file: 'landingpad_small', footprint: 1.9, height: 0.5, baseOffset: 0, yaw: 0, fill: 0.9, triangles: 454 },
  lights: { file: 'lights', footprint: 0.68, height: 1.0, baseOffset: 0, yaw: 0, fill: 0.3, triangles: 356 },
  rocks_A: { file: 'rocks_A', footprint: 1.64, height: 0.35, baseOffset: 0, yaw: 0, fill: 0.55, triangles: 88 },
  rocks_B: { file: 'rocks_B', footprint: 1.88, height: 1.07, baseOffset: 0, yaw: 0, fill: 0.45, triangles: 160 },
  rock_A: { file: 'rock_A', footprint: 0.53, height: 0.25, baseOffset: 0, yaw: 0, fill: 1, triangles: 30 },
  rock_B: { file: 'rock_B', footprint: 0.8, height: 0.4, baseOffset: 0, yaw: 0, fill: 1, triangles: 36 },
  roofmodule_cargo_A: { file: 'roofmodule_cargo_A', footprint: 1.4, height: 0.72, baseOffset: 0.1, yaw: 0, fill: 0.75, triangles: 784 },
  roofmodule_solarpanels: { file: 'roofmodule_solarpanels', footprint: 1.4, height: 0.57, baseOffset: 0.1, yaw: 0, fill: 0.7, triangles: 284 },
  solarpanel: { file: 'solarpanel', footprint: 0.9, height: 0.37, baseOffset: 0, yaw: 0, fill: 0.75, triangles: 118 },
  space_farm_large: { file: 'space_farm_large', footprint: 2.0, height: 0.3, baseOffset: 0, yaw: 0, fill: 0.85, triangles: 328 },
  space_farm_large_sprinkler: { file: 'space_farm_large_sprinkler', footprint: 2.0, height: 0.5, baseOffset: 0, yaw: 0, fill: 0.85, triangles: 550 },
  space_farm_small: { file: 'space_farm_small', footprint: 1.4, height: 0.94, baseOffset: 0.1, yaw: 0, fill: 0.75, triangles: 486 },
  spacetruck: { file: 'spacetruck', footprint: 0.89, height: 0.57, baseOffset: 0.08, yaw: 0, fill: 0.45, triangles: 1118 },
  structure_low: { file: 'structure_low', footprint: 1.75, height: 1.0, baseOffset: 0, yaw: 0, fill: 0.7, triangles: 422 },
  structure_tall: { file: 'structure_tall', footprint: 1.75, height: 2.0, baseOffset: 0, yaw: 0, fill: 0.7, triangles: 670 },
  // a terrain block: pivot in the middle, the pit on top; parts sink it so only the pit shows
  terrain_mining: { file: 'terrain_mining', footprint: 2.0, height: 2.07, baseOffset: 1.0, yaw: 0, fill: 0.58, triangles: 76 },
  // authored along x and 0.2 above its pivot (module door height); turned to run along the frame's forward
  tunnel_straight_B: { file: 'tunnel_straight_B', footprint: 2.0, height: 0.6, baseOffset: -0.2, yaw: Math.PI / 2, fill: 0.3, triangles: 284 },
  water_storage: { file: 'water_storage', footprint: 2.05, height: 1.05, baseOffset: 0, yaw: 0, fill: 0.75, triangles: 326 },
  windturbine_low: { file: 'windturbine_low', footprint: 1.29, height: 1.47, baseOffset: 0, yaw: 0, fill: 0.65, triangles: 826 },
  windturbine_tall: { file: 'windturbine_tall', footprint: 1.67, height: 3.0, baseOffset: 0, yaw: 0, fill: 0.6, triangles: 632 },
  // Medieval Hexagon objects; `fill` ≈ footprint / 2 keeps the kit's own proportions to its tile
  archeryrange: { file: 'archeryrange', source: 'hex', footprint: 1.8, height: 1.54, baseOffset: 0, yaw: 0, fill: 0.85, triangles: 1668 },
  barracks: { file: 'barracks', source: 'hex', footprint: 1.99, height: 1.3, baseOffset: 0.01, yaw: 0, fill: 0.88, triangles: 1960 },
  castle: { file: 'castle', source: 'hex', footprint: 1.85, height: 2.53, baseOffset: 0.03, yaw: 0, fill: 0.88, triangles: 2231 },
  farm_plot: { file: 'farm_plot', source: 'hex', footprint: 1.47, height: 0.46, baseOffset: 0.02, yaw: 0, fill: 0.8, triangles: 906 },
  house: { file: 'house', source: 'hex', footprint: 1.69, height: 0.91, baseOffset: 0.01, yaw: 0, fill: 0.8, triangles: 1666 },
  lumbermill: { file: 'lumbermill', source: 'hex', footprint: 1.82, height: 1.47, baseOffset: 0.02, yaw: 0, fill: 0.85, triangles: 1698 },
  market: { file: 'market', source: 'hex', footprint: 1.67, height: 0.86, baseOffset: 0.04, yaw: 0, fill: 0.82, triangles: 1924 },
  mill: { file: 'mill', source: 'hex', footprint: 1.69, height: 1.98, baseOffset: 0.03, yaw: 0, fill: 0.8, triangles: 2270 },
  mine: { file: 'mine', source: 'hex', footprint: 1.88, height: 0.83, baseOffset: 0.01, yaw: 0, fill: 0.88, triangles: 1735 },
  watchtower: { file: 'watchtower', source: 'hex', footprint: 1.71, height: 1.98, baseOffset: 0.03, yaw: 0, fill: 0.8, triangles: 1871 },
  // the water wheel hangs 0.58 below the floor (into a river); parts sink it to stand on the floor
  watermill: { file: 'watermill', source: 'hex', footprint: 1.53, height: 1.6, baseOffset: 0.58, yaw: 0, fill: 0.78, triangles: 1605 },
  well: { file: 'well', source: 'hex', footprint: 1.02, height: 0.74, baseOffset: 0, yaw: 0, fill: 0.5, triangles: 1252 },
};

export const ALL_MODEL_IDS = Object.keys(MODELS) as ModelId[];

export function sourceOf(id: ModelId): ModelSource {
  return MODELS[id].source ?? 'spacebits';
}

/** Space Base Bits models: what a view loads up front (the default skin, units, deposits, belts). */
export const BASE_MODEL_IDS: ReadonlyArray<ModelId> = ALL_MODEL_IDS.filter((id) => sourceOf(id) === 'spacebits');

export const SHIP_MODEL: ModelId = 'dropship';
export const ROVER_MODEL: ModelId = 'spacetruck';
export const DEPOSIT_MODEL: ModelId = 'rocks_A';
export const BELT_MODELS: ReadonlyArray<ModelId> = ['rock_A', 'rock_B'];

/** One model of a structure, placed on part of its footprint. */
export interface ModelPart {
  model: ModelId;
  /**
   * Footprint tiles (indices into `structure.tiles`, anchor = 0) whose centroid anchors the part;
   * omitted = the whole footprint. Falls back to the whole footprint when the structure is smaller.
   * The part's frame faces the first of these tiles (2–3 tiles) or a corner of the tile (1 tile).
   */
  at?: ReadonlyArray<number>;
  /** Overrides the model's `fill` (a smaller model beside another on the same tiles). */
  fill?: number;
  /**
   * Shift in the part's frame, in widths of that frame: x = right, z = forward, y = up from where
   * the model's lowest point would touch the surface (negative sinks it, e.g. a pit).
   */
  offset?: Readonly<{ x?: number; y?: number; z?: number }>;
  /** Extra turn about the surface normal, radians. */
  yaw?: number;
}

/** Look tier of a level (decision T-21): 1 = L1–2, 2 = L3–4, 3 = L5 and above. */
export type LevelTier = 1 | 2 | 3;

export function levelTier(level: number): LevelTier {
  return level >= 5 ? 3 : level >= 3 ? 2 : 1;
}

/** Parts for each tier: [L1–2, L3–4, L5]. */
export type TieredParts = readonly [ReadonlyArray<ModelPart>, ReadonlyArray<ModelPart>, ReadonlyArray<ModelPart>];

const one = (model: ModelId, extra: Omit<ModelPart, 'model'> = {}): ModelPart[] => [{ model, ...extra }];
/** Same look at every level. */
const always = (parts: ReadonlyArray<ModelPart>): TieredParts => [parts, parts, parts];
/** L1–2, L3–4 (default: as L1–2), L5 (default: as L3–4). */
const tiers = (l1: ReadonlyArray<ModelPart>, l3: ReadonlyArray<ModelPart> = l1, l5: ReadonlyArray<ModelPart> = l3): TieredParts => [l1, l3, l5];

/** Two light masts at the ends of a part's frame (landing pads), `z` = distance from its centre. */
const masts = (at: ReadonlyArray<number> | undefined, z: number): ModelPart[] => [
  { model: 'lights', at, fill: 0.2, offset: { z } },
  { model: 'lights', at, fill: 0.2, offset: { z: -z } },
];
/** Authored height of the top face of `terrain_mining` above its pivot. */
const PIT_TOP = 1.0;
/** The mining pit under an extractor: the terrain block sunk until its top is just above the surface. */
const PIT: ModelPart = {
  model: 'terrain_mining',
  offset: { y: 0.01 - ((MODELS.terrain_mining.baseOffset + PIT_TOP) * MODELS.terrain_mining.fill) / MODELS.terrain_mining.footprint },
};
/** Top of the landing frame of `lander_base` (its full height), in widths of a 1-tile frame. */
const LANDER_TOP = (MODELS.lander_base.height * MODELS.lander_base.fill) / MODELS.lander_base.footprint;
const EXTRACTOR = tiers(one('drill_structure'), [PIT, ...one('drill_structure')]);
/** Port: control tower on the anchor, landing pad on the two other tiles. */
const PORT_PAD: ModelPart = { model: 'landingpad_small', at: [1, 2] };
/** Fabryka atanorowa (flower of 7): a domed hall in the middle, six halls on the ring, tunnels between. */
const ATANOR: ModelPart[] = [
  { model: 'basemodule_E', at: [0] },
  ...[1, 2, 3, 4, 5, 6].flatMap((k): ModelPart[] => [
    { model: k % 2 ? 'cargodepot_B' : 'basemodule_B', at: [k], fill: 0.72 },
    { model: 'tunnel_straight_B', at: [0, k] },
  ]),
];

/**
 * Catalog kind → models per level tier. FACT: the kinds are catalog ids; the models are the KayKit
 * files copied to `assets/kaykit/`. PROPOSAL: the mapping (plan §8.1, T7A; README table).
 */
export const KIND_TIERS: Readonly<Record<StructureKind, TieredParts>> = {
  HQ: tiers(
    [{ model: 'structure_tall', at: [0] }, PORT_PAD],
    [{ model: 'structure_tall', at: [0] }, PORT_PAD, ...masts([1, 2], 0.5)],
    [{ model: 'basemodule_E', at: [0] }, { model: 'landingpad_large', at: [1, 2] }, ...masts([1, 2], 0.5)],
  ),
  LAND: tiers(one('landingpad_small'), [...one('landingpad_large'), ...masts(undefined, 0.47)]),
  HAB: tiers(one('basemodule_A'), one('basemodule_B'), one('basemodule_E')),
  FARM: tiers(one('space_farm_small'), one('space_farm_large'), one('space_farm_large_sprinkler')),
  GAR: always(one('basemodule_garage')),
  DEP: tiers(one('cargodepot_A'), one('cargodepot_B'), one('cargodepot_C')),
  SKL: tiers(one('containers_A'), one('roofmodule_cargo_A'), one('cargo_A_stacked')),
  TNK: always(one('water_storage')),
  MLT: tiers(one('water_storage'), [
    { model: 'water_storage', fill: 0.5, offset: { x: -0.24 } },
    { model: 'eco_module', fill: 0.42, offset: { x: 0.26 } },
  ]),
  SOL: tiers(one('solarpanel'), one('roofmodule_solarpanels')),
  WND: tiers(one('windturbine_low'), one('windturbine_tall')),
  MIN: EXTRACTOR,
  ICE: EXTRACTOR,
  SIT: EXTRACTOR,
  REGX: always([PIT, { model: 'rocks_B', offset: { x: 0.3, z: 0.1 } }]),
  // 3-tile works: a tower / platform on the anchor, the hall or tank on the two other tiles (kept
  // smaller than a pad so it does not swallow the anchor's part); L5 swaps in the bigger model
  SMT: tiers(
    [{ model: 'structure_tall', at: [0] }, { model: 'cargodepot_B', at: [1, 2], fill: 0.68 }],
    [{ model: 'structure_tall', at: [0] }, { model: 'cargodepot_B', at: [1, 2], fill: 0.68 }],
    [{ model: 'structure_tall', at: [0] }, { model: 'cargodepot_C', at: [1, 2], fill: 0.72 }],
  ),
  SIR: tiers(
    [{ model: 'structure_low', at: [0] }, { model: 'water_storage', at: [1, 2], fill: 0.62 }],
    [{ model: 'structure_low', at: [0] }, { model: 'water_storage', at: [1, 2], fill: 0.62 }],
    [{ model: 'structure_low', at: [0] }, { model: 'eco_module', at: [1, 2], fill: 0.55 }],
  ),
  // concrete plant: the hall and a cement silo (the hall alone reads as a habitat from afar)
  CON: always([
    { model: 'basemodule_D', fill: 0.62, offset: { x: -0.17 } },
    { model: 'eco_module', fill: 0.34, offset: { x: 0.3 } },
  ]),
  LST: always([...one('lander_base'), { model: 'cargo_A_packed', offset: { y: LANDER_TOP } }]),
  // preset kinds (era ≥ 2, placed by scenarios)
  ATN: always(ATANOR),
  GAS: always(one('eco_module')),
  HE3S: always([{ model: 'drill_structure', at: [0] }, { model: 'water_storage', at: [1, 2], fill: 0.62 }]),
};

/** Kinds without an entry (era ≥ 2 and unknown ids): a plain low structure. */
export const DEFAULT_PARTS: ReadonlyArray<ModelPart> = one('structure_low');

// ---------------------------------------------------------------- medieval skin (T7B)

/**
 * Look of the player's structures on a body: `medieval` on bodies whose terrain biome is medieval
 * (Medieval Hexagon models next to the settlement ruins), Space Base Bits everywhere else.
 */
export type Skin = 'spacebits' | 'medieval';

export function skinFor(body: Pick<CelestialBody, 'surfaceGrid'> | null | undefined): Skin {
  return body?.surfaceGrid?.terrain?.biome === 'medieval' ? 'medieval' : 'spacebits';
}

/** Sinks the water wheel of `watermill` (it hangs below the floor) so the floor stands on the surface. */
const millFloor = (fill = MODELS.watermill.fill): ModelPart['offset'] => ({ y: -(MODELS.watermill.baseOffset * fill) / MODELS.watermill.footprint });
/** Medieval Atanor complex: the castle in the middle, a house on every ring tile. */
const ATANOR_MEDIEVAL: ModelPart[] = [{ model: 'castle', at: [0] }, ...[1, 2, 3, 4, 5, 6].map((k): ModelPart => ({ model: 'house', at: [k], fill: 0.7 }))];
const MINE = always(one('mine'));

/**
 * Catalog kind → medieval models per level tier (plan §8.2, README table). Landing pads and solar
 * panels stay sci-fi (decision T-24): the colony still lands from orbit and has no medieval power.
 * Tiers change the look where a second model reads well on one tile; the rest keeps one look.
 */
export const KIND_TIERS_MEDIEVAL: Readonly<Record<StructureKind, TieredParts>> = {
  // the keep on the anchor, the (sci-fi) pad on the two other port tiles; tiers as in Space Base Bits
  HQ: tiers(
    [{ model: 'castle', at: [0] }, PORT_PAD],
    [{ model: 'castle', at: [0] }, PORT_PAD, ...masts([1, 2], 0.5)],
    [{ model: 'castle', at: [0] }, { model: 'landingpad_large', at: [1, 2] }, ...masts([1, 2], 0.5)],
  ),
  LAND: KIND_TIERS['LAND']!,
  // a house; L3–4 two houses; L5 two houses round a watchtower
  HAB: tiers(
    one('house'),
    [
      { model: 'house', fill: 0.55, offset: { x: -0.2, z: -0.1 } },
      { model: 'house', fill: 0.5, offset: { x: 0.22, z: 0.16 }, yaw: Math.PI },
    ],
    [
      { model: 'house', fill: 0.5, offset: { x: -0.22, z: -0.12 } },
      { model: 'house', fill: 0.46, offset: { x: 0.24, z: -0.1 }, yaw: Math.PI },
      { model: 'watchtower', fill: 0.36, offset: { z: 0.26 } },
    ],
  ),
  // a field; L3+ a windmill grinding its grain at the corner
  FARM: tiers(one('farm_plot'), [
    { model: 'farm_plot', fill: 0.62, offset: { x: -0.14, z: -0.08 } },
    { model: 'mill', fill: 0.42, offset: { x: 0.26, z: 0.2 } },
  ]),
  GAR: always(one('barracks')),
  DEP: always(one('market')),
  // storage yard: a shed and a fenced yard of round stock (the kit's archery range)
  SKL: always(one('archeryrange')),
  TNK: always(one('well', { fill: 0.62 })),
  MLT: always([
    { model: 'well', fill: 0.4, offset: { x: -0.24 } },
    { model: 'watermill', fill: 0.5, offset: { x: 0.2, ...millFloor(0.5) } },
  ]),
  SOL: KIND_TIERS['SOL']!,
  // a windmill, larger from L3
  WND: tiers(one('mill', { fill: 0.72 }), one('mill', { fill: 0.9 })),
  MIN: MINE,
  ICE: MINE,
  SIT: MINE,
  REGX: MINE,
  // 3-tile works: the workshop on the anchor, a tower (furnace) on the two other tiles
  SMT: always([{ model: 'lumbermill', at: [0] }, { model: 'watchtower', at: [1, 2], fill: 0.5 }]),
  // refinery: the water mill on two tiles, its well on the anchor
  SIR: always([
    { model: 'well', at: [0], fill: 0.55 },
    { model: 'watermill', at: [1, 2], fill: 0.66, offset: millFloor(0.66) },
  ]),
  CON: always(one('watchtower')),
  // loading station: the tower and a stack of goods beside it (the kit's crop field reads as bales)
  LST: always([
    { model: 'watchtower', fill: 0.62, offset: { x: -0.18 } },
    { model: 'farm_plot', fill: 0.36, offset: { x: 0.28 } },
  ]),
  // preset kinds (era ≥ 2, placed by scenarios)
  ATN: always(ATANOR_MEDIEVAL),
  GAS: always(one('well', { fill: 0.62 })),
  HE3S: always([{ model: 'mine', at: [0] }, { model: 'well', at: [1, 2], fill: 0.5 }]),
};

/**
 * Medieval kinds without an entry (era ≥ 2 and unknown ids): a house on the anchor tile (stretched
 * over a 3- or 7-tile footprint a house turns into a barn the size of a castle).
 */
export const DEFAULT_PARTS_MEDIEVAL: ReadonlyArray<ModelPart> = [{ model: 'house', at: [0] }];

const SKINS: Readonly<Record<Skin, { tiers: Readonly<Record<StructureKind, TieredParts>>; fallback: ReadonlyArray<ModelPart> }>> = {
  spacebits: { tiers: KIND_TIERS, fallback: DEFAULT_PARTS },
  medieval: { tiers: KIND_TIERS_MEDIEVAL, fallback: DEFAULT_PARTS_MEDIEVAL },
};

/** Models of a kind at a level in a skin (L0 = a site before its first construction ends: looks like L1). */
export function partsFor(kind: StructureKind, level: number, skin: Skin = 'spacebits'): ReadonlyArray<ModelPart> {
  const s = SKINS[skin];
  const t = s.tiers[kind];
  return t ? t[levelTier(level) - 1] : s.fallback;
}

/** L1 look (placement ghost, menus). */
export function partsForKind(kind: StructureKind, skin: Skin = 'spacebits'): ReadonlyArray<ModelPart> {
  return partsFor(kind, 1, skin);
}

/** Every model a kind needs at any level (for preloading). */
export function modelsForKind(kind: StructureKind, skin: Skin = 'spacebits'): ModelId[] {
  const s = SKINS[skin];
  const t = s.tiers[kind] ?? [s.fallback];
  return [...new Set(t.flatMap((parts) => parts.map((p) => p.model)))];
}

/** Every model the structures of a skin can use, any kind, any level (preload when a body has the skin). */
export function skinModels(skin: Skin): ModelId[] {
  const s = SKINS[skin];
  const ids = new Set<ModelId>(s.fallback.map((p) => p.model));
  for (const t of Object.values(s.tiers)) for (const parts of t) for (const p of parts) ids.add(p.model);
  return [...ids];
}

/**
 * Width a footprint offers, in tile widths: a single tile, the triangle of 3 tiles (its inscribed
 * width ≈ 1.8 tiles) or the flower of 7 (≈ 2.7 tiles across the inner ring).
 */
export function footprintSpan(tiles: number): number {
  if (tiles <= 1) return 1;
  if (tiles === 2) return 1.5;
  if (tiles <= 3) return 1.8;
  return 2.7;
}

/** Uniform scale so the model's footprint covers `fill` of the given width. */
export function fitScale(spec: ModelSpec, width: number, fill = spec.fill): number {
  return (width * fill) / spec.footprint;
}

/**
 * Height of a part's top above the surface, in widths of its frame (`offset.y` included): about 0
 * for a pit sunk into the ground, which the placement ghost leaves out.
 */
export function partTop(part: ModelPart): number {
  const spec = MODELS[part.model];
  return (spec.height * (part.fill ?? spec.fill)) / spec.footprint + (part.offset?.y ?? 0);
}

/** Vertical lift (scaled units) that puts the model's lowest point on the surface. */
export function baseLift(spec: ModelSpec, scale: number): number {
  return spec.baseOffset * scale;
}

const slash = (assetsBase: string) => (assetsBase === '' || assetsBase.endsWith('/') ? assetsBase : `${assetsBase}/`);

/** `${base}kaykit-hex/<id>.gltf.glb` (Medieval Hexagon); `base` is the app's assets base ('assets/' or '/assets/'). */
export function hexKitUrl(assetsBase: string, id: string): string {
  return `${slash(assetsBase)}kaykit-hex/${id}.gltf.glb`;
}

/**
 * File of a registry model: `${base}kaykit/<file>.gltf` (Space Base Bits) or
 * `${base}kaykit-hex/<file>.gltf.glb` (Medieval Hexagon); `base` is the app's assets base.
 */
export function modelUrl(assetsBase: string, file: ModelId): string {
  if (sourceOf(file) === 'hex') return hexKitUrl(assetsBase, file);
  return `${slash(assetsBase)}kaykit/${file}.gltf`;
}

/** Directory the .bin buffers resolve against. */
export function modelDir(assetsBase: string): string {
  return modelUrl(assetsBase, 'dropship').replace(/dropship\.gltf$/, '');
}
