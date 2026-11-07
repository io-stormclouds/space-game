import { BodyId } from '../shared/ids';
import { powerBalance } from './economy/colony';
import { PlanetGrid } from './models/planet-grid.model';
import { isWorking } from './models/structure.model';
import { WorldState } from './reducer';
import { Rules } from './rules';
import { tileIndexOf } from './systems/rover-system';

/**
 * Rates a body should reach by the economy document: catalog rate × level factor of every working
 * building, at full power, with free storage and no upgrade in progress. The F6 designer panel puts
 * them next to the rates measured from events; the difference is power, storage, upgrades or
 * depleted deposits.
 */
export interface NominalFlows {
  /** Units per model minute, by material. */
  extraction: Record<string, number>;
  production: Record<string, number>;
  consumption: Record<string, number>;
  /** Working buildings by kind. */
  buildings: Record<string, number>;
  /** Power efficiency of the body now, by priority (1 = full power). */
  efficiency: Record<1 | 2 | 3, number>;
}

const add = (to: Record<string, number>, id: string, q: number) => {
  to[id] = Math.round(((to[id] ?? 0) + q) * 1000) / 1000;
};

export function nominalFlows(world: WorldState, rules: Rules, grids: ReadonlyMap<BodyId, PlanetGrid>, bodyId: BodyId): NominalFlows {
  const out: NominalFlows = {
    extraction: {},
    production: {},
    consumption: {},
    buildings: {},
    efficiency: powerBalance(world, rules, bodyId).efficiency,
  };
  const grid = grids.get(bodyId);
  for (const s of world.structures) {
    if (s.bodyId !== bodyId || !isWorking(s)) continue;
    out.buildings[s.kind] = (out.buildings[s.kind] ?? 0) + 1;
    const spec = rules.spec(s.kind, s.level);
    const extraction = rules.extraction(s.kind);
    if (extraction.length && grid) {
      const tile = grid.tiles[tileIndexOf(s.tileId)];
      const anywhere = rules.extractsAnywhere(s.kind);
      const ext = anywhere && !tile?.deposit ? anywhere : extraction.find((e) => e.material === tile?.deposit?.resource);
      const depleted = !!tile?.deposit && (world.deposits[s.tileId] ?? 0) <= 0;
      if (ext && !depleted) add(out.extraction, ext.material, ext.rate * spec.outputFactor);
    }
    if (s.recipe) {
      const r = rules.recipe(s.recipe);
      const perMin = spec.outputFactor / r.time;
      for (const [id, q] of Object.entries({ ...r.out, ...(r.by ?? {}) })) add(out.production, id, q * perMin);
      for (const [id, q] of Object.entries(r.inp)) add(out.consumption, id, q * perMin);
    }
  }
  return out;
}
