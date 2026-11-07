import { BodyId } from '../shared/ids';
import { CelestialBody } from './models/celestial-body.model';
import { DomainEvent, ShuttleTrip, VehicleOrder } from './models/domain-event.model';
import { TileId } from './models/planet-grid.model';
import { Stockpile, addStock, emptyStockpile, stockTotal, subtractStock } from './models/resource.model';
import { Rover } from './models/rover.model';
import { Spacecraft } from './models/spacecraft.model';
import { Structure } from './models/structure.model';

export type ScanState = { state: 'NONE' } | { state: 'RUNNING'; shipId: string; endsAt: number } | { state: 'DONE'; at: number };

export interface ColonyState {
  /** Body chosen for the first colony (canvas step "Wybierz planetę startową"). */
  siteBodyId: BodyId | null;
  /** Game time the port was finished, or null. */
  foundedAt: number | null;
}

/**
 * The whole game state. Plain data: it is serialised for save/load and replay (F2), so every
 * value a system needs to continue lives here. Only per-frame positions go to FrameSnapshot.
 */
export interface WorldState {
  /** Game time [model minutes]. */
  time: number;
  bodies: ReadonlyArray<CelestialBody>;
  ships: ReadonlyArray<Spacecraft>;
  /** Storage pool of each body (Z3: local storage). */
  storage: Readonly<Record<BodyId, Stockpile>>;
  structures: ReadonlyArray<Structure>;
  /** Remaining amount per deposit tile. */
  deposits: Readonly<Record<TileId, number>>;
  rovers: ReadonlyArray<Rover>;
  scan: ScanState;
  colony: ColonyState;
  shuttles: ReadonlyArray<ShuttleTrip>;
  vehicleOrders: ReadonlyArray<VehicleOrder>;
  /** Counter for deterministic ids. */
  nextId: number;
}

export function storageOf(w: WorldState, bodyId: BodyId): Stockpile {
  return w.storage[bodyId] ?? emptyStockpile();
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
      const canMine = Object.values(body?.resources ?? {}).some((v) => v > 0);
      return patchShip(w, e.shipId, (s) => ({
        ...s,
        state: s.role === 'SHIP' && canMine && cargoTotal(s.cargo) < s.maxCargo ? 'MINING' : 'DOCKED',
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
      return addToStorage(
        patchShip(w, e.shipId, (s) => ({ ...s, cargo: subtractStock(s.cargo, e.cargo) })),
        e.bodyId,
        e.cargo,
      );

    case 'REFUELED':
      return patchShip(w, e.shipId, (s) => ({ ...s, fuel: s.maxFuel }));

    case 'CONSTRUCTION_ORDERED': {
      const paid = e.fromShipId
        ? patchShip(w, e.fromShipId, (s) => ({ ...s, cargo: subtractStock(s.cargo, e.cost) }))
        : takeFromStorage(w, e.structure.bodyId, e.cost);
      return { ...paid, structures: [...paid.structures, e.structure], nextId: w.nextId + 1 };
    }

    case 'CONSTRUCTION_STARTED':
      return patchStructure(w, e.structureId, (s) => (s.state === 'PLANNED' ? { ...s, state: 'CONSTRUCTING' } : s));

    case 'STRUCTURE_BUILT':
      return releaseRovers(
        patchStructure(w, e.structure.id, () => e.structure),
        e.structure.id,
      );

    case 'UPGRADE_ORDERED': {
      const s = w.structures.find((x) => x.id === e.structureId);
      if (!s) return w;
      return patchStructure(takeFromStorage(w, s.bodyId, e.cost), e.structureId, (x) => ({
        ...x,
        state: 'UPGRADING',
        targetLevel: x.level + 1,
        progress: 0,
        paid: e.cost,
      }));
    }

    case 'STRUCTURE_UPGRADED':
      return releaseRovers(
        patchStructure(w, e.structureId, (s) => ({ ...s, state: 'ACTIVE', level: e.level, targetLevel: e.level, progress: 0, paid: {} })),
        e.structureId,
      );

    case 'CONSTRUCTION_CANCELLED': {
      const s = w.structures.find((x) => x.id === e.structureId);
      if (!s) return w;
      const refunded = addToStorage(w, s.bodyId, e.refund);
      const released = releaseRovers(refunded, s.id);
      if (s.level === 0) return { ...released, structures: released.structures.filter((x) => x.id !== s.id) };
      return patchStructure(released, s.id, (x) => ({ ...x, state: 'ACTIVE', targetLevel: x.level, progress: 0, paid: {} }));
    }

    case 'STRUCTURE_DEMOLISHED': {
      const s = w.structures.find((x) => x.id === e.structureId);
      if (!s) return w;
      const refunded = addToStorage(releaseRovers(w, s.id), s.bodyId, e.refund);
      return { ...refunded, structures: refunded.structures.filter((x) => x.id !== s.id) };
    }

    case 'EXTRACTION_TICK': {
      const next = addToStorage(w, e.bodyId, { [e.resource]: e.amount });
      if (w.deposits[e.tileId] === undefined) return next;
      return { ...next, deposits: { ...w.deposits, [e.tileId]: Math.max(0, w.deposits[e.tileId]! - e.amount) } };
    }

    case 'BATCH_STARTED': {
      const s = w.structures.find((x) => x.id === e.structureId);
      if (!s) return w;
      return patchStructure(takeFromStorage(w, s.bodyId, e.consumed), s.id, (x) => ({ ...x, batch: { recipe: e.recipe, progress: e.progress ?? 0 } }));
    }

    case 'BATCH_COMPLETED': {
      const s = w.structures.find((x) => x.id === e.structureId);
      if (!s) return w;
      return patchStructure(addToStorage(w, s.bodyId, e.produced), s.id, (x) => ({ ...x, batch: null }));
    }

    case 'RECIPE_SET':
      return patchStructure(w, e.structureId, (s) => ({ ...s, recipe: e.recipe }));

    case 'ROVER_MOVE_ORDERED':
      return patchRover(w, e.roverId, (r) => ({ ...r, state: 'MOVING', path: e.path }));

    case 'ROVER_ARRIVED':
      return patchRover(w, e.roverId, (r) => ({
        ...r,
        state: r.job ? 'BUILDING' : 'IDLE',
        tileIndex: e.tileIndex,
        path: [],
      }));

    case 'ROVER_ASSIGNED':
      return patchRover(w, e.roverId, (r) => ({ ...r, job: e.structureId }));

    case 'VEHICLE_ORDERED': {
      const s = w.structures.find((x) => x.id === e.order.structureId);
      const paid = s ? takeFromStorage(w, s.bodyId, e.cost) : w;
      return { ...paid, vehicleOrders: [...paid.vehicleOrders, e.order], nextId: w.nextId + 1 };
    }

    case 'ROVER_PRODUCED':
      return {
        ...w,
        rovers: [...w.rovers, e.rover],
        vehicleOrders: w.vehicleOrders.filter((o) => o.id !== e.orderId),
        nextId: w.nextId + 1,
      };

    case 'SCAN_STARTED':
      return { ...w, scan: { state: 'RUNNING', shipId: e.shipId, endsAt: e.endsAt } };

    case 'SCAN_COMPLETED': {
      const ids = new Set(e.bodyIds);
      return {
        ...w,
        scan: { state: 'DONE', at: w.time },
        bodies: w.bodies.map((b) => (ids.has(b.id) ? { ...b, revealed: true } : b)),
      };
    }

    case 'COLONY_SITE_CHOSEN':
      return { ...w, colony: { ...w.colony, siteBodyId: e.bodyId } };

    case 'SPACEPORT_PLACED': {
      const ship = patchShip(w, e.shipId, (s) => ({
        ...s,
        cargo: subtractStock(s.cargo, e.cost),
        onboard: s.onboard ? { ...s.onboard, rovers: s.onboard.rovers - e.rovers.length } : s.onboard,
      }));
      return {
        ...ship,
        structures: [...ship.structures, e.structure],
        rovers: [...ship.rovers, ...e.rovers],
        nextId: w.nextId + 1 + e.rovers.length,
      };
    }

    case 'COLONY_FOUNDED':
      return {
        ...w,
        colony: { ...w.colony, foundedAt: w.time },
        bodies: w.bodies.map((b) => (b.id === e.bodyId ? { ...b, isHomeBase: true } : b)),
      };

    case 'SHUTTLE_LAUNCHED':
      return {
        ...patchShip(w, e.trip.shipId, (s) => ({ ...s, cargo: subtractStock(s.cargo, e.trip.cargo) })),
        shuttles: [...w.shuttles, e.trip],
        nextId: w.nextId + 1,
      };

    case 'SHUTTLE_UNLOADED':
      return {
        ...addToStorage(w, e.bodyId, e.cargo),
        shuttles: w.shuttles.map((t) => (t.id === e.tripId ? { ...t, unloaded: true } : t)),
      };

    case 'SHUTTLE_RETURNED':
      return { ...w, shuttles: w.shuttles.filter((t) => t.id !== e.tripId) };

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
  return stockTotal(cargo);
}

function addToStorage(w: WorldState, bodyId: BodyId, add: Stockpile): WorldState {
  return { ...w, storage: { ...w.storage, [bodyId]: addStock(storageOf(w, bodyId), add) } };
}

function takeFromStorage(w: WorldState, bodyId: BodyId, take: Stockpile): WorldState {
  return { ...w, storage: { ...w.storage, [bodyId]: subtractStock(storageOf(w, bodyId), take) } };
}

function releaseRovers(w: WorldState, structureId: string): WorldState {
  if (!w.rovers.some((r) => r.job === structureId)) return w;
  return {
    ...w,
    rovers: w.rovers.map((r) => (r.job === structureId ? { ...r, job: null, state: r.state === 'MOVING' ? r.state : 'IDLE' } : r)),
  };
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

export function patchStructure(w: WorldState, id: string, fn: (s: Structure) => Structure): WorldState {
  let changed = false;
  const structures = w.structures.map((s) => {
    if (s.id !== id) return s;
    const n = fn(s);
    changed = changed || n !== s;
    return n;
  });
  return changed ? { ...w, structures } : w;
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
