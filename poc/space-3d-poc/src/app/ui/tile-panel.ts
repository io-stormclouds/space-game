import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RESOURCE_INFO } from '../game/models/resource.model';
import { STRUCTURE_INFO } from '../game/models/structure.model';
import { CommandService } from '../state/command.service';
import { GameStateService } from '../state/game-state.service';
import { SimulationService } from '../state/simulation.service';

/** Context panel for the selected surface tile: what it is, its deposit, what stands on it. */
@Component({
  selector: 'app-tile-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'pointer-events-auto' },
  template: `
    @if (state.selectedTile(); as sel) {
      <div class="w-64 bg-slate-900/85 backdrop-blur rounded-lg border border-slate-700 p-4 flex flex-col gap-3 text-sm">
        <div class="flex items-start justify-between">
          <div>
            <div class="font-semibold text-base">{{ bodyName() }}</div>
            <div class="text-xs text-slate-400">Pole {{ sel.tileIndex }} · {{ kindLabel() }}</div>
          </div>
          <button class="text-slate-500 hover:text-slate-200 text-xs" (click)="commands.selectTile(null)">✕</button>
        </div>

        @if (deposit(); as d) {
          <div class="rounded border border-slate-700 bg-slate-800/60 px-3 py-2">
            <div class="flex justify-between"><span class="text-slate-400">Złoże</span><span class="font-semibold" [class]="d.cssClass">{{ d.name }}</span></div>
            <div class="flex justify-between text-xs"><span class="text-slate-400">Pozostało</span><span class="tabular-nums">{{ d.remaining }} / {{ d.initial }}</span></div>
          </div>
        } @else {
          <div class="text-xs text-slate-500">Brak złoża na tym polu.</div>
        }

        @if (state.selectedTileStructure(); as s) {
          <div class="rounded border border-emerald-700 bg-emerald-900/30 px-3 py-2 text-emerald-200">
            <div class="font-semibold">{{ info(s.kind).name }}</div>
            <div class="text-xs text-emerald-100/80">{{ info(s.kind).description }}</div>
            <div class="text-xs mt-1 flex justify-between"><span>Moc</span><span class="tabular-nums">{{ info(s.kind).power > 0 ? '+' : '' }}{{ info(s.kind).power }}</span></div>
            @if (info(s.kind).extracts; as r) {
              <div class="text-xs flex justify-between"><span>Wydobycie</span><span>{{ info(s.kind).rate }} {{ resourceName(r) }}/s</span></div>
            }
            <div class="text-[11px] text-emerald-100/60 mt-1">zbudowano w t = {{ s.builtAt.toFixed(0) }} s</div>
          </div>
        } @else if (state.placementKind(); as kind) {
          <button
            class="w-full rounded bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 px-3 py-1.5 font-medium"
            [disabled]="!canBuildHere()"
            (click)="commands.buildOnSelected()">
            Buduj tutaj: {{ info(kind).name }}
          </button>
          @if (!canBuildHere()) {
            <div class="text-xs text-amber-300">{{ reason() }}</div>
          }
        } @else {
          <div class="text-xs text-slate-500">Wybierz budowlę w menu na dole, aby ją tu postawić.</div>
        }
        <div class="text-[11px] text-slate-500">Budowle: {{ bodyStructureCount() }} na tym ciele · {{ state.structures().length }} łącznie</div>
      </div>
    }
  `,
})
export class TilePanel {
  protected readonly state = inject(GameStateService);
  protected readonly commands = inject(CommandService);
  private readonly sim = inject(SimulationService);

  private readonly tile = computed(() => {
    const sel = this.state.selectedTile();
    return sel ? this.sim.grids.get(sel.bodyId)?.tiles[sel.tileIndex] ?? null : null;
  });

  protected readonly bodyName = computed(() => {
    const sel = this.state.selectedTile();
    return sel ? this.state.body(sel.bodyId)?.name ?? sel.bodyId : '';
  });

  protected readonly kindLabel = computed(() => (this.tile()?.kind === 'PENT' ? 'pięciokąt' : 'sześciokąt'));

  protected readonly deposit = computed(() => {
    const t = this.tile();
    if (!t?.deposit) return null;
    const info = RESOURCE_INFO[t.deposit.resource];
    return { name: info.name, cssClass: info.cssClass, initial: t.deposit.amount, remaining: this.state.deposits()[t.id] ?? 0 };
  });

  private readonly check = computed(() => {
    const sel = this.state.selectedTile();
    const kind = this.state.placementKind();
    this.state.stockpile();
    this.state.structures();
    if (!sel || !kind) return null;
    return this.commands.canBuild(kind, sel.bodyId, sel.tileId);
  });

  protected readonly canBuildHere = computed(() => this.check()?.ok ?? false);
  protected readonly reason = computed(() => {
    const c = this.check();
    return c && !c.ok ? c.detail ?? c.reason : '';
  });

  protected readonly bodyStructureCount = computed(() => {
    const sel = this.state.selectedTile();
    return sel ? this.state.structures().filter((s) => s.bodyId === sel.bodyId).length : 0;
  });

  protected info(kind: keyof typeof STRUCTURE_INFO) {
    return STRUCTURE_INFO[kind];
  }

  protected resourceName(kind: keyof typeof RESOURCE_INFO): string {
    return RESOURCE_INFO[kind].name;
  }
}
