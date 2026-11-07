import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RESOURCE_INFO, RESOURCE_KINDS } from '../game/models/resource.model';
import { cargoTotal } from '../game/reducer';
import { CommandService } from '../state/command.service';
import { GameStateService } from '../state/game-state.service';
import { ProgressBar } from './progress-bar';

const STATE_LABEL = { DOCKED: 'Zadokowany', IN_TRANSIT: 'W locie', MINING: 'Wydobycie' } as const;

@Component({
  selector: 'app-ship-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProgressBar, DecimalPipe],
  host: { class: 'pointer-events-auto' },
  template: `
    @if (state.selectedShip(); as ship) {
      <div class="w-72 bg-slate-900/85 backdrop-blur rounded-lg border border-slate-700 p-4 flex flex-col gap-3 text-sm">
        <div class="flex items-start justify-between">
          <div>
            <div class="font-semibold text-base">{{ ship.name }}</div>
            <div class="text-xs text-slate-400">{{ location() }}</div>
          </div>
          <span class="text-xs px-2 py-0.5 rounded-full border" [class]="badgeClass()">{{ stateLabel() }}</span>
        </div>

        <app-progress-bar label="Paliwo" [value]="ship.fuel" [max]="ship.maxFuel" colorClass="bg-blue-500" lowClass="bg-yellow-400" />
        <app-progress-bar label="Ładownia" [value]="cargoTotal(ship.cargo)" [max]="ship.maxCargo" colorClass="bg-orange-500" />
        <div class="flex gap-3 text-[11px] -mt-1">
          @for (r of resourceKinds; track r) {
            @if (ship.cargo[r] > 0) {
              <span [class]="resourceInfo[r].cssClass">{{ resourceInfo[r].name }} {{ ship.cargo[r] | number: '1.0-0' }}</span>
            }
          }
        </div>

        @if (ship.state === 'IN_TRANSIT' && ship.transfer; as plan) {
          <div class="text-xs text-slate-300">
            <div class="flex justify-between"><span>Cel</span><span>{{ bodyName(plan.toBodyId) }}</span></div>
            <div class="flex justify-between"><span>ETA</span><span class="tabular-nums">{{ eta() | number: '1.0-1' }} s</span></div>
            <div class="h-1 mt-1 w-full rounded bg-slate-700/70 overflow-hidden">
              <div class="h-full bg-cyan-400" [style.width.%]="state.selectedTransitProgress() * 100"></div>
            </div>
          </div>
        }

        <button
          class="mt-1 w-full rounded bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 disabled:text-slate-500 px-3 py-1.5 font-medium"
          [disabled]="!canReturn()"
          (click)="commands.returnToBase(ship.id)">
          Wróć do bazy
        </button>
        <div class="text-[11px] text-slate-500">LPM: statek lub pole · PPM na ciele: rozkaz lotu · Spacja: pauza · 1/2/3: tempo · Esc: odznacz</div>
      </div>
    } @else {
      <div class="w-72 bg-slate-900/60 backdrop-blur rounded-lg border border-slate-800 p-4 text-xs text-slate-400">
        Kliknij statek (LPM), aby go zaznaczyć, potem PPM na Księżyc, Asteroidę lub Planetę, aby wydać rozkaz lotu. LPM na polu planety lub Księżyca otwiera panel budowy.
      </div>
    }
  `,
})
export class ShipPanel {
  protected readonly state = inject(GameStateService);
  protected readonly commands = inject(CommandService);
  protected readonly resourceKinds = RESOURCE_KINDS;
  protected readonly resourceInfo = RESOURCE_INFO;
  protected readonly cargoTotal = cargoTotal;

  protected readonly stateLabel = computed(() => {
    const s = this.state.selectedShip();
    return s ? STATE_LABEL[s.state] : '';
  });

  protected readonly badgeClass = computed(() => {
    switch (this.state.selectedShip()?.state) {
      case 'IN_TRANSIT':
        return 'border-cyan-500 text-cyan-300';
      case 'MINING':
        return 'border-orange-500 text-orange-300';
      default:
        return 'border-slate-500 text-slate-300';
    }
  });

  protected readonly location = computed(() => {
    const s = this.state.selectedShip();
    if (!s) return '';
    if (s.currentBodyId) return `Orbita: ${this.bodyName(s.currentBodyId)}`;
    return 'Przestrzeń międzyplanetarna';
  });

  protected readonly canReturn = computed(() => {
    const s = this.state.selectedShip();
    return !!s && s.state !== 'IN_TRANSIT' && s.currentBodyId !== this.state.homeBase().id;
  });

  protected readonly eta = computed(() => {
    const plan = this.state.selectedShip()?.transfer;
    if (!plan) return 0;
    return Math.max(0, plan.estimatedDuration * (1 - this.state.selectedTransitProgress()));
  });

  protected bodyName(id: string): string {
    return this.state.bodies().find((b) => b.id === id)?.name ?? id;
  }
}
