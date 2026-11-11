// Scenes of web-game (F4). The app imports RenderHost and the view factories; nothing here holds
// game state. Atanor is exported as a loader so PixiJS stays out of the initial bundle.
export * from './view';
export { RenderHost, type RenderHostOptions } from './render-host';
export { createSystemView, CLICK_THRESHOLD_PX, HOVER_INTERVAL_MS, VIEW_SCALE, WORLD_SCALE, type SystemViewOptions, type ViewScale } from './system/index';
export { createGalaxyView, GALAXY_TEXT_PL, type GalaxyText, type GalaxyViewOptions } from './galaxy/index';
export { loadAtanorView, isAtanorControls, type AtanorControls, type AtanorReadout, type AtanorViewOptions } from './atanor/index';
// Machine editor (AT2): framework-free state over the domain's edit operations; the app imports it
// lazily together with the views.
export { AtanorEditor, createAtanorEditor, initialDraft } from './atanor/index';
export type { AtanorCommand, AtanorEditIssue, AtanorEditorView, AtanorGhost, AtanorSolution, AtanorTool } from './atanor/index';
