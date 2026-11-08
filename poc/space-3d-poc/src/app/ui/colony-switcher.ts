import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { COLONY_IDS } from '../game/config/initial-world';
import { tileId } from '../game/models/planet-grid.model';
import { BodyId } from '../shared/ids';
import { CommandService } from '../state/command.service';
import { GameLoopService } from '../state/game-loop.service';
import { GameStateService } from '../state/game-state.service';
import { SimulationService } from '../state/simulation.service';

/**
 * Camera jumps between the home planet and the three showcase colonies (art-style comparison).
 * Selecting the colony's centre tile is enough: the camera follows the body of the selected tile.
 */
@Component({
  selector: 'app-colony-switcher',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'pointer-events-auto' },
  template: `
    <div class="flex flex-col gap-1 bg-slate-900/80 backdrop-blur rounded-lg border border-slate-700 p-2 text-xs w-48">
      <div class="text-slate-400 px-1 pb-1">Porównanie stylów</div>
      @for (e of entries(); track e.id) {
        <button
          class="text-left px-2 py-1 rounded hover:bg-slate-700 flex justify-between gap-2"
          [class.bg-slate-700]="e.active"
          (click)="go(e.id)">
          <span>{{ e.name }}</span>
          <span class="text-slate-500">{{ e.hint }}</span>
        </button>
      }
    </div>
  `,
})
export class ColonySwitcher {
  private readonly state = inject(GameStateService);
  private readonly commands = inject(CommandService);
  private readonly sim = inject(SimulationService);
  private readonly loop = inject(GameLoopService);

  private readonly hints = ['A', 'B', 'C'];

  protected readonly entries = computed(() => {
    const focus = this.state.focusBodyId();
    const home = this.state.homeBase();
    return [
      { id: home.id, name: home.name, hint: 'dom', active: focus === home.id },
      ...COLONY_IDS.map((id, i) => {
        const name = this.state.body(id)?.name ?? id;
        return { id, name: name.replace(/^Kolonia [ABC] · /, ''), hint: this.hints[i], active: focus === id };
      }),
    ];
  });

  protected go(bodyId: BodyId): void {
    const layout = this.sim.colonies.get(bodyId);
    const grid = this.sim.grids.get(bodyId);
    if (!grid) return;
    const index = layout?.centerTile ?? grid.tiles.reduce((best, t) => (t.normal.y > best.normal.y ? t : best), grid.tiles[0]).index;
    this.commands.select(null);
    this.commands.selectRover(null);
    this.commands.selectTile({ bodyId, tileId: tileId(bodyId, index), tileIndex: index });
    this.loop.viewTile(bodyId, index);
  }
}
