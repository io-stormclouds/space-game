import { CelestialBody } from './models/celestial-body.model';
import { DomainEvent } from './models/domain-event.model';
import { TileId } from './models/planet-grid.model';
import { Stockpile, addStock, emptyStockpile, subtractStock } from './models/resource.model';
import { Rover } from './models/rover.model';
import { Spacecraft } from './models/spacecraft.model';
import { Structure } from './models/structure.model';

export interface WorldState {
  bodies: ReadonlyArray<CelestialBody>;
  ships: ReadonlyArray<Spacecraft>;
  /** Global store, filled by unloading ships and by extractors. */
  stockpile: Stockpile;
  structures: ReadonlyArray<Structure>;
  /** Remaining amount per deposit tile. */
  deposits: Readonly<Record<TileId, number>>;
  rovers: ReadonlyArray<Rover>;
}

/** Pure reducer: applies one domain event to the immutable world state. */
export function reduce(w: WorldState, e: DomainEvent): WorldState {
  switch (e.type) {
    case 'TRANSFER_STARTED':
      return patchShip(w, e.shipId, (s) => ({
        ...s,
        fuel: Math.max(0, s.fuel - e.plan.fuelCost),
        state: 'IN_TRANSIT',
        currentBodyId: null,
        targetBodyId: e.plan.toBodyId,
        transfer: e.plan,
      }));

    case 'TRANSFER_ARRIVED': {
      const body = w.bodies.find((b) => b.id === e.bodyId);
      const canMine = Object.values(body?.resources ?? {}).some((v) => (v ?? 0) > 0);
      return patchShip(w, e.shipId, (s) => ({
        ...s,
        state: canMine && cargoTotal(s.cargo) < s.maxCargo ? 'MINING' : 'DOCKED',
        currentBodyId: e.bodyId,
        targetBodyId: null,
        transfer: null,
      }));
    }

    case 'MINING_TICK': {
      const next = patchShip(w, e.shipId, (s) => ({ ...s, cargo: addStock(s.cargo, { [e.resource]: e.amount }) }));
      return {
        ...next,
        bodies: next.bodies.map((b) =>
          b.id === e.bodyId && b.resources
            ? { ...b, resources: { ...b.resources, [e.resource]: Math.max(0, (b.resources[e.resource] ?? 0) - e.amount) } }
            : b,
        ),
      };
    }

    case 'MINING_STOPPED':
      return patchShip(w, e.shipId, (s) => (s.state === 'MINING' ? { ...s, state: 'DOCKED' } : s));

    case 'CARGO_UNLOADED':
      return {
        ...patchShip(w, e.shipId, (s) => ({ ...s, cargo: emptyStockpile() })),
        stockpile: addStock(w.stockpile, e.cargo),
      };

    case 'REFUELED':
      return patchShip(w, e.shipId, (s) => ({ ...s, fuel: s.maxFuel }));

    case 'STRUCTURE_BUILT':
      return {
        ...w,
        stockpile: subtractStock(w.stockpile, e.cost),
        structures: [...w.structures, e.structure],
      };

    case 'EXTRACTION_TICK':
      return {
        ...w,
        stockpile: addStock(w.stockpile, { [e.resource]: e.amount }),
        deposits: { ...w.deposits, [e.tileId]: Math.max(0, (w.deposits[e.tileId] ?? 0) - e.amount) },
      };

    case 'ROVER_MOVE_ORDERED':
      return patchRover(w, e.roverId, (r) => ({ ...r, state: 'MOVING', path: e.path }));

    case 'ROVER_ARRIVED':
      return patchRover(w, e.roverId, (r) => ({ ...r, state: 'IDLE', tileIndex: e.tileIndex, path: [] }));

    case 'DEPOSIT_DEPLETED':
    case 'COMMAND_REJECTED':
      return w;
  }
}

export function reduceAll(w: WorldState, events: ReadonlyArray<DomainEvent>): WorldState {
  let cur = w;
  for (const e of events) cur = reduce(cur, e);
  return cur;
}

export function cargoTotal(cargo: Stockpile): number {
  return cargo.FERRITE + cargo.CRYOL + cargo.SILICITE;
}

function patchShip(w: WorldState, id: Spacecraft['id'], fn: (s: Spacecraft) => Spacecraft): WorldState {
  let changed = false;
  const ships = w.ships.map((s) => {
    if (s.id !== id) return s;
    const n = fn(s);
    changed = changed || n !== s;
    return n;
  });
  return changed ? { ...w, ships } : w;
}

function patchRover(w: WorldState, id: Rover['id'], fn: (r: Rover) => Rover): WorldState {
  let changed = false;
  const rovers = w.rovers.map((r) => {
    if (r.id !== id) return r;
    const n = fn(r);
    changed = changed || n !== r;
    return n;
  });
  return changed ? { ...w, rovers } : w;
}
