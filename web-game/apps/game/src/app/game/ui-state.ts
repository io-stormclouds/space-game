import { Injectable, computed, inject, signal } from '@angular/core';
import type { BodyId, BuildPreview, Structure } from '@space-game/api';
import type { AtanorControls, AtanorReadout, AtanorViewInput, PickResult, Placement, Selection, ViewKind } from '@space-game/render';
import { GameService } from './game.service';

/**
 * Last checked tile and its verdict (ghost). `cost` and `buildTime` are the price after the terrain
 * under the footprint (T8), present once the server's check got past the terrain stage.
 */
export type PlacementPreview = Placement & { tileIndex: number; reason?: string; detail?: string; cost?: Readonly<Record<string, number>>; buildTime?: number };

export interface PlacementMode {
  /** Building id, or 'PORT' for the spaceport landed from the Ark. */
  kind: string;
  rotation: number;
  preview: PlacementPreview | null;
}

/** The ghost's verdict from the server's check of `kind` on `tileIndex` (cursor and tile-aimed placement). */
export function placementPreview(kind: string, tileIndex: number, r: BuildPreview): PlacementPreview {
  return {
    kind,
    tiles: r.tiles,
    valid: r.ok,
    tileIndex,
    ...(r.reason ? { reason: r.reason } : {}),
    ...(r.detail ? { detail: r.detail } : {}),
    ...(r.cost ? { cost: r.cost } : {}),
    ...(r.buildTime !== undefined ? { buildTime: r.buildTime } : {}),
  };
}

/** UI-only state of the game screen: view, selection, hover, modes. No game rules here. */
@Injectable({ providedIn: 'root' })
export class UiState {
  private readonly game = inject(GameService);

  readonly view = signal<ViewKind>('system');
  readonly selection = signal<Selection>({ kind: 'NONE' });
  readonly hover = signal<PickResult | null>(null);
  readonly placement = signal<PlacementMode | null>(null);
  /** Next click on a body orders the selected ship there ("Leć do…"). */
  readonly targeting = signal<boolean>(false);
  /** Next click on a tile drives this rover there ("Jedź do", 3D PoC: RMB with the rover selected). */
  readonly driveRover = signal<string | null>(null);
  readonly buildMenu = signal<boolean>(false);
  readonly perfVisible = signal<boolean>(true);
  /** The hub panel (B6 market, F3) and the corporation panel (S2, F4): one drawer at a time. */
  readonly hubOpen = signal<boolean>(false);
  readonly corpOpen = signal<boolean>(false);

  toggleHub(): void {
    this.hubOpen.update((v) => !v);
    this.corpOpen.set(false);
  }

  toggleCorp(): void {
    this.corpOpen.update((v) => !v);
    this.hubOpen.set(false);
  }
  /** Level of the sandbox (designer F2); a building's machine follows the building's recipe. */
  readonly atanorLevel = signal<string>('A_NAD');
  /** Fabryka atanorowa whose machine the Atanor view shows (AT1, A16); null = sandbox. */
  readonly atanorSite = signal<string | null>(null);
  /** Controls of the mounted Atanor view (W08 A building view), and its readout at ~4 Hz. */
  readonly atanor = signal<AtanorControls | null>(null);
  readonly atanorReadout = signal<AtanorReadout | null>(null);

  /** The building the Atanor view belongs to, while it stands. */
  readonly atanorBuilding = computed<Structure | null>(() => {
    const id = this.atanorSite();
    return id ? (this.game.world()?.structures.find((s) => s.id === id) ?? null) : null;
  });

  /** What the Atanor view shows: the building's recipe and level, or the sandbox level. */
  readonly atanorInput = computed<AtanorViewInput | null>(() => {
    if (this.view() !== 'atanor') return null;
    const s = this.atanorBuilding();
    return s ? { level: s.recipe ?? 'A_NAD', buildingLevel: Math.max(1, s.level) } : { level: this.atanorLevel(), buildingLevel: null };
  });

  /** Body the planet camera looks at and the build commands act on. */
  readonly focusBodyId = computed<BodyId | null>(() => {
    const sel = this.selection();
    if (sel.kind === 'BODY' || sel.kind === 'TILE') return sel.bodyId;
    return this.game.colonyBodyId();
  });

  /** The planet view needs a body to look at: a selected body, else the colony or home base. */
  readonly planetAvailable = computed(() => this.focusBodyId() !== null);

  select(s: Selection): void {
    this.selection.set(s);
    this.buildMenu.set(false);
    this.driveRover.set(null);
    // e.g. a planet chosen in the overview before there is a colony, then deselected
    if (this.view() === 'planet' && !this.planetAvailable()) this.view.set('system');
  }

  clear(): void {
    this.placement.set(null);
    this.targeting.set(false);
    this.driveRover.set(null);
    this.buildMenu.set(false);
    this.selection.set({ kind: 'NONE' });
  }

  /**
   * View after a (re)start: the colony planet when there is one, else the system with the Ark
   * selected. `keepAtanor`: a restart from the designer panel leaves the Atanor view open (it does
   * not depend on the world).
   */
  restartView(keepAtanor = false): void {
    this.clear();
    const w = this.game.world();
    const body = this.game.colonyBodyId();
    const ark = w?.ships.find((s) => s.role === 'MOTHERSHIP');
    if (keepAtanor && this.view() === 'atanor') return;
    if (body && (w?.colony.foundedAt !== null || !w.colony.siteBodyId)) {
      this.view.set('planet');
      if (w?.colony.siteBodyId) this.select({ kind: 'BODY', bodyId: body });
    } else if (ark) {
      this.view.set('system');
      this.select({ kind: 'SHIP', shipId: ark.id });
    } else {
      this.view.set('system');
    }
  }

  /** Opens the machine of a Fabryka atanorowa (card command "Maszyna"); the selection stays. */
  openAtanor(structureId: string): void {
    this.placement.set(null);
    this.targeting.set(false);
    this.driveRover.set(null);
    this.buildMenu.set(false);
    this.atanorSite.set(structureId);
    this.view.set('atanor');
  }

  /** Opens the sandbox: PoC lessons and recipes without a building (designer F2). */
  openSandbox(level?: string): void {
    if (level) this.atanorLevel.set(level);
    this.atanorSite.set(null);
    this.view.set('atanor');
  }

  /** Back from the Atanor view: to the planet with the building, else to the system. */
  closeAtanor(): void {
    this.view.set(this.planetAvailable() ? 'planet' : 'system');
  }

  startPlacement(kind: string): void {
    this.placement.set({ kind, rotation: 0, preview: null });
    this.targeting.set(false);
    this.driveRover.set(null);
    this.buildMenu.set(false);
  }

  rotate(): void {
    const p = this.placement();
    if (p) this.placement.set({ ...p, rotation: (p.rotation + 1) % 6, preview: null });
  }
}
