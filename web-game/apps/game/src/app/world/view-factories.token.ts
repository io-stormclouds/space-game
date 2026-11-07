import { InjectionToken } from '@angular/core';
import type { ViewFactory, ViewKind } from '@space-game/render';

/**
 * Scene factories by view (F4). Empty → the schematic map stands in for the world view.
 * Kept apart from WorldView so app.config does not pull Three.js into the initial bundle.
 */
export const VIEW_FACTORIES = new InjectionToken<Partial<Record<ViewKind, ViewFactory>>>('VIEW_FACTORIES', {
  providedIn: 'root',
  factory: () => ({}),
});
