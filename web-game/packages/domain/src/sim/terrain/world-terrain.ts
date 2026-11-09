import { BodyId } from '../../shared/ids';
import { CelestialBody } from '../models/celestial-body.model';
import { PlanetGrid } from '../models/planet-grid.model';
import { TAU_CETI_BODIES } from '../scenarios/tau-ceti';
import { terrainAim } from './terrain-classify';
import { dressTerrain, generateTerrain } from './terrain-generator';
import { TerrainConfig, TerrainPlan } from './terrain-types';

/**
 * Terrain styles of the Tau Ceti bodies, read from their `surfaceGrid.terrain`.
 * @deprecated Compatibility layer until the renderer calls `dressTerrain` per grid (T8 B2); the style
 * now lives on the body (`CelestialBody.surfaceGrid.terrain`).
 */
export const TERRAIN_CONFIG: ReadonlyMap<BodyId, TerrainConfig> = new Map(
  TAU_CETI_BODIES.flatMap((b) => (b.surfaceGrid?.terrain ? [[b.id, b.surfaceGrid.terrain] as const] : [])),
);

/**
 * Terrain plans of the gridded bodies. Without `config`: every grid that carries terrain (`buildWorldGrids`
 * on bodies with `surfaceGrid.terrain`) is dressed from its own classification. With `config`: every body
 * in the map is classified and dressed with that style (tests, previews), whatever its grid carries. The
 * settlement faces the sun as seen from the body at t = 0. Pure and deterministic.
 * @deprecated Compatibility layer until the renderer calls `dressTerrain` per grid (T8 B2).
 */
export function buildWorldTerrain(
  bodies: ReadonlyArray<CelestialBody>,
  grids: ReadonlyMap<BodyId, PlanetGrid>,
  config?: ReadonlyMap<BodyId, TerrainConfig>,
): Map<BodyId, TerrainPlan> {
  const plans = new Map<BodyId, TerrainPlan>();
  for (const body of bodies) {
    const grid = grids.get(body.id);
    if (!grid) continue;
    if (config) {
      const cfg = config.get(body.id);
      if (cfg) plans.set(body.id, generateTerrain(grid, { biome: cfg.biome, seed: cfg.seed, aim: terrainAim(body) }));
    } else if (grid.terrain) {
      plans.set(body.id, dressTerrain(grid));
    }
  }
  return plans;
}
