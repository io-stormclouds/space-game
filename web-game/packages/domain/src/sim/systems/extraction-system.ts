import { BodyId } from '../../shared/ids';
import { freeSpace, powerBalance } from '../economy/colony';
import { DomainEvent } from '../models/domain-event.model';
import { PlanetGrid } from '../models/planet-grid.model';
import { isWorking } from '../models/structure.model';
import { WorldState } from '../reducer';
import { Rules } from '../rules';
import { tileIndexOf } from './rover-system';

/**
 * Extractors pull their material from the deposit under them into the body's storage, once per
 * model minute (rate × time). Unified rules:
 * - the amount is rate × level factor (×1.6 per level) × power efficiency (Z4) × 50% while upgrading;
 * - it stops when the storage class of the body is full (Z3);
 * - a step longer than one minute counts every whole minute (PoC counted only one).
 */
export class ExtractionSystem {
  private accumulator = 0;

  constructor(
    private readonly rules: Rules,
    private readonly grids: ReadonlyMap<BodyId, PlanetGrid>,
  ) {}

  update(world: WorldState, dt: number): DomainEvent[] {
    this.accumulator += dt;
    const ticks = Math.floor(this.accumulator + 1e-9);
    if (ticks < 1) return [];
    this.accumulator -= ticks;

    const events: DomainEvent[] = [];
    const deposits: Record<string, number> = { ...world.deposits };
    const efficiency = new Map<BodyId, Record<1 | 2 | 3, number>>();
    const space = new Map<string, number>();

    for (let tick = 0; tick < ticks; tick++) {
      for (const s of world.structures) {
        if (!isWorking(s)) continue;
        const extraction = this.rules.extraction(s.kind);
        if (extraction.length === 0) continue;
        const grid = this.grids.get(s.bodyId);
        const tile = grid?.tiles[tileIndexOf(s.tileId)];
        if (!tile) continue;
        const anywhere = this.rules.extractsAnywhere(s.kind);
        const ext = anywhere && !tile.deposit ? anywhere : extraction.find((e) => e.material === tile.deposit?.resource);
        if (!ext) continue;

        if (!efficiency.has(s.bodyId)) efficiency.set(s.bodyId, powerBalance(world, this.rules, s.bodyId).efficiency);
        const spec = this.rules.spec(s.kind, s.level);
        const eff = efficiency.get(s.bodyId)![spec.priority] * (s.state === 'UPGRADING' ? 0.5 : 1);
        const key = `${s.bodyId}|${ext.material}`;
        if (!space.has(key)) space.set(key, freeSpace(world, this.rules, s.bodyId, ext.material));
        const finite = !anywhere || tile.deposit;
        const remaining = finite ? deposits[s.tileId] ?? 0 : Infinity;
        const amount = round3(Math.min(ext.rate * spec.outputFactor * eff, remaining, space.get(key)!));
        if (amount <= 0) continue;
        events.push({ type: 'EXTRACTION_TICK', bodyId: s.bodyId, tileId: s.tileId, resource: ext.material, amount });
        space.set(key, space.get(key)! - amount);
        if (finite) {
          deposits[s.tileId] = remaining - amount;
          if (amount >= remaining) events.push({ type: 'DEPOSIT_DEPLETED', bodyId: s.bodyId, tileId: s.tileId });
        }
      }
    }
    return events;
  }
}

/** Keeps stock values readable (no 1.6000000000000003). */
function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
