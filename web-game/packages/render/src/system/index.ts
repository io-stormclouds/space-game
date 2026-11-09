// Planet / system scene (F4, W12 A, W14 C), ported from the 3D PoC engine. The app registers
// `createSystemView` for both kinds: `views: { planet: createSystemView, system: createSystemView }`
// — RenderHost keeps the instance and switches kinds with `setKind` (camera only).
import type { View } from '../view';
import { SystemView, type SystemViewOptions } from './system-view';

export { SystemView, type SystemViewOptions } from './system-view';
export { SystemScene, UNIT_PICK_PX, SMALL_BODY_PX, TILE_PICK_MIN_PX } from './system-scene';
export { CameraRig, TRANSITION_SECONDS, type CameraMode } from './camera-rig';
export { DS, SCENE, DEPOSIT_TINTS, depositTint, muteBodyColor } from './palette';
export { KIND_TIERS, MODELS, levelTier, partsFor, partsForKind, modelsForKind, modelUrl, type LevelTier, type ModelId, type ModelSpec, type ModelPart, type TieredParts } from './model-registry';
export { ModelLibrary, type FetchBytes } from './model-library';
export {
  footprintFrame,
  structureLook,
  flightPath,
  flightProgress,
  dockingOffsetOf,
  defaultFocus,
  fitDistance,
  systemExtent,
  type StructureLook,
  type SurfaceFrame,
} from './placement';

/** A pointer move above this many pixels between down and up is a camera drag, not a click (PoC). */
export const CLICK_THRESHOLD_PX = 5;
/** Hover picks are worth throttling to about this interval (PoC: ~30 Hz). */
export const HOVER_INTERVAL_MS = 33;

/** Factory for RenderHost (sync). One instance serves `planet` and `system`. */
export function createSystemView(opts?: SystemViewOptions): View {
  return new SystemView(opts);
}
