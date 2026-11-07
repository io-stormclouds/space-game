import { BodyId, ShipId } from '../../shared/ids';
import { GameConstants } from '../config/game-constants';
import { CelestialBody } from '../models/celestial-body.model';
import { RESOURCE_KINDS } from '../models/resource.model';
import { cargoTotal } from '../reducer';
import { DomainEvent } from '../models/domain-event.model';
import { Spacecraft } from '../models/spacecraft.model';

/** Transfers the body's first non-empty resource to a MINING ship once per game second. */
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
      const resource = RESOURCE_KINDS.find((k) => (body?.resources?.[k] ?? 0) > 0) ?? null;
      const available = resource ? body?.resources?.[resource] ?? 0 : 0;
      const space = ship.maxCargo - cargoTotal(ship.cargo);

      if (space <= 0) {
        events.push({ type: 'MINING_STOPPED', shipId: ship.id, reason: 'CARGO_FULL' });
        continue;
      }
      if (available <= 0 || !resource) {
        events.push({ type: 'MINING_STOPPED', shipId: ship.id, reason: 'DEPLETED' });
        continue;
      }

      const acc = (this.accumulators.get(ship.id) ?? 0) + dt;
      if (acc >= 1) {
        const amount = Math.min(this.cfg.miningRate, space, available);
        events.push({ type: 'MINING_TICK', shipId: ship.id, bodyId: ship.currentBodyId, resource, amount });
        if (amount >= space) events.push({ type: 'MINING_STOPPED', shipId: ship.id, reason: 'CARGO_FULL' });
        else if (amount >= available) events.push({ type: 'MINING_STOPPED', shipId: ship.id, reason: 'DEPLETED' });
        this.accumulators.set(ship.id, acc - 1);
      } else {
        this.accumulators.set(ship.id, acc);
      }
    }
    return events;
  }
}
