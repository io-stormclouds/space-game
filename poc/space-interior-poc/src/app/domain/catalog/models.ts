import { KIT_MODELS, type KitModelId, type KitModelInfo } from './kit-models.generated';

/**
 * Models the kit does not have (no lift; its "stairs" are smooth ramps), built in code by the engine
 * (engine/proc-models.ts) from the kit's own atlas and materials so they light, cut away and
 * instance like any kit model. Bounds and triangle counts must match the built geometry;
 * engine/proc-models.spec.ts checks that.
 */
const LIFT: KitModelInfo = {
  min: [-1.88, -0.14, -1.88],
  max: [1.88, 4, 1.88],
  tris: 216,
  materials: ['Atlas Metallic', 'Atlas', 'Atlas Emissive'],
};

const STAIRS: KitModelInfo = {
  min: [-1.5, 0, -2],
  max: [1.5, 4.921, 2],
  tris: 480,
  materials: ['Atlas Metallic', 'Atlas Emissive'],
};

export const PROC_MODELS = {
  Stairs_Blue: STAIRS,
  Stairs_Green: STAIRS,
  Stairs_Orange: STAIRS,
  Stairs_White: STAIRS,
  Lift_Platform_Blue: LIFT,
  Lift_Platform_Green: LIFT,
  Lift_Platform_Orange: LIFT,
  Lift_Platform_White: LIFT,
} as const satisfies Record<string, KitModelInfo>;

export type ProcModelId = keyof typeof PROC_MODELS;
export type ModelId = KitModelId | ProcModelId;
export type ModelInfo = KitModelInfo;

export const MODELS: Readonly<Record<ModelId, ModelInfo>> = { ...KIT_MODELS, ...PROC_MODELS };

export const isProcModel = (id: ModelId): id is ProcModelId => Object.hasOwn(PROC_MODELS, id);
