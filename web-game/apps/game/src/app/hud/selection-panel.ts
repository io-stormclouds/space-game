import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { Structure } from '@space-game/api';
import { HudFrame, RtsButton } from '@space-game/ui';
import { BUILD_KEYS, CommandsService } from '../game/commands';
import { bodyName, buildingName, costText } from '../game/format';
import { GameService } from '../game/game.service';
import { UiState } from '../game/ui-state';
import { TEXT } from '../i18n/pl';

const round1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString('pl-PL');

/** "Zaznaczenie" (canvas boards 3–6): what is selected and what it does; the build catalog. */
@Component({
  selector: 'wg-selection-panel',
  imports: [HudFrame, RtsButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:keydown)': 'onKey($event)' },
  template: `
    <section hudFrame class="panel sel" [label]="ui.buildMenu() ? t.catalog.tab : t.selection.tab" [serial]="serial()">
      <div class="scroll">
      @if (ui.view() === 'atanor') {
        @if (ui.atanorReadout(); as a) {
          <div class="head">
            <h2 class="hud-title sg">{{ a.levelName }}</h2>
            <span class="hud-micro" data-atanor="where">{{ a.recipeId ?? '' }} · {{ a.siteLevel ? t.atanor.building(a.siteLevel) : t.atanor.sandbox }}</span>
            <span class="tag" [class.tag--al]="!!a.jam" [class.tag--sg]="a.playing && !a.jam">{{ a.jam ? t.atanor.jam : a.playing ? t.atanor.running : t.atanor.stopped }}</span>
          </div>
          <dl class="kv">
            <div><dt>{{ t.atanor.ticks }}</dt><dd data-atanor="ticks">{{ a.ticks }}</dd></div>
            <div><dt>{{ t.atanor.delivered }}</dt><dd data-atanor="delivered">{{ a.delivered }} / {{ a.target }}</dd></div>
            <div><dt>{{ t.atanor.cycles }}</dt><dd>{{ a.cyclesPerOutput ?? t.atanor.unmeasured }}</dd></div>
            <div><dt>{{ t.atanor.area }}</dt><dd>{{ a.area }}</dd></div>
          </dl>
          @if (a.jam) {
            <span class="al">{{ a.jam.reason }}: {{ a.jam.message }}</span>
          }
        } @else {
          <span class="dim">{{ t.world.loading }}</span>
        }
      } @else if (ui.buildMenu()) {
        <h2 class="hud-title sg">{{ catalogTitle() }}</h2>
        <div class="catalog">
          @for (b of commands.buildList(); track b.id) {
            <hud-rts-button
              [label]="b.name + ' · ' + b.footprint + ' p.'"
              [hotkey]="b.hotkey"
              [cost]="b.cost"
              [disabledReason]="b.reason || undefined"
              (activated)="commands.startPlacement(b.id)"
            />
          }
        </div>
      } @else {
        @switch (view().kind) {
          @case ('ship') {
            @let s = view().ship!;
            <div class="head"><h2 class="hud-title sg">{{ s.name }}</h2><span class="hud-micro">{{ s.role === 'MOTHERSHIP' ? t.selection.mothership : '' }} · {{ t.selection.state[s.state] }}</span><span class="tag">{{ t.selection.hull }}</span></div>
            <dl class="kv">
              <div><dt>{{ t.selection.fuel }}</dt><dd>{{ round(s.fuel) }} / {{ s.maxFuel }}</dd></div>
              <div><dt>{{ t.selection.hold }}</dt><dd>{{ used(s.cargo) }} / {{ s.maxCargo }} j.</dd></div>
              @if (s.state === 'IN_TRANSIT' && s.transfer; as plan) {
                <div><dt>{{ t.selection.target }}</dt><dd>{{ bodyLabel(plan.toBodyId) }}</dd></div>
                <div><dt>{{ t.selection.eta }}</dt><dd data-ship="eta">{{ t.units.min(max0(plan.startTime + plan.estimatedDuration - game.time())) }}</dd></div>
              }
            </dl>
            @if (s.onboard) {
              <div class="tagline"><span class="k">{{ t.selection.onboard }}</span>
                <span class="tag">{{ t.selection.rovers(s.onboard.rovers) }}</span>
                <span class="tag">{{ t.selection.shuttles(s.onboard.shuttles) }}</span>
                <span class="tag">{{ t.selection.probes(s.onboard.probes) }}</span>
              </div>
            }
            <div class="tagline">@for (c of cargo(s.cargo); track c) {<span class="tag tag--ok">{{ c }}</span>}</div>
          }
          @case ('body') {
            @let b = view().body!;
            <div class="head">
              <h2 class="hud-title sg">{{ b.revealed === false ? (b.unknownName ?? b.name) : b.name }}</h2>
              <span class="hud-micro">{{ b.revealed === false ? t.scan.unknown : (b.profile?.type ?? t.selection.planetBody) }}</span>
              @if (b.profile && b.revealed !== false) {<span class="tag" [class.tag--sg]="b.profile.rating === 'zalecana'">{{ t.scan.rating }} · {{ b.profile.rating }}</span>}
            </div>
            @if (b.revealed !== false && b.profile) {
              <div class="split">
                <div>
                  <dl class="kv">
                    <div><dt>{{ t.scan.grid }}</dt><dd>{{ b.surfaceGrid ? t.scan.tiles(10 * b.surfaceGrid.frequency * b.surfaceGrid.frequency + 2) : t.scan.noGrid }}</dd></div>
                    <div><dt>{{ t.scan.atmosphere }}</dt><dd>{{ t.scan.atmospheres[b.atmosphere ?? 'none'] }}</dd></div>
                    <div><dt>{{ t.scan.shuttle }}</dt><dd>{{ b.profile.shuttleLaunchFuel ?? '—' }} u</dd></div>
                    <div><dt>{{ t.scan.insolation }}</dt><dd>×{{ round(b.insolation ?? 1) }}</dd></div>
                    <div><dt>{{ t.scan.temperature }}</dt><dd>{{ b.profile.temperature }}</dd></div>
                    <div><dt>{{ t.scan.water }}</dt><dd>{{ b.profile.water }}</dd></div>
                  </dl>
                  <p class="note dim">{{ b.profile.note }}</p>
                </div>
                @if (view().canChoose) {
                  <div class="choose">
                    <hud-rts-button [label]="t.scan.choose" hotkey="Enter" variant="primary" icon="rally" (activated)="commands.chooseSite(b.id)" />
                    <span class="hud-micro">{{ t.scan.chooseNote(b.profile.shuttleLaunchFuel ?? 0) }}</span>
                    <span class="hud-micro">{{ t.scan.final }}</span>
                  </div>
                }
              </div>
            }
            @if (view().structures.length) {
              <ul class="list structures">
                @for (x of view().structures; track x.id) {
                  <li (click)="ui.select({ kind: 'STRUCTURE', structureId: x.id })" [attr.data-structure]="x.id">
                    <span>{{ x.name }}</span><span class="dim">L{{ x.level || 1 }}</span><span class="tag" [class.tag--sg]="x.state !== 'ACTIVE'">{{ x.stateText }}</span>
                  </li>
                }
                @for (r of view().rovers; track r.id) {
                  <li (click)="ui.select({ kind: 'ROVER', roverId: r.id })" [attr.data-rover]="r.id"><span>{{ r.name }}</span><span class="dim">{{ r.where }}</span><span class="tag">{{ r.stateText }}</span></li>
                }
              </ul>
            }
          }
          @case ('tile') {
            @let b = view().body!;
            @let ti = commands.tile();
            <div class="head" [attr.data-tile]="view().tileIndex">
              <h2 class="hud-title sg">{{ t.selection.tile(view().tileIndex) }}</h2>
              <span class="hud-micro">{{ b.name }}{{ ti ? ' · ' + t.selection.tileKind[ti.kind] : '' }}</span>
              <span class="tag" [class.tag--sg]="!!ti?.deposit">{{ ti?.structureId ? t.selection.tileTaken : ti?.deposit ? ti!.deposit!.material : t.selection.tileFree }}</span>
            </div>
            @if (!ti) {
              <span class="dim">{{ t.selection.checking }}</span>
            } @else {
              <div class="split">
                <div class="stack">
                  @if (ti.deposit; as d) {
                    <dl class="kv">
                      <div><dt>{{ t.selection.deposit }}</dt><dd data-tile-deposit>{{ d.material }} · {{ materialName(d.material) }}</dd></div>
                      <div><dt>{{ t.selection.left }}</dt><dd>{{ round(d.remaining) }} / {{ d.initial }}</dd></div>
                    </dl>
                    <div class="bar-meter"><span [style.width.%]="d.initial ? (100 * d.remaining) / d.initial : 0"></span></div>
                  } @else {
                    <span class="dim" data-tile-deposit>{{ t.selection.noDeposit }}</span>
                  }
                  @if (standing(); as st) {
                    <ul class="list structures">
                      <li (click)="ui.select({ kind: 'STRUCTURE', structureId: st.id })" [attr.data-structure]="st.id">
                        <span>{{ t.selection.standsHere }}: {{ st.name }}</span><span class="dim">L{{ st.level || 1 }}</span><span class="tag" [class.tag--sg]="st.state !== 'ACTIVE'">{{ st.stateText }}</span>
                      </li>
                    </ul>
                  }
                  <span class="hud-micro">{{ t.selection.onBody(view().structures.length) }}</span>
                </div>
                <div class="stack">
                  <span class="k">{{ t.selection.fits }}</span>
                  <div class="tagline" data-tile-fits>
                    @for (o of fits(); track o.kind) {
                      <span class="tag" [class.tag--sg]="!!o.extracts">{{ o.name }}</span>
                    } @empty {
                      <span class="dim">{{ t.selection.fitsNone }}</span>
                    }
                  </div>
                </div>
              </div>
            }
          }
          @case ('structure') {
            @let x = view().structure!;
            <div class="head">
              <h2 class="hud-title sg">{{ x.name }}</h2>
              <span class="hud-micro">{{ t.selection.level(x.s.level || 1) }} · {{ t.selection.tiles(x.s.tiles.length) }} · {{ x.where }}</span>
              <span class="tag" [class.tag--sg]="x.s.state !== 'ACTIVE'">{{ t.selection.structureState[x.s.state] }}</span>
            </div>
            <dl class="kv">
              @if (x.s.state !== 'ACTIVE') {<div><dt>{{ t.selection.progress }}</dt><dd>{{ pct(x.s.progress) }}%</dd></div>}
              <div><dt>{{ t.selection.power }}</dt><dd>{{ x.power }} MW</dd></div>
              <div><dt>{{ t.selection.crew }}</dt><dd>{{ x.crew }}</dd></div>
              @if (x.output) {<div><dt>{{ t.selection.output }}</dt><dd>{{ x.output }}</dd></div>}
              @if (x.recipe) {<div><dt>{{ t.selection.recipe }}</dt><dd>{{ x.recipe }}</dd></div>}
              @if (x.storage) {<div><dt>{{ t.selection.storage }}</dt><dd>{{ x.storage }}</dd></div>}
            </dl>
            @if (x.s.kind === 'LAND') {
              <p class="note dim">{{ t.selection.padNote }}</p>
            }
            @if (x.next) {
              <span class="hud-micro">{{ x.next.title }}</span>
              <div class="tagline">@for (c of x.next.cost; track c.code) {<span class="tag" [class.tag--al]="c.missing" [class.tag--ok]="!c.missing">{{ c.code }} {{ c.amount }}</span>}</div>
            }
          }
          @case ('rover') {
            @let r = view().rover!;
            <div class="head"><h2 class="hud-title sg">{{ r.name }}</h2><span class="hud-micro">{{ t.selection.rover }}</span><span class="tag">{{ t.selection.roverState[r.state] }}</span></div>
            <dl class="kv">
              <div><dt>{{ t.selection.job }}</dt><dd>{{ view().job }}</dd></div>
              <div><dt>{{ t.selection.tile(r.tileIndex) }}</dt><dd>{{ bodyLabel(r.bodyId) }}</dd></div>
              @if (r.state === 'MOVING') {
                <div><dt>{{ t.selection.toGo }}</dt><dd data-rover="to-go">{{ t.selection.tilesToGo(r.path.length) }}</dd></div>
              }
            </dl>
          }
          @default {
            <h2 class="hud-title dim">{{ t.selection.none }}</h2>
            <span class="dim">{{ t.selection.noneHint }}</span>
          }
        }
      }
      </div>
    </section>
  `,
  styles: `
    :host { display: block; min-width: 0; min-height: 0; }
    .sel { height: 100%; }
    .head { display: flex; align-items: baseline; gap: var(--hud-space-5); }
    .head .tag { margin-left: auto; }
    .split { display: grid; grid-template-columns: minmax(0, 1fr) 260px; gap: var(--hud-space-6); }
    .choose { display: flex; flex-direction: column; gap: var(--hud-space-3); }
    .note { margin: var(--hud-space-3) 0 0; font-size: var(--hud-font-size-label); }
    .structures li { grid-template-columns: 1fr 40px 120px; cursor: pointer; }
    .structures li:hover { background: var(--hud-color-graphite); }
    .structures .tag { justify-self: end; }
    .catalog { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--hud-space-3); }
    .stack { display: flex; flex-direction: column; gap: var(--hud-space-3); min-width: 0; }
  `,
})
export class SelectionPanel {
  protected readonly t = inject(TEXT);
  protected readonly game = inject(GameService);
  protected readonly ui = inject(UiState);
  protected readonly commands = inject(CommandsService);

  protected readonly serial = computed(() => {
    const s = this.ui.selection();
    return `SEL · ${s.kind === 'NONE' ? '—' : (s as { bodyId?: string; shipId?: string; structureId?: string; roverId?: string }).bodyId ?? (s as { shipId?: string }).shipId ?? (s as { structureId?: string }).structureId ?? (s as { roverId?: string }).roverId ?? ''}`.toUpperCase();
  });

  protected readonly catalogTitle = computed(() => this.t.catalog.title(bodyName(this.game.world(), this.ui.focusBodyId())));

  protected readonly view = computed(() => {
    const w = this.game.world();
    const cat = this.game.catalog();
    const sel = this.ui.selection();
    const empty = { kind: 'none' as const, ship: null, body: null, structure: null, rover: null, structures: [], rovers: [], canChoose: false, job: '', tileIndex: -1 };
    if (!w) return empty;
    if (sel.kind === 'SHIP') {
      const ship = w.ships.find((s) => s.id === sel.shipId);
      return ship ? { ...empty, kind: 'ship' as const, ship } : empty;
    }
    if (sel.kind === 'BODY' || sel.kind === 'TILE') {
      const body = w.bodies.find((b) => b.id === sel.bodyId);
      if (!body) return empty;
      const structures = w.structures
        .filter((s) => s.bodyId === body.id)
        .map((s) => ({ id: s.id, name: buildingName(cat, s.kind), level: s.level, state: s.state, stateText: this.stateText(s) }));
      const rovers = w.rovers
        .filter((r) => r.bodyId === body.id)
        .map((r) => ({ id: r.id, name: r.name, stateText: this.t.selection.roverState[r.state] ?? r.state, where: this.t.selection.tile(r.tileIndex) }));
      const canChoose = !w.colony.siteBodyId && w.scan.state === 'DONE' && !!body.surfaceGrid;
      // a tile of a revealed grid body: the tile panel (3D PoC); before the scan, the body
      if (sel.kind === 'TILE' && body.surfaceGrid && body.revealed !== false && !canChoose) {
        return { ...empty, kind: 'tile' as const, body, structures, rovers, tileIndex: sel.tileIndex };
      }
      return { ...empty, kind: 'body' as const, body, structures, rovers, canChoose };
    }
    if (sel.kind === 'STRUCTURE') {
      const s = w.structures.find((x) => x.id === sel.structureId);
      const def = cat?.buildings.find((b) => b.id === s?.kind);
      if (!s || !def) return empty;
      const lvl = def.levels[Math.max(0, (s.level || 1) - 1)]!;
      const next = def.levels[s.level];
      const store = this.game.snapshot()?.colonies[s.bodyId]?.storage ?? {};
      const deposit = def.extracts.length ? `${def.extracts.map((e) => `${round1(e.rate * Math.pow(1.6, Math.max(0, s.level - 1)))} ${e.material}/min`).join(' · ')}` : '';
      return {
        ...empty,
        kind: 'structure' as const,
        structure: {
          s,
          name: def.name,
          where: bodyName(w, s.bodyId),
          power: (lvl.power > 0 ? '+' : '') + round1(lvl.power),
          crew: lvl.crew < 0 ? `+${round1(-lvl.crew)} miejsc` : round1(lvl.crew),
          output: s.state === 'ACTIVE' ? deposit : '',
          recipe: s.recipe ? `${s.recipe}${s.batch ? ` · ${this.pct(s.batch.progress)}%` : ''}` : '',
          storage: Object.entries(lvl.storage).map(([cls, q]) => `${cls} ${Math.round(q)} j.`).join(' · '),
          next: next ? { title: this.t.selection.nextLevel(next.level, this.t.units.min(next.buildTime)), cost: Object.entries(next.cost).map(([code, amount]) => ({ code, amount, missing: (store[code] ?? 0) < amount })) } : null,
        },
      };
    }
    if (sel.kind === 'ROVER') {
      const rover = w.rovers.find((r) => r.id === sel.roverId);
      if (!rover) return empty;
      const job = rover.job ? buildingName(cat, w.structures.find((s) => s.id === rover.job)?.kind ?? '') : '—';
      return { ...empty, kind: 'rover' as const, rover, job };
    }
    return empty;
  });

  /** What can stand on the selected tile now (server check), extractors of its deposit first. */
  protected readonly fits = computed(() => {
    const ti = this.commands.tile();
    const cat = this.game.catalog();
    if (!ti) return [];
    return ti.options
      .filter((o) => o.ok)
      .sort((a, b) => Number(!!b.extracts && !!ti.deposit) - Number(!!a.extracts && !!ti.deposit))
      .map((o) => ({ kind: o.kind, name: buildingName(cat, o.kind), extracts: ti.deposit && o.extracts ? o.extracts : null }));
  });

  /** The structure on the selected tile (3D PoC tile panel), as listed in the body view. */
  protected readonly standing = computed(() => {
    const id = this.commands.tile()?.structureId;
    return id ? (this.view().structures.find((s) => s.id === id) ?? null) : null;
  });

  protected materialName(code: string): string {
    return this.game.catalog()?.materials.find((m) => m.id === code)?.name ?? code;
  }

  protected max0(n: number): number {
    return Math.max(0, n);
  }

  /** Build catalog keys (the catalog is not a command card, so it listens itself). */
  protected onKey(e: KeyboardEvent): void {
    if (!this.ui.buildMenu() || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const i = BUILD_KEYS.indexOf(e.key.toUpperCase());
    const row = this.commands.buildList()[i];
    if (!row || row.reason) return;
    e.preventDefault();
    this.commands.startPlacement(row.id);
  }

  protected stateText(s: Structure): string {
    const base = this.t.selection.structureState[s.state] ?? s.state;
    return s.state === 'ACTIVE' ? base : `${base} ${this.pct(s.progress)}%`;
  }

  protected bodyLabel(id: string): string {
    return bodyName(this.game.world(), id);
  }

  protected used(cargo: Readonly<Record<string, number>>): number {
    return Math.round(Object.values(cargo).reduce((s, q) => s + q, 0));
  }

  protected cargo(cargo: Readonly<Record<string, number>>): string[] {
    return Object.entries(cargo).map(([c, q]) => `${q} ${c}`);
  }

  protected round(n: number): string {
    return round1(n);
  }

  protected pct(p: number): number {
    return Math.round(p * 100);
  }

  protected readonly costText = costText;
}
