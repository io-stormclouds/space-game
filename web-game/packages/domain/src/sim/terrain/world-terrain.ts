import { BodyId } from '../../shared/ids';
import { CelestialBody } from '../models/celestial-body.model';
import { PlanetGrid } from '../models/planet-grid.model';
import { TC_C } from '../scenarios/tau-ceti';
import { generateTerrain } from './terrain-generator';
import { TerrainBiome, TerrainPlan } from './terrain-types';
import { vec3 } from '../math/vec3';

/** Terrain style of one body: biome and noise seed. */
export interface TerrainConfig {
  biome: TerrainBiome;
  seed: number;
}

/**
 * Which bodies get hex-kit terrain. Kept next to the scenario data, NOT inside `CelestialBody`, so the
 * world JSON that the Rust server and the golden replays compare stays unchanged (terrain is a view
 * concern for now; docs/planet-terrain-poc-wnioski-i-plan.md §4).
 */
export const TERRAIN_CONFIG: ReadonlyMap<BodyId, TerrainConfig> = new Map([
  [TC_C, { biome: 'medieval', seed: 2 }],
]);

/**
 * Terrain plans of every gridded body that has a config. The settlement faces the sun as seen from the
 * body at t = 0 (same rule as the PoC showcase colonies). Pure and deterministic.
 */
export function buildWorldTerrain(
  bodies: ReadonlyArray<CelestialBody>,
  grids: ReadonlyMap<BodyId, PlanetGrid>,
  config: ReadonlyMap<BodyId, TerrainConfig> = TERRAIN_CONFIG,
): Map<BodyId, TerrainPlan> {
  const plans = new Map<BodyId, TerrainPlan>();
  for (const body of bodies) {
    const grid = grids.get(body.id);
    const cfg = config.get(body.id);
    if (!grid || !cfg) continue;
    const aim = vec3(-Math.cos(body.initialAngle), 0.9, -Math.sin(body.initialAngle));
    plans.set(body.id, generateTerrain(grid, { biome: cfg.biome, seed: cfg.seed, aim }));
  }
  return plans;
}
