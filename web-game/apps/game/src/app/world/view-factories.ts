import { inject } from '@angular/core';
import type { ViewFactory, ViewKind } from '@space-game/render';
import { TEXT } from '../i18n/pl';

/**
 * The scenes of the app (F4): one system/planet view for both kinds (W12 A), galaxy, Atanor (W13 A).
 * Dynamic imports keep Three.js and PixiJS out of the initial bundle (entry screens do not need them).
 */
export function appViewFactories(): Partial<Record<ViewKind, ViewFactory>> {
  const t = inject(TEXT);
  const starName = (name: string) => t.starNames[name] ?? name;
  const render = () => import('@space-game/render');
  return {
    planet: async () => (await render()).createSystemView(),
    system: async () => (await render()).createSystemView(),
    galaxy: async () => (await render()).createGalaxyView({ starName }),
    atanor: async () => (await render()).loadAtanorView(),
  };
}
