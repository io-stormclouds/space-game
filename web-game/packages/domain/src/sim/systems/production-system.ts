import { BodyId } from '../../shared/ids';
import { fits, powerBalance } from '../economy/colony';
import { DomainEvent } from '../models/domain-event.model';
import { Stockpile, addStock, canAfford, subtractStock } from '../models/resource.model';
import { isWorking } from '../models/structure.model';
import { WorldState, patchStructure, storageOf } from '../reducer';
import { Rules } from '../rules';

export interface ProductionUpdate {
  world: WorldState;
  events: DomainEvent[];
}

/**
 * Processing buildings (Huta, Betoniarnia, Topielnik lodu…) run batches of their recipe: inputs
 * leave the body's storage when a batch starts, outputs arrive when it ends. Speed = level factor ×
 * power efficiency (Z4) × 50% while upgrading. A batch starts only if its outputs fit (Z3); a full
 * storage stops the building, like a full output buffer in the doc.
 * Simplification: inputs come from the body's pool, not through belts (doc chapter 7 is not built yet).
 */
export class ProductionSystem {
  constructor(private readonly rules: Rules) {}

  update(world: WorldState, dt: number): ProductionUpdate {
    const events: DomainEvent[] = [];
    let next = world;
    const stores = new Map<BodyId, Stockpile>();
    const efficiency = new Map<BodyId, Record<1 | 2 | 3, number>>();
    const store = (id: BodyId) => stores.get(id) ?? storageOf(world, id);

    for (const s of world.structures) {
      if (!isWorking(s) || !s.recipe) continue;
      const recipe = this.rules.recipe(s.recipe);
      // Atanor recipes are made by the player's machine (AtanorSystem, AT4, A17), not in batches
      if (recipe.atanor) continue;
      if (!efficiency.has(s.bodyId)) efficiency.set(s.bodyId, powerBalance(world, this.rules, s.bodyId).efficiency);
      const spec = this.rules.spec(s.kind, s.level);
      const speed = spec.outputFactor * efficiency.get(s.bodyId)![spec.priority] * (s.state === 'UPGRADING' ? 0.5 : 1);
      const produced = addStock(recipe.out, recipe.by ?? {});

      // Work this step, in minutes at full speed. A finished batch hands the rest of the step to the
      // next one, so output does not depend on the step size.
      let work = dt * speed;
      let batch = s.batch ? { ...s.batch } : null;
      let startEvent: Extract<DomainEvent, { type: 'BATCH_STARTED' }> | null = null;
      for (let guard = 0; guard < 16 && work > 1e-12; guard++) {
        if (!batch) {
          const pool = store(s.bodyId);
          const probe = { ...world, storage: { ...world.storage, [s.bodyId]: pool } };
          if (!canAfford(pool, recipe.inp) || !fits(probe, this.rules, s.bodyId, produced)) break;
          stores.set(s.bodyId, subtractStock(pool, recipe.inp));
          batch = { recipe: recipe.id, progress: 0 };
          startEvent = { type: 'BATCH_STARTED', structureId: s.id, recipe: recipe.id, consumed: recipe.inp, progress: 0 };
          events.push(startEvent);
        }
        const need = (1 - batch.progress) * recipe.time;
        if (work + 1e-9 >= need) {
          work -= need;
          events.push({ type: 'BATCH_COMPLETED', structureId: s.id, recipe: batch.recipe, produced });
          batch = null;
          startEvent = null;
        } else {
          batch.progress += work / recipe.time;
          work = 0;
        }
      }
      if (batch && startEvent) startEvent.progress = batch.progress;
      else if (batch) next = patchStructure(next, s.id, (x) => ({ ...x, batch: { ...batch! } }));
    }
    return { world: next, events };
  }
}
