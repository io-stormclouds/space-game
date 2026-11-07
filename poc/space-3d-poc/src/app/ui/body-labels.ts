import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { GameLoopService } from '../state/game-loop.service';

/** HTML labels projected over the 3D bodies. Positions come from the game loop at ~10 Hz. */
@Component({
  selector: 'app-body-labels',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'absolute inset-0 pointer-events-none' },
  template: `
    @for (l of loop.labels(); track l.bodyId) {
      <div class="absolute -translate-x-1/2 -translate-y-full text-center text-xs leading-tight" [style.left.%]="l.x" [style.top.%]="l.y">
        <div class="text-slate-200 drop-shadow">{{ l.name }}</div>
        @if (l.minerals !== null) {
          <div class="text-amber-300 tabular-nums drop-shadow">⛏ Ferryt {{ l.minerals }}</div>
        }
      </div>
    }
  `,
})
export class BodyLabels {
  protected readonly loop = inject(GameLoopService);
}
