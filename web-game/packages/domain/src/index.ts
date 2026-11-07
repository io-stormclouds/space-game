// Public API of the game domain. Framework-free: no Angular, no Three.js, no DOM.

export * from './shared/ids';
export * from './economy';

// world model
export * from './sim/models/celestial-body.model';
export * from './sim/models/domain-event.model';
export * from './sim/models/planet-grid.model';
export * from './sim/models/resource.model';
export * from './sim/models/rover.model';
export * from './sim/models/spacecraft.model';
export * from './sim/models/structure.model';
export * from './sim/models/transfer.model';
export * from './sim/reducer';
export * from './sim/frame-snapshot';
export * from './sim/rules';
export * from './sim/economy/colony';
export * from './sim/objectives';
export * from './sim/flows';
export { GAME_CONSTANTS, type GameConstants } from './sim/config/game-constants';

// math used by the renderer
export * from './sim/math/vec3';
export { buildGoldbergGrid, tileArea, tileWidth } from './sim/math/goldberg-grid';
export { asteroidShape, depletionScale, type AsteroidShape } from './sim/math/asteroid-shape';
export { BezierPath } from './sim/math/bezier-path';
export { OrbitSolver } from './sim/math/orbit-solver';
export { footprintTiles } from './sim/math/footprint';

// galaxy
export * from './galaxy/stars';

// Atanor puzzle engine (namespaced: its hex and molecule types would clash with the world model)
export * as Atanor from './atanor/index';

// simulation and scenarios
export * from './sim/scenario';
export * from './sim/simulation';
export { GameClock, POC_TEMPO, SECONDS_PER_MODEL_MINUTE } from './sim/systems/game-clock';
export { tileIndexOf } from './sim/systems/rover-system';
export type { ColonizationParams } from './sim/systems/colony-system';
export { POC_SCENARIO } from './sim/scenarios/poc';
export * from './sim/scenarios/tau-ceti';
export * from './sim/config/initial-world';
