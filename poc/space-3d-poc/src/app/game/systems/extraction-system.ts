import { DomainEvent } from '../models/domain-event.model';
import { STRUCTURE_INFO } from '../models/structure.model';
import { WorldState } from '../reducer';

/** Extractors pull their resource from the deposit under them into the stockpile, once per game second. */
export class ExtractionSystem {
  private accumulator = 0;

  update(world: WorldState, dt: number): DomainEvent[] {
    this.accumulator += dt;
    if (this.accumulator < 1) return [];
    this.accumulator -= 1;

    const events: DomainEvent[] = [];
    for (const s of world.structures) {
      const info = STRUCTURE_INFO[s.kind];
      if (!info.extracts) continue;
      const remaining = world.deposits[s.tileId] ?? 0;
      if (remaining <= 0) continue;
      const amount = Math.min(info.rate ?? 1, remaining);
      events.push({ type: 'EXTRACTION_TICK', bodyId: s.bodyId, tileId: s.tileId, resource: info.extracts, amount });
      if (amount >= remaining) events.push({ type: 'DEPOSIT_DEPLETED', bodyId: s.bodyId, tileId: s.tileId });
    }
    return events;
  }
}
