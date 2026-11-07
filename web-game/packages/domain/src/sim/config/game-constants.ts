export interface GameConstants {
  /** Ship cruise speed in world units per game second. */
  cruiseSpeed: number;
  /** Fuel per world unit of distance between docking points. */
  fuelRate: number;
  /** Minerals transferred per game second while MINING. */
  miningRate: number;
  /** Arrival when the ship is within radius × this factor of the target centre. */
  captureRadiusFactor: number;
  /** Upper bound on a single simulation step (seconds) to avoid spiral of death. */
  timeClamp: number;
  /** Height of the Bézier control point as a fraction of the start→target distance. */
  arcLiftFactor: number;
  /** Rover speed over the surface, world units per game second. */
  roverSpeed: number;
  /** Height of a landing pad's docking point above the tile, as a fraction of the body radius. */
  padLiftFactor: number;
}

export const GAME_CONSTANTS: GameConstants = {
  cruiseSpeed: 150,
  fuelRate: 0.02,
  miningRate: 10,
  captureRadiusFactor: 1.1,
  timeClamp: 0.1,
  arcLiftFactor: 0.2,
  roverSpeed: 12,
  padLiftFactor: 0.08,
};
