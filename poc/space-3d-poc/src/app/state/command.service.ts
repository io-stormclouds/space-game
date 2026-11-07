import { Injectable, inject } from '@angular/core';
import { DomainEvent, RejectReason } from '../game/models/domain-event.model';
import { TileId } from '../game/models/planet-grid.model';
import { formatCost } from '../game/models/resource.model';
import { STRUCTURE_INFO, StructureKind } from '../game/models/structure.model';
import { BuildCheck } from '../game/systems/build-system';
import { BodyId, RoverId, ShipId } from '../shared/ids';
import { GameStateService, TileSelection } from './game-state.service';
import { NotificationService } from './notification.service';
import { SimulationService } from './simulation.service';

const REJECT_MESSAGES: Record<RejectReason, string> = {
  NO_FUEL: 'Za mało paliwa',
  NO_RETURN_RESERVE: 'Brak rezerwy paliwa na powrót',
  ALREADY_THERE: 'Statek już tam jest',
  IN_TRANSIT: 'Statek jest w locie',
  NO_SHIP: 'Nie wybrano statku',
  TILE_OCCUPIED: 'Pole jest już zajęte',
  NO_RESOURCES: 'Za mało surowców',
  NO_GRID: 'Na tym ciele nie można budować',
  NO_DEPOSIT: 'Brak odpowiedniego złoża',
  NO_POWER: 'Za mało mocy',
  NO_ROVER: 'Nie wybrano łazika',
  ROVER_MOVING: 'Łazik jest w drodze',
  NO_PATH: 'Brak drogi do tego pola',
};

export function rejectMessage(reason: RejectReason, detail?: string): string {
  return detail ? `${REJECT_MESSAGES[reason]}: ${detail}` : REJECT_MESSAGES[reason];
}

/** Validates player intents and turns them into domain events. */
@Injectable({ providedIn: 'root' })
export class CommandService {
  private readonly state = inject(GameStateService);
  private readonly sim = inject(SimulationService);
  private readonly notify = inject(NotificationService);

  private forEngine: DomainEvent[] = [];

  select(shipId: ShipId | null): void {
    this.state.selectedShipId.set(shipId);
    if (shipId) this.state.selectedRoverId.set(null);
  }

  selectRover(roverId: RoverId | null): void {
    this.state.selectedRoverId.set(roverId);
    if (roverId) this.state.selectedShipId.set(null);
  }

  selectTile(sel: TileSelection | null): void {
    this.state.selectedTile.set(sel);
  }

  /** Enters (or leaves, with null / the same kind) placement mode. */
  setPlacement(kind: StructureKind | null): void {
    this.state.placementKind.set(this.state.placementKind() === kind ? null : kind);
  }

  /** Orders a transfer; returns false (and toasts) when the order is rejected. */
  orderTransfer(shipId: ShipId, targetBodyId: BodyId): boolean {
    const ship = this.state.ship(shipId);
    if (!ship) return this.reject('NO_SHIP', undefined, shipId);
    if (ship.state === 'IN_TRANSIT' || !ship.currentBodyId) return this.reject('IN_TRANSIT', undefined, shipId);
    if (ship.currentBodyId === targetBodyId) return this.reject('ALREADY_THERE', undefined, shipId);

    const t = this.sim.clock.time;
    const cost = this.sim.transfers.fuelCost(ship.currentBodyId, targetBodyId, t);
    if (ship.fuel < cost) {
      return this.reject('NO_FUEL', `potrzeba ${cost.toFixed(0)}, dostępne ${ship.fuel.toFixed(0)}`, shipId);
    }

    const home = this.state.homeBase();
    if (targetBodyId !== home.id) {
      const reserve = this.sim.transfers.returnReserve(targetBodyId, home.id);
      if (ship.fuel - cost < reserve) {
        return this.reject('NO_RETURN_RESERVE', `po locie zostanie ${(ship.fuel - cost).toFixed(0)}, rezerwa na powrót ${reserve.toFixed(0)}`, shipId);
      }
    }

    const plan = this.sim.transfers.plan(ship, targetBodyId, t);
    const event: DomainEvent = { type: 'TRANSFER_STARTED', shipId, plan };
    this.state.apply([event]);
    this.forEngine.push(event);
    const target = this.state.body(targetBodyId);
    this.notify.push(`${ship.name} → ${target?.name ?? targetBodyId}: paliwo −${plan.fuelCost.toFixed(0)}, ETA ${plan.estimatedDuration.toFixed(1)} s`);
    return true;
  }

  returnToBase(shipId: ShipId): boolean {
    return this.orderTransfer(shipId, this.state.homeBase().id);
  }

  /** Tile-independent availability of a structure kind on the focus body (for menu cards). */
  availability(kind: StructureKind, bodyId: BodyId = this.state.focusBodyId()): BuildCheck {
    return this.sim.builder.availability(this.state.world(), bodyId, kind);
  }

  /** Full check for a tile without building (ghost colour). */
  canBuild(kind: StructureKind, bodyId: BodyId, tileId: TileId): BuildCheck {
    return this.sim.builder.check(this.state.world(), bodyId, tileId, kind);
  }

  /** Builds `kind` on the tile; returns false (and toasts) when rejected. */
  build(kind: StructureKind, bodyId: BodyId, tileId: TileId): boolean {
    const event = this.sim.builder.build(this.state.world(), bodyId, tileId, kind, this.sim.clock.time);
    if (event.type !== 'STRUCTURE_BUILT') {
      return event.type === 'COMMAND_REJECTED' ? this.reject(event.reason, event.detail) : false;
    }
    this.state.apply([event]);
    this.forEngine.push(event);
    if (kind === 'LANDING_PAD') this.sim.refreshDockingOffset(bodyId);
    const body = this.state.body(bodyId);
    this.notify.push(`${STRUCTURE_INFO[kind].name} na ${body?.name ?? bodyId}: −${formatCost(event.cost)}`);
    return true;
  }

  /** Builds the placement kind on the selected tile (keyboard / panel shortcut). */
  buildOnSelected(): boolean {
    const kind = this.state.placementKind();
    const sel = this.state.selectedTile();
    if (!kind || !sel) return false;
    return this.build(kind, sel.bodyId, sel.tileId);
  }

  /** Sends the rover to a tile on its own body. */
  orderRoverMove(roverId: RoverId, bodyId: BodyId, tileIndex: number): boolean {
    const rover = this.state.rover(roverId);
    if (!rover) return this.reject('NO_ROVER');
    if (rover.state === 'MOVING') return this.reject('ROVER_MOVING');
    if (rover.bodyId !== bodyId) return this.reject('NO_PATH', 'łazik jest na innym ciele');
    const path = this.sim.rovers.findPath(bodyId, rover.tileIndex, tileIndex, this.state.structures());
    if (!path || path.length === 0) return this.reject('NO_PATH');
    this.sim.rovers.start(rover, path);
    const event: DomainEvent = { type: 'ROVER_MOVE_ORDERED', roverId, path };
    this.state.apply([event]);
    this.notify.push(`${rover.name}: jedzie na pole ${tileIndex} (${path.length} kafelków)`);
    return true;
  }

  /** Events the game loop must still forward to the engine (ship reparenting, new structures). */
  drainStarted(): DomainEvent[] {
    const out = this.forEngine;
    this.forEngine = [];
    return out;
  }

  private reject(reason: RejectReason, detail?: string, shipId?: ShipId): boolean {
    this.notify.push(rejectMessage(reason, detail), 'warn');
    this.state.apply([{ type: 'COMMAND_REJECTED', shipId, reason, detail }]);
    return false;
  }
}
