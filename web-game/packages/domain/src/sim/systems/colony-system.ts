import { BodyId, ShipId, roverId as toRoverId } from '../../shared/ids';
import { fits, freeSpace, levelCeiling } from '../economy/colony';
import { footprintTiles } from '../math/footprint';
import { DomainEvent, ShuttleTrip, VehicleOrder } from '../models/domain-event.model';
import { PlanetGrid, TileId, tileId } from '../models/planet-grid.model';
import { Cost, canAfford, formatCost, missingFor, stockTotal } from '../models/resource.model';
import { Rover } from '../models/rover.model';
import { Spacecraft } from '../models/spacecraft.model';
import { isWorking } from '../models/structure.model';
import { WorldState, storageOf } from '../reducer';
import { Rules } from '../rules';
import { scaleCost, siteTerrain } from '../terrain/terrain-rules';
import { BuildSystem } from './build-system';
import { tileIndexOf } from './rover-system';

/** Numbers of the colonisation flow. Canvas facts where the canvas gives them, proposals otherwise. */
export interface ColonizationParams {
  /** Passive scan of the system [min] (canvas: "Skan pasywny: 5 obiektów · 15 min"). */
  scanMinutes: number;
  /** Port L1 [canvas: STA 120 · BET 80 · UKL 10 · 12 min]. */
  portCost: Cost;
  portBuildMinutes: number;
  /** Rovers the shuttle lands with the port (canvas: 2 on board). */
  landedRovers: number;
  /** Proposal: one shuttle trip carries this much [j.]. */
  shuttleCapacity: number;
  /** Proposal: one-way trip [min]; the shuttle is back after twice this. */
  shuttleTripMinutes: number;
}

export type Fail = { ok: false; reason: import('../models/domain-event.model').RejectReason; detail?: string };
const reject = (f: Fail): DomainEvent => ({ type: 'COMMAND_REJECTED', reason: f.reason, detail: f.detail });

/** Result of the spaceport check; `cost` (port cost after terrain) and `timePct` once past BAD_TERRAIN. */
export type SpaceportCheck =
  | { ok: true; indices: number[]; tiles: TileId[]; cost: Cost; timePct: number }
  | (Fail & { cost?: Cost; timePct?: number });

/** Colonisation commands of the canvas flow and the timers behind them (scan, shuttles, vehicles). */
export class ColonySystem {
  constructor(
    private readonly rules: Rules,
    private readonly grids: ReadonlyMap<BodyId, PlanetGrid>,
    private readonly builder: BuildSystem,
    private readonly params: ColonizationParams,
  ) {}

  mothership(world: WorldState): Spacecraft | undefined {
    return world.ships.find((s) => s.role === 'MOTHERSHIP');
  }

  scan(world: WorldState, shipId: ShipId): DomainEvent {
    const ship = world.ships.find((s) => s.id === shipId);
    if (!ship || ship.role !== 'MOTHERSHIP') return reject({ ok: false, reason: 'NO_MOTHERSHIP' });
    if (world.scan.state === 'RUNNING') return reject({ ok: false, reason: 'SCAN_RUNNING' });
    if (world.scan.state === 'DONE') return reject({ ok: false, reason: 'BUSY', detail: 'układ zeskanowany' });
    if (ship.state === 'IN_TRANSIT') return reject({ ok: false, reason: 'IN_TRANSIT' });
    return { type: 'SCAN_STARTED', shipId, endsAt: world.time + this.params.scanMinutes };
  }

  chooseSite(world: WorldState, bodyId: BodyId): DomainEvent {
    if (world.scan.state !== 'DONE') return reject({ ok: false, reason: 'NOT_SCANNED' });
    if (!this.grids.has(bodyId)) return reject({ ok: false, reason: 'NO_GRID' });
    if (world.colony.foundedAt !== null) return reject({ ok: false, reason: 'BUSY', detail: 'kolonia założona' });
    return { type: 'COLONY_SITE_CHOSEN', bodyId };
  }

  /**
   * Spaceport check of `placeSpaceport` (also the placement ghost of the pseudo-kind PORT). Order:
   * NO_COLONY_SITE → BUSY → NO_MOTHERSHIP → NO_SHIP → NO_SHUTTLE → NO_GRID → NO_FOOTPRINT → TILE_OCCUPIED →
   * BAD_TERRAIN → NO_RESOURCES (the port cost scaled by the terrain, against the mothership's hold).
   * Past the terrain stage it carries the scaled `cost` and the `timePct`, also on NO_RESOURCES.
   */
  checkSpaceport(world: WorldState, bodyId: BodyId, anchor: TileId, rotation = 0): SpaceportCheck {
    if (world.colony.siteBodyId !== bodyId) return { ok: false, reason: 'NO_COLONY_SITE' };
    if (world.structures.some((s) => s.kind === 'HQ' && s.bodyId === bodyId)) return { ok: false, reason: 'BUSY', detail: 'port już stoi' };
    const ship = this.mothership(world);
    if (!ship) return { ok: false, reason: 'NO_MOTHERSHIP' };
    if (ship.state !== 'DOCKED' || ship.currentBodyId !== bodyId) return { ok: false, reason: 'NO_SHIP', detail: `${ship.name} musi być na orbicie` };
    if ((ship.onboard?.shuttles ?? 0) < 1) return { ok: false, reason: 'NO_SHUTTLE' };
    const grid = this.grids.get(bodyId);
    const tile = grid?.tiles.find((t) => t.id === anchor);
    if (!grid || !tile) return { ok: false, reason: 'NO_GRID' };
    const spec = this.rules.spec('HQ', 1);
    const indices = footprintTiles(grid, tile.index, spec.footprint, rotation);
    if (!indices) return { ok: false, reason: 'NO_FOOTPRINT', detail: `${spec.footprint} pola` };
    const tiles = indices.map((i) => tileId(bodyId, i));
    const occupied = new Set(world.structures.filter((s) => s.bodyId === bodyId).flatMap((s) => s.tiles));
    if (tiles.some((t) => occupied.has(t))) return { ok: false, reason: 'TILE_OCCUPIED' };
    const rules = this.rules.terrain();
    const terrain = siteTerrain(grid, indices, rules);
    if (!terrain.buildable) return { ok: false, reason: 'BAD_TERRAIN', detail: rules.kinds[terrain.badKind!].name };
    const cost = scaleCost(this.params.portCost, terrain.costPct);
    const timePct = terrain.timePct;
    if (!canAfford(ship.cargo, cost)) return { ok: false, reason: 'NO_RESOURCES', detail: `brakuje ${formatCost(missingFor(ship.cargo, cost))}`, cost, timePct };
    return { ok: true, indices, tiles, cost, timePct };
  }

  /** Lands the port (HQ L1) from the mothership's hold with the rovers; rovers then build it. */
  placeSpaceport(world: WorldState, bodyId: BodyId, anchor: TileId, rotation = 0): DomainEvent {
    const check = this.checkSpaceport(world, bodyId, anchor, rotation);
    if (!check.ok) return reject(check);
    const ship = this.mothership(world)!;
    const grid = this.grids.get(bodyId)!;
    const tile = grid.tiles.find((t) => t.id === anchor)!;
    const { indices, tiles, cost } = check;
    const occupied = new Set(world.structures.filter((s) => s.bodyId === bodyId).flatMap((s) => s.tiles));

    const structure = this.builder.site('HQ', bodyId, tiles, cost, world.time, check.timePct);
    const count = Math.min(this.params.landedRovers, ship.onboard?.rovers ?? 0);
    const free = grid.tiles[tile.index]!.neighbors.filter((n) => !indices.includes(n) && !occupied.has(tileId(bodyId, n)));
    const rovers: Rover[] = [];
    for (let i = 0; i < count; i++) {
      rovers.push({
        id: toRoverId(`rover-${world.nextId + 1 + i}`),
        name: `Łazik R-${world.rovers.length + i + 1}`,
        bodyId,
        tileIndex: free[i % Math.max(1, free.length)] ?? tile.index,
        state: 'IDLE',
        path: [],
        job: null,
      });
    }
    return { type: 'SPACEPORT_PLACED', structure, cost, shipId: ship.id, rovers };
  }

  /** Sends the shuttle with materials from the mothership's hold down to the colony's storage. */
  callShuttle(world: WorldState, bodyId: BodyId, cargo: Cost): DomainEvent {
    const hq = world.structures.find((s) => s.kind === 'HQ' && s.bodyId === bodyId && isWorking(s));
    if (!hq) return reject({ ok: false, reason: 'NO_COLONY' });
    const ship = this.mothership(world);
    if (!ship || ship.state !== 'DOCKED' || ship.currentBodyId !== bodyId) return reject({ ok: false, reason: 'NO_SHIP', detail: 'Arka-1 musi być na orbicie' });
    const busy = world.shuttles.filter((t) => t.shipId === ship.id).length;
    if (busy >= (ship.onboard?.shuttles ?? 0)) return reject({ ok: false, reason: 'NO_SHUTTLE', detail: 'prom w drodze' });
    const total = stockTotal(cargo);
    if (total <= 0) return reject({ ok: false, reason: 'NO_RESOURCES' });
    if (total > this.params.shuttleCapacity) return reject({ ok: false, reason: 'NO_STORAGE', detail: `prom zabiera ${this.params.shuttleCapacity} j.` });
    if (!canAfford(ship.cargo, cargo)) return reject({ ok: false, reason: 'NO_RESOURCES', detail: `w ładowni brakuje ${formatCost(missingFor(ship.cargo, cargo))}` });
    if (!fits(world, this.rules, bodyId, cargo)) return reject({ ok: false, reason: 'NO_STORAGE' });
    const trip: ShuttleTrip = {
      id: `shuttle-${world.nextId + 1}`,
      shipId: ship.id,
      bodyId,
      cargo,
      arrivesAt: world.time + this.params.shuttleTripMinutes,
      returnsAt: world.time + 2 * this.params.shuttleTripMinutes,
      unloaded: false,
    };
    return { type: 'SHUTTLE_LAUNCHED', trip };
  }

  /** Construction rover from the port (canvas: "Produkuj łazik — FER 20 · SIL 5 · 3 min"); limit = port level + 1. */
  produceRover(world: WorldState, bodyId: BodyId): DomainEvent {
    const hq = world.structures.find((s) => s.kind === 'HQ' && s.bodyId === bodyId && isWorking(s));
    if (!hq) return reject({ ok: false, reason: 'NO_COLONY' });
    const limit = levelCeiling(world, bodyId) + 1;
    const count = world.rovers.filter((r) => r.bodyId === bodyId).length + world.vehicleOrders.filter((o) => o.bodyId === bodyId).length;
    if (count >= limit) return reject({ ok: false, reason: 'ROVER_LIMIT', detail: `${count} / ${limit}` });
    if (world.vehicleOrders.some((o) => o.structureId === hq.id)) return reject({ ok: false, reason: 'BUSY', detail: 'port produkuje' });
    const { cost, buildTime } = this.rules.vehicle('ROV');
    const store = storageOf(world, bodyId);
    if (!canAfford(store, cost)) return reject({ ok: false, reason: 'NO_RESOURCES', detail: `brakuje ${formatCost(missingFor(store, cost))}` });
    const order: VehicleOrder = { id: `order-${world.nextId + 1}`, bodyId, kind: 'ROV', structureId: hq.id, endsAt: world.time + buildTime };
    return { type: 'VEHICLE_ORDERED', order, cost };
  }

  /** Timers: scan end, shuttle landing and return, finished vehicles. */
  update(world: WorldState): DomainEvent[] {
    const events: DomainEvent[] = [];
    const t = world.time + 1e-9;
    if (world.scan.state === 'RUNNING' && t >= world.scan.endsAt) {
      events.push({ type: 'SCAN_COMPLETED', bodyIds: world.bodies.filter((b) => b.revealed === false).map((b) => b.id) });
    }
    for (const trip of world.shuttles) {
      if (!trip.unloaded && t >= trip.arrivesAt) {
        // Whatever does not fit goes back up with the shuttle.
        const cargo: Record<string, number> = {};
        for (const [code, q] of Object.entries(trip.cargo)) cargo[code] = Math.min(q, freeSpace(world, this.rules, trip.bodyId, code));
        events.push({ type: 'SHUTTLE_UNLOADED', tripId: trip.id, bodyId: trip.bodyId, cargo });
      }
      if (t >= trip.returnsAt) events.push({ type: 'SHUTTLE_RETURNED', tripId: trip.id });
    }
    let n = world.nextId;
    for (const o of world.vehicleOrders) {
      if (t < o.endsAt) continue;
      const hq = world.structures.find((s) => s.id === o.structureId);
      const tile = hq ? tileIndexOf(hq.tileId) : 0;
      n++;
      events.push({
        type: 'ROVER_PRODUCED',
        orderId: o.id,
        rover: { id: toRoverId(`rover-${n}`), name: `Łazik R-${world.rovers.length + 1}`, bodyId: o.bodyId, tileIndex: tile, state: 'IDLE', path: [], job: null },
      });
    }
    return events;
  }
}
