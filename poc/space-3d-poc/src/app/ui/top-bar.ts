import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RESOURCE_INFO, RESOURCE_KINDS } from '../game/models/resource.model';
import { GameLoopService } from '../state/game-loop.service';
import { GameStateService } from '../state/game-state.service';

@Component({
  selector: 'app-top-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  host: { class: 'pointer-events-auto' },
  template: `
    <div class="flex items-center gap-5 px-4 py-2 bg-slate-900/80 backdrop-blur rounded-b-lg border-b border-x border-slate-700 text-sm">
      @for (r of resources(); track r.kind) {
        <div class="flex items-center gap-1.5" [title]="r.name">
          <span class="text-slate-400">{{ r.name }}</span>
          <span class="font-semibold tabular-nums" [class]="r.cssClass">{{ r.amount | number: '1.0-0' }}</span>
        </div>
      }
      <div class="h-5 w-px bg-slate-700"></div>
      <div class="flex items-center gap-2" [title]="'Moc: ' + focusBodyName()">
        <span class="text-slate-400">Moc</span>
        <div class="w-20 h-2 rounded bg-slate-700/70 overflow-hidden">
          <div class="h-full" [class]="power().available > 0 ? 'bg-green-400' : 'bg-amber-400'" [style.width.%]="powerPercent()"></div>
        </div>
        <span class="tabular-nums text-xs" [class]="power().available > 0 ? 'text-green-300' : 'text-amber-300'">{{ power().consumed }} / {{ power().produced }}</span>
      </div>
      <div class="flex items-center gap-2"><span class="text-slate-400">Statki</span><span class="font-semibold tabular-nums">{{ state.activeShipCount() }} / {{ state.spacecraft().length }}</span></div>
      <div class="h-5 w-px bg-slate-700"></div>
      <div class="flex items-center gap-1">
        <button (click)="state.togglePause()" class="px-2 py-0.5 rounded hover:bg-slate-700" [class.text-amber-300]="state.isPaused()">{{ state.isPaused() ? '▶' : '⏸' }}</button>
        @for (s of scales; track s) {
          <button (click)="state.setTimeScale(s)" class="px-2 py-0.5 rounded hover:bg-slate-700 tabular-nums" [class.bg-slate-700]="state.timeScale() === s">{{ s }}×</button>
        }
      </div>
      <div class="text-slate-400 tabular-nums">t = {{ state.gameTime() | number: '1.0-0' }} s</div>
      <div class="text-slate-500 tabular-nums text-xs">{{ loop.fps() }} fps</div>
    </div>
  `,
})
export class TopBar {
  protected readonly state = inject(GameStateService);
  protected readonly loop = inject(GameLoopService);
  protected readonly scales = [1, 3, 10];

  protected readonly resources = computed(() => {
    const stock = this.state.stockpile();
    return RESOURCE_KINDS.map((kind) => ({ kind, name: RESOURCE_INFO[kind].name, cssClass: RESOURCE_INFO[kind].cssClass, amount: stock[kind] }));
  });

  protected readonly power = computed(() => this.state.focusPower());
  protected readonly powerPercent = computed(() => {
    const p = this.power();
    return p.produced > 0 ? Math.min(100, (p.consumed / p.produced) * 100) : 100;
  });
  protected readonly focusBodyName = computed(() => this.state.body(this.state.focusBodyId())?.name ?? '');
}
