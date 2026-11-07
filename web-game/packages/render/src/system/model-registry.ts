import type { StructureKind } from '@space-game/domain';

/**
 * Which KayKit "Space Base Bits" model stands for what, and how it is fitted to the surface.
 * Pure data + math, no Three.js (PoC `engine/model-registry.ts`, extended to the catalog kinds).
 *
 * Models are authored on a 2-unit grid, Y up; files are served at `${assetsBase}kaykit/<file>.gltf`
 * (CC0, Kay Lousberg). Bounds and triangle counts are of the FLATTENED geometry and
 * `model-library.spec.ts` checks every number against the files on disk.
 */
export type ModelId =
  | 'basemodule_A'
  | 'cargodepot_A'
  | 'drill_structure'
  | 'dropship'
  | 'landingpad_small'
  | 'rocks_A'
  | 'rock_A'
  | 'rock_B'
  | 'roofmodule_solarpanels'
  | 'solarpanel'
  | 'spacetruck'
  | 'structure_tall'
  | 'water_storage'
  | 'windturbine_tall';

export interface ModelSpec {
  file: ModelId;
  /** Footprint (max of x/z; z for vehicles = length along forward) of the flattened scene. */
  footprint: number;
  height: number;
  /** Distance of the authored pivot above the lowest point (0 = pivot at the base). */
  baseOffset: number;
  /** Rotation about the local up axis applied at load time, radians. */
  yaw: number;
  /** Fraction of the target width the footprint should cover. */
  fill: number;
  triangles: number;
}

export const MODELS: Readonly<Record<ModelId, ModelSpec>> = {
  basemodule_A: { file: 'basemodule_A', footprint: 2.25, height: 1.0, baseOffset: 0, yaw: 0, fill: 0.8, triangles: 586 },
  cargodepot_A: { file: 'cargodepot_A', footprint: 2.08, height: 1.12, baseOffset: 0, yaw: 0, fill: 0.8, triangles: 924 },
  drill_structure: { file: 'drill_structure', footprint: 1.75, height: 2.0, baseOffset: 0, yaw: 0, fill: 0.7, triangles: 1198 },
  dropship: { file: 'dropship', footprint: 2.3, height: 1.3, baseOffset: 0, yaw: 0, fill: 1, triangles: 914 },
  landingpad_small: { file: 'landingpad_small', footprint: 1.9, height: 0.5, baseOffset: 0, yaw: 0, fill: 0.9, triangles: 454 },
  rocks_A: { file: 'rocks_A', footprint: 1.64, height: 0.35, baseOffset: 0, yaw: 0, fill: 0.55, triangles: 88 },
  rock_A: { file: 'rock_A', footprint: 0.53, height: 0.25, baseOffset: 0, yaw: 0, fill: 1, triangles: 30 },
  rock_B: { file: 'rock_B', footprint: 0.8, height: 0.4, baseOffset: 0, yaw: 0, fill: 1, triangles: 36 },
  roofmodule_solarpanels: { file: 'roofmodule_solarpanels', footprint: 1.4, height: 0.57, baseOffset: 0.1, yaw: 0, fill: 0.7, triangles: 284 },
  solarpanel: { file: 'solarpanel', footprint: 0.9, height: 0.37, baseOffset: 0, yaw: 0, fill: 0.75, triangles: 118 },
  spacetruck: { file: 'spacetruck', footprint: 0.89, height: 0.57, baseOffset: 0.08, yaw: 0, fill: 0.45, triangles: 1118 },
  structure_tall: { file: 'structure_tall', footprint: 1.75, height: 2.0, baseOffset: 0, yaw: 0, fill: 0.7, triangles: 670 },
  water_storage: { file: 'water_storage', footprint: 2.05, height: 1.05, baseOffset: 0, yaw: 0, fill: 0.75, triangles: 326 },
  windturbine_tall: { file: 'windturbine_tall', footprint: 1.67, height: 3.0, baseOffset: 0, yaw: 0, fill: 0.6, triangles: 632 },
};

export const ALL_MODEL_IDS = Object.keys(MODELS) as ModelId[];

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
   */
  at?: ReadonlyArray<number>;
}

const one = (model: ModelId): ReadonlyArray<ModelPart> => [{ model }];

/**
 * Catalog kind → models. FACT: the kinds are catalog ids; the 14 copied KayKit files are all we have.
 * PROPOSAL: the mapping itself (see README, open questions).
 */
export const KIND_MODELS: Readonly<Record<StructureKind, ReadonlyArray<ModelPart>>> = {
  // port: control tower on the anchor, landing pad on the two other tiles
  HQ: [{ model: 'structure_tall', at: [0] }, { model: 'landingpad_small', at: [1, 2] }],
  LAND: one('landingpad_small'),
  SOL: one('solarpanel'),
  WND: one('windturbine_tall'),
  HAB: one('basemodule_A'),
  FARM: one('basemodule_A'),
  DEP: one('cargodepot_A'),
  SKL: one('cargodepot_A'),
  GAR: one('cargodepot_A'),
  TNK: one('water_storage'),
  MLT: one('water_storage'),
  MIN: one('drill_structure'),
  ICE: one('drill_structure'),
  SIT: one('drill_structure'),
  REGX: one('drill_structure'),
  HE3S: one('drill_structure'),
};

export const DEFAULT_PARTS: ReadonlyArray<ModelPart> = one('structure_tall');

export function partsForKind(kind: StructureKind): ReadonlyArray<ModelPart> {
  return KIND_MODELS[kind] ?? DEFAULT_PARTS;
}

/** Every model a kind needs (for preloading). */
export function modelsForKind(kind: StructureKind): ModelId[] {
  return [...new Set(partsForKind(kind).map((p) => p.model))];
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
export function fitScale(spec: ModelSpec, width: number): number {
  return (width * spec.fill) / spec.footprint;
}

/** Vertical lift (scaled units) that puts the model's lowest point on the surface. */
export function baseLift(spec: ModelSpec, scale: number): number {
  return spec.baseOffset * scale;
}

/** `${base}kaykit/<file>.gltf`; `base` is the app's assets base ('assets/' or '/assets/'). */
export function modelUrl(assetsBase: string, file: ModelId): string {
  const base = assetsBase === '' || assetsBase.endsWith('/') ? assetsBase : `${assetsBase}/`;
  return `${base}kaykit/${file}.gltf`;
}

/** Directory the .bin buffers resolve against. */
export function modelDir(assetsBase: string): string {
  return modelUrl(assetsBase, 'dropship').replace(/dropship\.gltf$/, '');
}
