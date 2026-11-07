import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RESOURCE_INFO, RESOURCE_KINDS, formatCost } from '../game/models/resource.model';
import { BUILDABLE_KINDS, STRUCTURE_INFO, StructureKind } from '../game/models/structure.model';
import { CommandService, rejectMessage } from '../state/command.service';
import { GameStateService } from '../state/game-state.service';

interface Card {
  kind: StructureKind;
  name: string;
  cost: string;
  power: number;
  extracts: string | null;
  available: boolean;
  reason: string | null;
  active: boolean;
}

/** Space-RTS build bar: one card per structure kind with cost, power and why it cannot be built. */
@Component({
  selector: 'app-build-menu',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'pointer-events-auto' },
  template: `
    <div class="flex items-stretch gap-1.5 px-2 py-1.5 bg-slate-900/85 backdrop-blur rounded-t-lg border-t border-x border-slate-700 text-xs">
      @for (c of cards(); track c.kind) {
        <button
          class="w-28 rounded border px-2 py-1.5 text-left flex flex-col gap-0.5 transition-colors"
          [class]="c.active ? 'border-cyan-400 bg-cyan-900/40' : c.available ? 'border-slate-600 hover:bg-slate-700/70' : 'border-slate-800 text-slate-500'"
          [title]="c.reason ?? ''"
          (click)="commands.setPlacement(c.kind)">
          <span class="font-semibold leading-tight" [class.text-slate-100]="c.available">{{ c.name }}</span>
          <span class="text-[10px] leading-tight text-slate-400">{{ c.cost }}</span>
          <span class="text-[10px] leading-tight" [class]="c.power >= 0 ? 'text-green-300' : 'text-amber-300'">
            {{ c.power >= 0 ? '+' : '' }}{{ c.power }} mocy
            @if (c.extracts) { · złoże: {{ c.extracts }} }
          </span>
          @if (c.reason) {
            <span class="text-[10px] leading-tight text-red-300">{{ c.reason }}</span>
          }
        </button>
      }
    </div>
    @if (state.placementKind(); as kind) {
      <div class="text-center text-[11px] text-cyan-200 py-0.5">
        Umieszczanie: {{ info(kind).name }} · LPM na polu buduje · PPM lub Esc anuluje
      </div>
    }
  `,
})
export class BuildMenu {
  protected readonly state = inject(GameStateService);
  protected readonly commands = inject(CommandService);

  protected readonly cards = computed<Card[]>(() => {
    // dependencies: stockpile, structures, focus body, placement
    this.state.stockpile();
    this.state.structures();
    const body = this.state.focusBodyId();
    const active = this.state.placementKind();
    return BUILDABLE_KINDS.map((kind) => {
      const info = STRUCTURE_INFO[kind];
      const check = this.commands.availability(kind, body);
      return {
        kind,
        name: info.name,
        cost: formatCost(info.cost),
        power: info.power,
        extracts: info.extracts ? RESOURCE_INFO[info.extracts].name : null,
        available: check.ok,
        reason: check.ok ? null : rejectMessage(check.reason, check.detail),
        active: active === kind,
      };
    });
  });

  protected readonly kinds = RESOURCE_KINDS;

  protected info(kind: StructureKind) {
    return STRUCTURE_INFO[kind];
  }
}
