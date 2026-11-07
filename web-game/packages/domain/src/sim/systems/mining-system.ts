import { BodyId, ShipId } from '../../shared/ids';
import { GameConstants } from '../config/game-constants';
import { CelestialBody } from '../models/celestial-body.model';
import { DomainEvent } from '../models/domain-event.model';
import { Spacecraft } from '../models/spacecraft.model';
import { cargoTotal } from '../reducer';

/**
 * Transfers the body's first non-empty resource to a MINING ship once per model minute.
 * PoC fix (W09): the PoC handled at most one tick per update, so a step longer than one unit
 * (high tempo) lost ticks; now every whole minute of the step counts.
 */
export class MiningSystem {
  private readonly accumulators = new Map<ShipId, number>();

  constructor(private readonly cfg: GameConstants) {}

  update(ships: ReadonlyArray<Spacecraft>, bodies: ReadonlyArray<CelestialBody>, dt: number): DomainEvent[] {
    const events: DomainEvent[] = [];
    const bodyById = new Map<BodyId, CelestialBody>(bodies.map((b) => [b.id, b]));

    for (const ship of ships) {
      if (ship.state !== 'MINING' || !ship.currentBodyId) {
        this.accumulators.delete(ship.id);
        continue;
      }
      const body = bodyById.get(ship.currentBodyId);
      let available = { ...(body?.resources ?? {}) };
      let space = ship.maxCargo - cargoTotal(ship.cargo);
      let acc = (this.accumulators.get(ship.id) ?? 0) + dt;
      let stopped = false;

      if (space <= 0) {
        events.push({ type: 'MINING_STOPPED', shipId: ship.id, reason: 'CARGO_FULL' });
        continue;
      }
      while (acc >= 1 && !stopped) {
        acc -= 1;
        const resource = Object.keys(available).find((k) => (available[k] ?? 0) > 0) ?? null;
        if (!resource) {
          events.push({ type: 'MINING_STOPPED', shipId: ship.id, reason: 'DEPLETED' });
          stopped = true;
          break;
        }
        const left = available[resource]!;
        const amount = Math.min(this.cfg.miningRate, space, left);
        events.push({ type: 'MINING_TICK', shipId: ship.id, bodyId: ship.currentBodyId, resource, amount });
        space -= amount;
        available = { ...available, [resource]: left - amount };
        if (space <= 0) {
          events.push({ type: 'MINING_STOPPED', shipId: ship.id, reason: 'CARGO_FULL' });
          stopped = true;
        } else if (!Object.values(available).some((v) => v > 0)) {
          events.push({ type: 'MINING_STOPPED', shipId: ship.id, reason: 'DEPLETED' });
          stopped = true;
        }
      }
      if (!stopped && !Object.values(available).some((v) => v > 0)) {
        events.push({ type: 'MINING_STOPPED', shipId: ship.id, reason: 'DEPLETED' });
        stopped = true;
      }
      if (stopped) this.accumulators.delete(ship.id);
      else this.accumulators.set(ship.id, acc);
    }
    return events;
  }
}
