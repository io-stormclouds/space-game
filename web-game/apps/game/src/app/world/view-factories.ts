import { inject } from '@angular/core';
import type { ViewFactory, ViewKind } from '@space-game/render';
import { TEXT } from '../i18n/pl';

/**
 * `?detail=full` in the address: every structure and decor instance drawn at full detail, without hemisphere
 * culling and decor LOD (the "before" of T4 in `npm run perf`, PERF_DETAIL=full). Read when the module loads:
 * the router's first navigation drops the query from the address.
 */
const CULL_DETAIL = (() => {
  try {
    return new URLSearchParams(globalThis.location?.search ?? '').get('detail') !== 'full';
  } catch {
    return true;
  }
})();

/**
 * The scenes of the app (F4): one system/planet view for both kinds (W12 A), galaxy, Atanor (W13 A).
 * Dynamic imports keep Three.js and PixiJS out of the initial bundle (entry screens do not need them).
 */
export function appViewFactories(): Partial<Record<ViewKind, ViewFactory>> {
  const t = inject(TEXT);
  const starName = (name: string) => t.starNames[name] ?? name;
  const render = () => import('@space-game/render');
  return {
    planet: async () => (await render()).createSystemView({ cullDetail: CULL_DETAIL }),
    system: async () => (await render()).createSystemView({ cullDetail: CULL_DETAIL }),
    galaxy: async () => (await render()).createGalaxyView({ starName }),
    // the board stays clear of the HUD: top bar 48 px, dock 240 px, floating panels on both sides
    atanor: async () => (await render()).loadAtanorView({ insets: { top: 64, bottom: 256, left: 300, right: 300 } }),
  };
}
