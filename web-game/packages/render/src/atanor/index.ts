// Atanor building view (F4, W08 A, W13 A): PixiJS with its own WebGL context, loaded lazily.
// Nothing here imports pixi.js at runtime (only types), so the app's initial bundle stays free
// of it; `loadAtanorView()` pulls PixiJS in its own chunk. See README.md.
import type { View } from '../view';
import { AtanorView, type AtanorViewOptions } from './atanor-view';

export type { AtanorViewOptions } from './atanor-view';
export { isAtanorControls, type AtanorControls } from './controls';
export type { AtanorReadout } from './readout';
export { ATANOR_TEXT_PL, type AtanorText } from './style';
export { DEFAULT_ATANOR_LEVEL, resolveAtanorLevel } from './layout';

/** Loads PixiJS and creates the Atanor view (use as the host's 'atanor' factory). */
export async function loadAtanorView(opts: AtanorViewOptions = {}): Promise<View> {
  const pixi = await import('pixi.js');
  return new AtanorView(pixi, opts);
}
