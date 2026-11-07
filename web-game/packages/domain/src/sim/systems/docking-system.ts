import { CelestialBody } from '../models/celestial-body.model';
import { DomainEvent } from '../models/domain-event.model';
import { Stockpile, isEmptyStock } from '../models/resource.model';
import { Spacecraft } from '../models/spacecraft.model';

/**
 * What happens the moment a ship arrives at a body. Transport ships unload into the home base's
 * storage (as much as fits, Z3) and refuel. The mothership keeps its hold: it unloads by shuttle.
 */
export class DockingSystem {
  onArrival(ship: Spacecraft, body: CelestialBody, fit: (cargo: Stockpile) => Stockpile = (c) => c): DomainEvent[] {
    const events: DomainEvent[] = [];
    if (!body.isHomeBase || ship.role !== 'SHIP') return events;
    const cargo = fit(ship.cargo);
    if (!isEmptyStock(cargo)) events.push({ type: 'CARGO_UNLOADED', shipId: ship.id, bodyId: body.id, cargo });
    if (ship.fuel < ship.maxFuel) events.push({ type: 'REFUELED', shipId: ship.id });
    return events;
  }
}
