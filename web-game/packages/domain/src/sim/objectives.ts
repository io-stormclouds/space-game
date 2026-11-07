import { BodyId } from '../shared/ids';
import { PlanetGrid } from './models/planet-grid.model';
import { isWorking } from './models/structure.model';
import { WorldState } from './reducer';
import { Rules } from './rules';
import { tileIndexOf } from './systems/rover-system';

export interface Objective {
  /** Key for the UI dictionary. */
  id: 'scan' | 'site' | 'port' | 'extract';
  done: boolean;
  /** For `extract`: materials still without a working extractor. */
  missing?: string[];
}

/**
 * Materials actually extracted on a body: what lies under each working extractor (a Kopalnia on a
 * Kupryt deposit extracts KUP, not FER), plus regolith for excavators on free tiles.
 */
export function extractedMaterials(world: WorldState, rules: Rules, grids: ReadonlyMap<BodyId, PlanetGrid>, bodyId: BodyId): Set<string> {
  const out = new Set<string>();
  const grid = grids.get(bodyId);
  if (!grid) return out;
  for (const s of world.structures) {
    if (!isWorking(s) || s.bodyId !== bodyId) continue;
    const ext = rules.extraction(s.kind);
    if (!ext.length) continue;
    const deposit = grid.tiles[tileIndexOf(s.tileId)]?.deposit;
    // "Uruchom wydobycie" is a milestone: a deposit that ran dry still counts as started.
    if (deposit && ext.some((e) => e.material === deposit.resource)) out.add(deposit.resource);
    else if (!deposit && rules.extractsAnywhere(s.kind)) out.add('REG');
  }
  return out;
}

/** Canvas goals of the first session: 01 scan, 02 choose the planet, 03 land and build the port, 04 extract FER, SIL, KRI. */
export function colonyObjectives(
  world: WorldState,
  rules: Rules,
  grids: ReadonlyMap<BodyId, PlanetGrid>,
  materials: readonly string[] = ['FER', 'SIL', 'KRI'],
): Objective[] {
  const site = world.colony.siteBodyId;
  const extracting = site ? extractedMaterials(world, rules, grids, site) : new Set<string>();
  const missing = materials.filter((m) => !extracting.has(m));
  return [
    { id: 'scan', done: world.scan.state === 'DONE' },
    { id: 'site', done: site !== null },
    { id: 'port', done: world.colony.foundedAt !== null },
    { id: 'extract', done: world.colony.foundedAt !== null && missing.length === 0, missing },
  ];
}
