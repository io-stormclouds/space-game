import { Injectable, computed, signal } from '@angular/core';
import { createInitialWorld } from '../game/config/world';
import { PowerBalance, powerBalance } from '../game/economy/power';
import { CelestialBody } from '../game/models/celestial-body.model';
import { DomainEvent } from '../game/models/domain-event.model';
import { TileId } from '../game/models/planet-grid.model';
import { Stockpile } from '../game/models/resource.model';
import { Rover } from '../game/models/rover.model';
import { Spacecraft } from '../game/models/spacecraft.model';
import { Structure, StructureKind } from '../game/models/structure.model';
import { WorldState, reduceAll } from '../game/reducer';
import { BodyId, RoverId, ShipId } from '../shared/ids';

export interface TileSelection {
  bodyId: BodyId;
  tileId: TileId;
  tileIndex: number;
}

/** Single source of truth for discrete game state. Continuous values stay in FrameSnapshot. */
@Injectable({ providedIn: 'root' })
export class GameStateService {
  private readonly initial = createInitialWorld();

  readonly bodies = signal<ReadonlyArray<CelestialBody>>(this.initial.bodies);
  readonly spacecraft = signal<ReadonlyArray<Spacecraft>>(this.initial.ships);
  readonly stockpile = signal<Stockpile>(this.initial.stockpile);
  readonly structures = signal<ReadonlyArray<Structure>>(this.initial.structures);
  readonly deposits = signal<Readonly<Record<TileId, number>>>(this.initial.deposits);
  readonly rovers = signal<ReadonlyArray<Rover>>(this.initial.rovers);
  readonly credits = signal(1000);

  readonly selectedShipId = signal<ShipId | null>(null);
  readonly selectedRoverId = signal<RoverId | null>(null);
  /** Surface tile picked with LMB; UI state, not a domain event. */
  readonly selectedTile = signal<TileSelection | null>(null);
  /** Structure kind chosen in the build menu; null = not placing. */
  readonly placementKind = signal<StructureKind | null>(null);

  /** 0 = paused. */
  readonly timeScale = signal(1);
  /** Refreshed at ~10 Hz by the game loop, not every frame. */
  readonly gameTime = signal(0);
  /** Transit progress 0..1 of the selected ship, refreshed at ~10 Hz. */
  readonly selectedTransitProgress = signal(0);

  readonly selectedShip = computed(() => this.spacecraft().find((s) => s.id === this.selectedShipId()) ?? null);
  readonly selectedRover = computed(() => this.rovers().find((r) => r.id === this.selectedRoverId()) ?? null);
  readonly activeShipCount = computed(() => this.spacecraft().filter((s) => s.state !== 'DOCKED').length);
  readonly homeBase = computed(() => this.bodies().find((b) => b.isHomeBase)!);
  readonly isPaused = computed(() => this.timeScale() === 0);
  /** Structure standing on the selected tile, if any. */
  readonly selectedTileStructure = computed(() => {
    const sel = this.selectedTile();
    return sel ? this.structures().find((s) => s.tileId === sel.tileId) ?? null : null;
  });
  /** Body the player is working on: selected tile's body, else the home planet. */
  readonly focusBodyId = computed<BodyId>(() => this.selectedTile()?.bodyId ?? this.homeBase().id);
  readonly focusPower = computed<PowerBalance>(() => powerBalance(this.structures(), this.focusBodyId()));

  private lastTimeScale = 1;

  body(id: BodyId): CelestialBody | undefined {
    return this.bodies().find((b) => b.id === id);
  }

  ship(id: ShipId): Spacecraft | undefined {
    return this.spacecraft().find((s) => s.id === id);
  }

  rover(id: RoverId): Rover | undefined {
    return this.rovers().find((r) => r.id === id);
  }

  powerOf(bodyId: BodyId): PowerBalance {
    return powerBalance(this.structures(), bodyId);
  }

  /** Immutable snapshot of the discrete state for the pure systems. */
  world(): WorldState {
    return {
      bodies: this.bodies(),
      ships: this.spacecraft(),
      stockpile: this.stockpile(),
      structures: this.structures(),
      deposits: this.deposits(),
      rovers: this.rovers(),
    };
  }

  /** The only mutation entry point used by the game loop and commands. */
  apply(events: ReadonlyArray<DomainEvent>): void {
    if (events.length === 0) return;
    const before = this.world();
    const after = reduceAll(before, events);
    if (after.bodies !== before.bodies) this.bodies.set(after.bodies);
    if (after.ships !== before.ships) this.spacecraft.set(after.ships);
    if (after.stockpile !== before.stockpile) this.stockpile.set(after.stockpile);
    if (after.structures !== before.structures) this.structures.set(after.structures);
    if (after.deposits !== before.deposits) this.deposits.set(after.deposits);
    if (after.rovers !== before.rovers) this.rovers.set(after.rovers);
  }

  clearSelection(): void {
    this.selectedShipId.set(null);
    this.selectedRoverId.set(null);
    this.selectedTile.set(null);
  }

  togglePause(): void {
    if (this.timeScale() === 0) {
      this.timeScale.set(this.lastTimeScale || 1);
    } else {
      this.lastTimeScale = this.timeScale();
      this.timeScale.set(0);
    }
  }

  setTimeScale(scale: number): void {
    this.lastTimeScale = scale;
    this.timeScale.set(scale);
  }
}
