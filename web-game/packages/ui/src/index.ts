// Angular port of the HUD design system. Classes and attributes match design-system/, whose CSS
// the app loads globally; tokens, formatting and readout rules are imported from its `core` entry.
export * from './lib/hud-text';
export * from './lib/hud-icon';
export * from './lib/hud-frame';
export * from './lib/rts-button';
export * from './lib/resource-panel';
export * from './lib/command-card';
export type {
  Cost,
  IconName,
  ResourceReadout,
  ResourceState,
  RTSButtonLayout,
  RTSButtonVariant,
} from '@space-game/hud-design-system/core';
