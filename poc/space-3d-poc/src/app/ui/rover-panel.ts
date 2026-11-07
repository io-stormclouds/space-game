import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CommandService } from '../state/command.service';
import { GameStateService } from '../state/game-state.service';

/** Context panel for the selected rover. */
@Component({
  selector: 'app-rover-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'pointer-events-auto' },
  template: `
    @if (state.selectedRover(); as rover) {
      <div class="w-72 bg-slate-900/85 backdrop-blur rounded-lg border border-slate-700 p-4 flex flex-col gap-2 text-sm">
        <div class="flex items-start justify-between">
          <div>
            <div class="font-semibold text-base">{{ rover.name }}</div>
            <div class="text-xs text-slate-400">{{ bodyName() }} · pole {{ rover.tileIndex }}</div>
          </div>
          <span class="text-xs px-2 py-0.5 rounded-full border" [class]="rover.state === 'MOVING' ? 'border-amber-500 text-amber-300' : 'border-slate-500 text-slate-300'">
            {{ rover.state === 'MOVING' ? 'W drodze' : 'Postój' }}
          </span>
        </div>
        @if (rover.state === 'MOVING') {
          <div class="text-xs text-slate-300">Do celu: {{ rover.path.length }} kafelków</div>
        }
        <div class="text-[11px] text-slate-500">PPM na polu tej planety: jedź · budowle blokują przejazd (poza lądowiskiem)</div>
        <button class="text-xs text-slate-400 hover:text-slate-200 self-start" (click)="commands.selectRover(null)">Odznacz</button>
      </div>
    }
  `,
})
export class RoverPanel {
  protected readonly state = inject(GameStateService);
  protected readonly commands = inject(CommandService);

  protected readonly bodyName = computed(() => {
    const r = this.state.selectedRover();
    return r ? this.state.body(r.bodyId)?.name ?? r.bodyId : '';
  });
}
