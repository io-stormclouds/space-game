import { BodyId } from '../../shared/ids';
import { STRUCTURE_INFO, Structure, StructureKind } from '../models/structure.model';

export interface PowerBalance {
  produced: number;
  consumed: number;
  /** produced − consumed; never negative in practice because building is blocked at zero. */
  available: number;
}

/** Pure: power of one body from its structures. */
export function powerBalance(structures: ReadonlyArray<Structure>, bodyId: BodyId): PowerBalance {
  let produced = 0;
  let consumed = 0;
  for (const s of structures) {
    if (s.bodyId !== bodyId) continue;
    const p = STRUCTURE_INFO[s.kind].power;
    if (p >= 0) produced += p;
    else consumed -= p;
  }
  return { produced, consumed, available: produced - consumed };
}

/** Power still missing to add a structure of `kind`; 0 when it fits (or produces). */
export function powerShortfall(balance: PowerBalance, kind: StructureKind): number {
  const p = STRUCTURE_INFO[kind].power;
  if (p >= 0) return 0;
  return Math.max(0, -p - balance.available);
}
