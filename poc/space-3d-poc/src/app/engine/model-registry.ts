import { StructureKind } from '../game/models/structure.model';

/**
 * Which KayKit "Space Base Bits" model stands for what, and how it is fitted to a tile.
 * Pure data + math, no Three.js: unit-tested in `model-registry.spec.ts`.
 *
 * Models are authored on a 2-unit grid, Y up. Files live in `public/assets/kaykit/` (CC0,
 * Kay Lousberg) and are served at `/assets/kaykit/<file>.gltf`.
 */
export interface ModelSpec {
  /** File name without extension under the assets base. */
  file: string;
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
}

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

export const ALL_MODELS: ReadonlyArray<ModelSpec> = [...Object.values(STRUCTURE_MODELS), SHIP_MODEL, ROVER_MODEL, ROCK_MODEL];

/** Uniform scale so the model's footprint covers `fill` of a tile of the given width. */
export function fitScale(spec: ModelSpec, tileWidth: number): number {
  return (tileWidth * spec.fill) / spec.footprint;
}

/** Vertical lift (in scaled units) that puts the model's lowest point on the tile surface. */
export function baseLift(spec: ModelSpec, scale: number): number {
  return spec.baseOffset * scale;
}

export function modelUrl(base: string, spec: ModelSpec): string {
  return `${base.replace(/\/$/, '')}/${spec.file}.gltf`;
}
