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

  select(s: Selection): void {
    this.selection.set(s);
    this.buildMenu.set(false);
  }

  clear(): void {
    this.placement.set(null);
    this.targeting.set(false);
    this.buildMenu.set(false);
    this.selection.set({ kind: 'NONE' });
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
