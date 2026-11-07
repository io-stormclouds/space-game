import { CelestialBody } from '../models/celestial-body.model';
import { DomainEvent } from '../models/domain-event.model';
import { isEmptyStock } from '../models/resource.model';
import { Spacecraft } from '../models/spacecraft.model';

/** What happens the moment a ship arrives at a body. */
export class DockingSystem {
  onArrival(ship: Spacecraft, body: CelestialBody): DomainEvent[] {
    const events: DomainEvent[] = [];
    if (!body.isHomeBase) return events;
    if (!isEmptyStock(ship.cargo)) events.push({ type: 'CARGO_UNLOADED', shipId: ship.id, cargo: ship.cargo });
    if (ship.fuel < ship.maxFuel) events.push({ type: 'REFUELED', shipId: ship.id });
    return events;
  }
}
