import { Injectable, computed, inject, signal } from '@angular/core';
import type { BodyId } from '@space-game/api';
import type { AtanorControls, AtanorReadout, PickResult, Placement, Selection, ViewKind } from '@space-game/render';
import { GameService } from './game.service';

export interface PlacementMode {
  /** Building id, or 'PORT' for the spaceport landed from the Ark. */
  kind: string;
  rotation: number;
  /** Last checked tile and its verdict (ghost). */
  preview: (Placement & { tileIndex: number; reason?: string; detail?: string }) | null;
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
  readonly buildMenu = signal<boolean>(false);
  readonly perfVisible = signal<boolean>(true);
  readonly atanorLevel = signal<string>('A_NAD');
  /** Controls of the mounted Atanor view (W08 A building view), and its readout at ~4 Hz. */
  readonly atanor = signal<AtanorControls | null>(null);
  readonly atanorReadout = signal<AtanorReadout | null>(null);

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
    // e.g. a planet chosen in the overview before there is a colony, then deselected
    if (this.view() === 'planet' && !this.planetAvailable()) this.view.set('system');
  }

  clear(): void {
    this.placement.set(null);
    this.targeting.set(false);
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

  startPlacement(kind: string): void {
    this.placement.set({ kind, rotation: 0, preview: null });
    this.targeting.set(false);
    this.buildMenu.set(false);
  }

  rotate(): void {
    const p = this.placement();
    if (p) this.placement.set({ ...p, rotation: (p.rotation + 1) % 6, preview: null });
  }
}
