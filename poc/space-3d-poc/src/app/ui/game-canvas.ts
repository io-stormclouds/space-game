import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, effect, inject, viewChild } from '@angular/core';
import { PickResult } from '../engine/picking.service';
import { CommandService } from '../state/command.service';
import { GameLoopService } from '../state/game-loop.service';
import { GameStateService } from '../state/game-state.service';

/** Hosts the WebGL canvas and owns the engine lifecycle. */
@Component({
  selector: 'app-game-canvas',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'absolute inset-0 block' },
  template: `<canvas #canvas class="block w-full h-full touch-none"></canvas>`,
})
export class GameCanvas {
  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly loop = inject(GameLoopService);
  private readonly commands = inject(CommandService);
  private readonly state = inject(GameStateService);

  constructor() {
    afterNextRender(() => {
      this.loop.start(this.canvas().nativeElement, {
        onPrimary: (r) => this.onPrimary(r),
        onSecondary: (r) => this.onSecondary(r),
      });
    });
    effect(() => this.loop.setHighlighted(this.state.selectedShipId()));
    effect(() => this.loop.setHighlightedRover(this.state.selectedRoverId()));
    effect(() => {
      const t = this.state.selectedTile();
      this.loop.setSelectedTile(t ? { bodyId: t.bodyId, tileIndex: t.tileIndex } : null);
    });
    effect(() => {
      // placement kind, stockpile or structures changed → ghost colour may change
      this.state.placementKind();
      this.state.stockpile();
      this.state.structures();
      this.loop.refreshGhost();
    });
    inject(DestroyRef).onDestroy(() => this.loop.stop());
  }

  private onPrimary(r: PickResult): void {
    const placing = this.state.placementKind();
    switch (r.kind) {
      case 'SHIP':
        this.commands.select(r.shipId);
        break;
      case 'ROVER':
        this.commands.selectRover(r.roverId);
        break;
      case 'TILE':
        if (placing) this.commands.build(placing, r.bodyId, r.tileId);
        else this.commands.selectTile({ bodyId: r.bodyId, tileId: r.tileId, tileIndex: r.tileIndex });
        break;
      case 'EMPTY':
        if (placing) this.commands.setPlacement(null);
        else this.state.clearSelection();
        break;
      case 'BODY':
        this.commands.selectTile(null);
        break;
    }
  }

  private onSecondary(r: PickResult): void {
    if (this.state.placementKind()) {
      this.commands.setPlacement(null);
      return;
    }
    const rover = this.state.selectedRoverId();
    if (rover && r.kind === 'TILE') {
      this.commands.orderRoverMove(rover, r.bodyId, r.tileIndex);
      return;
    }
    const selected = this.state.selectedShipId();
    if (!selected || (r.kind !== 'BODY' && r.kind !== 'TILE')) return;
    this.commands.orderTransfer(selected, r.bodyId);
  }
}
