import { isWorking } from './models/structure.model';
import { WorldState } from './reducer';
import { Rules } from './rules';

export interface Objective {
  /** Key for the UI dictionary. */
  id: 'scan' | 'site' | 'port' | 'extract';
  done: boolean;
  /** For `extract`: materials still without a working extractor. */
  missing?: string[];
}

/** Canvas goals of the first session: 01 scan, 02 choose the planet, 03 land and build the port, 04 extract FER, SIL, KRI. */
export function colonyObjectives(world: WorldState, rules: Rules, materials: readonly string[] = ['FER', 'SIL', 'KRI']): Objective[] {
  const site = world.colony.siteBodyId;
  const extracting = new Set<string>();
  for (const s of world.structures) {
    if (!isWorking(s) || s.bodyId !== site) continue;
    for (const e of rules.extraction(s.kind)) extracting.add(e.material);
  }
  const missing = materials.filter((m) => !extracting.has(m));
  return [
    { id: 'scan', done: world.scan.state === 'DONE' },
    { id: 'site', done: site !== null },
    { id: 'port', done: world.colony.foundedAt !== null },
    { id: 'extract', done: world.colony.foundedAt !== null && missing.length === 0, missing },
  ];
}
