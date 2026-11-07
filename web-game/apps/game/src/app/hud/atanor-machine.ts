import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import type { AtanorRow, BodyId, EconomyReport, NominalFlows } from '@space-game/api';
import { HudFrame } from '@space-game/ui';
import { AtanorSession } from '../game/atanor-session';
import { GameService } from '../game/game.service';
import { UiState } from '../game/ui-state';
import { TEXT } from '../i18n/pl';

const num = (n: number | null | undefined, digits = 1): string => (n === null || n === undefined || !Number.isFinite(n) ? '—' : (Math.round(n * 10 ** digits) / 10 ** digits).toLocaleString('pl-PL'));

/** One input of the recipe: what the machine uses and what the body supplies (§4, §8.5 p. 1). */
interface InputRow {
  code: string;
  perUnit: number;
  needH: number | null;
  supplyH: number;
  stock: number;
  hoursLeft: number | null;
  short: boolean;
}

/**
 * "Maszyna" (AT3, docs/atanor-expansion-design.md §4 and §5.3): the numbers of the design and what
 * they mean for the economy. Time per product = cycles × takt of the building level, power =
 * base + 0.5 MW per hex + 1 MW per arm (§8.1), cost of a product by the economy model at these
 * machine numbers next to the base value (the §8.3 reference, A17), the machine's materials (§8.2),
 * the recipe inputs against what the body produces, and the saved variants (A24).
 */
@Component({
  selector: 'wg-atanor-machine',
  imports: [HudFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section hudFrame class="panel panel--right machine" [label]="tm.tab" [serial]="r()?.recipeId ?? 'ATN'">
      <div class="scroll">
        @if (r(); as r) {
          <dl class="kv1" data-machine="unit">
            <div><dt>{{ tm.timePer }}</dt><dd data-machine="time">{{ num(timePer()) }} min</dd></div>
            <div><dt>{{ tm.perHour }}</dt><dd data-machine="per-hour">{{ num(perHour(), 2) }}</dd></div>
            <div><dt>{{ tm.power }}</dt><dd data-machine="power">{{ num(power()) }} MW</dd></div>
            <div><dt>{{ tm.unitValue }}</dt><dd data-machine="unit-value">{{ num(row()?.productValue, 2) }} kr</dd></div>
            <div><dt>{{ tm.baseValue }}</dt><dd>{{ num(doc()?.productValue, 2) }} kr</dd></div>
            <div><dt>{{ tm.margin }}</dt><dd data-machine="margin" [class.sg]="(margin() ?? 0) > 0" [class.al]="(margin() ?? 0) < 0">{{ marginText() }}</dd></div>
          </dl>

          <h3 class="hud-label">{{ tm.vsReference }}</h3>
          <table class="dtable" data-machine="compare">
            <thead><tr><th class="l"></th><th>{{ tm.cycles }}</th><th>{{ tm.area }}</th><th>{{ tm.arms }}</th><th>{{ tm.power }}</th></tr></thead>
            <tbody>
              <tr><td class="l">{{ tm.thisMachine }}</td><td>{{ num(r.cyclesPerOutput, 2) }}</td><td>{{ measured() ? r.area : '—' }}</td><td>{{ r.arms }}</td><td>{{ num(power()) }}</td></tr>
              <tr><td class="l">{{ tm.reference }}</td><td>{{ r.docReference?.cycles ?? '—' }}</td><td>{{ r.docReference?.area ?? '—' }}</td><td>{{ r.docReference?.arms ?? '—' }}</td><td>{{ num(doc()?.power) }}</td></tr>
            </tbody>
          </table>

          @if (inputs().length) {
            <h3 class="hud-label">{{ tm.inputs }}</h3>
            <table class="dtable" data-machine="inputs">
              <thead><tr><th class="l"></th><th>{{ tm.perUnit }}</th><th>{{ tm.needH }}</th><th>{{ tm.supplyH }}</th><th>{{ tm.stock }}</th><th>{{ tm.hoursLeft }}</th></tr></thead>
              <tbody>
                @for (i of inputs(); track i.code) {
                  <tr [attr.data-input]="i.code" [class.short]="i.short">
                    <td class="l">{{ i.code }}{{ i.short ? ' ▲' : '' }}</td><td>{{ num(i.perUnit, 2) }}</td><td>{{ num(i.needH) }}</td><td>{{ num(i.supplyH) }}</td><td>{{ num(i.stock, 0) }}</td><td>{{ num(i.hoursLeft) }}</td>
                  </tr>
                }
              </tbody>
            </table>
            <p class="note" data-machine="bottleneck">{{ bottleneck() }}</p>
          }

          <h3 class="hud-label">{{ tm.materials }} · {{ num(machineKr(), 0) }} kr</h3>
          <p class="note" data-machine="materials">{{ materialsText() }}</p>

          <div class="vhead">
            <h3 class="hud-label">{{ tm.variants }}</h3>
            <button type="button" class="act" data-action="save-variant" [disabled]="!measured()" (click)="save()">{{ tm.save }}</button>
          </div>
          @if (session.variants().length) {
            <table class="dtable" data-machine="variants">
              <thead><tr><th class="l">#</th><th>{{ tm.cycles }}</th><th>{{ tm.area }}</th><th>{{ tm.arms }}</th><th>{{ tm.power }}</th><th>{{ tm.unitValue }}</th><th></th></tr></thead>
              <tbody>
                @for (v of session.variants(); track v.id) {
                  <tr [attr.data-variant]="v.id">
                    <td class="l">{{ v.id }}</td><td>{{ num(v.cycles, 2) }}</td><td>{{ v.area }}</td><td>{{ v.arms }}</td><td>{{ num(v.power) }}</td><td>{{ num(v.unitValue, 2) }}</td>
                    <td><button type="button" class="act" (click)="session.loadVariant(v.id)">{{ tm.load }}</button></td>
                  </tr>
                }
              </tbody>
            </table>
          } @else {
            <p class="note">{{ tm.noVariants }}</p>
          }
        }
      </div>
    </section>
  `,
  styles: `
    .machine { max-height: calc(100% - var(--hud-space-6)); width: 380px; }
    .kv1 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--hud-space-2) var(--hud-space-6); margin: 0; }
    .kv1 div { display: flex; justify-content: space-between; gap: var(--hud-space-3); }
    .kv1 dt { font-size: var(--hud-font-size-micro); letter-spacing: var(--hud-tracking-label); text-transform: uppercase; color: var(--hud-color-text-dim); }
    .kv1 dd { margin: 0; font-weight: var(--hud-font-weight-bold); }
    .sg { color: var(--hud-color-signal); }
    .al, .short td { color: var(--hud-color-alert); }
    .note { margin: 0; font-size: var(--hud-font-size-label); color: var(--hud-color-text-dim); }
    .vhead { display: flex; justify-content: space-between; align-items: baseline; }
    .act { height: 22px; padding: 0 var(--hud-space-3); background: var(--hud-color-graphite); border: var(--hud-stroke-hair) solid var(--hud-color-line); color: var(--hud-color-text-dim); font: inherit; font-size: var(--hud-font-size-micro); letter-spacing: var(--hud-tracking-label); text-transform: uppercase; cursor: pointer; }
    .act:disabled { opacity: 0.4; cursor: default; }
  `,
})
export class AtanorMachine {
  protected readonly t = inject(TEXT);
  protected readonly tm = this.t.atanor.machine;
  protected readonly session = inject(AtanorSession);
  private readonly ui = inject(UiState);
  private readonly game = inject(GameService);
  protected readonly num = num;
  protected readonly r = this.ui.atanorReadout;

  /** Economy tables at the document's parameters (base values, §8.3 rows). */
  private readonly report = signal<EconomyReport | null>(null);
  /** The recipe's row priced at this machine's numbers (EconomyParams.atanor, A17). */
  protected readonly row = signal<AtanorRow | null>(null);
  private readonly flows = signal<NominalFlows | null>(null);
  private rowKey = '';

  protected readonly measured = computed(() => this.r()?.cyclesPerOutput !== null && this.r()?.cyclesPerOutput !== undefined);
  protected readonly doc = computed(() => this.report()?.doc.atanor.find((a) => a.recipeId === this.r()?.recipeId) ?? null);
  private readonly level = computed(() => this.r()?.siteLevel ?? this.r()?.buildingLevel ?? 1);
  private readonly bodyId = computed<BodyId | null>(() => this.ui.atanorBuilding()?.bodyId ?? null);
  /** Working buildings on the body, as a key: changes only when one is built, upgraded or removed. */
  private readonly buildings = computed(() => {
    const body = this.bodyId();
    return (this.game.world()?.structures ?? []).filter((s) => s.bodyId === body && s.state !== 'PLANNED').map((s) => `${s.kind}${s.level}`).join(',');
  });

  protected readonly timePer = computed(() => {
    const p = this.report()?.params;
    const c = this.r()?.cyclesPerOutput;
    return p && c ? c * (p.atanorTick[this.level()] ?? 1) : null;
  });
  protected readonly perHour = computed(() => (this.timePer() ? 60 / this.timePer()! : null));
  protected readonly power = computed(() => {
    const p = this.report()?.params;
    const r = this.r();
    if (!p || !r || !this.measured()) return null;
    const base = p.atanorBasePower * Math.pow(p.atanorPowerGrowth, this.level() - 1);
    return base + p.atanorPowerPerHex * r.area + p.atanorPowerPerArm * r.arms;
  });
  protected readonly margin = computed(() => {
    const cur = this.row()?.productValue;
    const base = this.doc()?.productValue;
    return cur && base ? (base - cur) / base : null;
  });
  protected readonly marginText = computed(() => {
    const m = this.margin();
    return m === null ? '—' : `${m > 0 ? '+' : ''}${num(m * 100)}%`;
  });

  protected readonly machineKr = computed(() => {
    const values = new Map((this.report()?.doc.materials ?? []).map((m) => [m.id, m.V]));
    const mats = this.session.state()?.materials ?? {};
    if (!values.size) return null;
    return Object.entries(mats).reduce((s, [code, q]) => s + q * (values.get(code) ?? 0), 0);
  });
  protected readonly materialsText = computed(() => {
    const mats = Object.entries(this.session.state()?.materials ?? {});
    return mats.length ? mats.map(([c, q]) => `${c} ${q}`).join(' · ') : this.tm.noMaterials;
  });

  protected readonly inputs = computed<InputRow[]>(() => {
    const r = this.r();
    const recipe = this.game.catalog()?.recipes.find((x) => x.id === r?.recipeId);
    const per = r?.inputsPerOutput ?? (recipe ? { ...recipe.inp } : null);
    const body = this.bodyId();
    if (!per || !body) return [];
    const flows = this.flows();
    const stockOf = this.game.world()?.storage[body] ?? {};
    const perHour = this.perHour();
    return Object.entries(per).map(([code, perUnit]) => {
      const supplyH = ((flows?.production[code] ?? 0) + (flows?.extraction[code] ?? 0)) * 60;
      const needH = perHour !== null ? perUnit * perHour : null;
      const stock = stockOf[code] ?? 0;
      return { code, perUnit, needH, supplyH, stock, hoursLeft: needH ? stock / needH : null, short: needH !== null && supplyH < needH };
    });
  });

  /** Throughput = min(design, supply) (§8.5 p. 1), said in words. */
  protected readonly bottleneck = computed(() => {
    const rows = this.inputs();
    const perHour = this.perHour();
    if (perHour === null) return this.tm.unmeasured;
    const short = rows.filter((i) => i.short);
    if (!short.length) return this.tm.noBottleneck(num(perHour, 2));
    const bySupply = Math.min(...short.map((i) => i.supplyH / i.perUnit));
    const worst = short.reduce((a, b) => (b.supplyH / b.perUnit < a.supplyH / a.perUnit ? b : a));
    const stockHours = Math.min(...short.map((i) => i.hoursLeft ?? Infinity));
    return this.tm.bottleneck(worst.code, num(bySupply, 2), num(perHour, 2), num(stockHours));
  });

  constructor() {
    void this.game.economyReport().then((r) => this.report.set(r));
    // price the recipe at this machine's numbers when they change
    effect(() => {
      const r = this.r();
      const report = this.report();
      if (!r?.recipeId || !report || r.cyclesPerOutput === null) {
        untracked(() => this.row.set(null));
        return;
      }
      const key = `${r.recipeId}|${r.cyclesPerOutput}|${r.area}|${r.arms}`;
      if (key === this.rowKey) return;
      this.rowKey = key;
      const params = { ...report.defaults, atanor: { [r.recipeId]: { cycles: r.cyclesPerOutput, area: r.area, arms: r.arms } } };
      untracked(() =>
        void this.game.economyReport(params).then((rep) => {
          if (this.rowKey === key) this.row.set(rep.current.atanor.find((a) => a.recipeId === r.recipeId) ?? null);
        }),
      );
    });
    // what the body's producers supply (nominal rates), refreshed when the building list changes
    effect(() => {
      const body = this.bodyId();
      this.buildings();
      if (!body) return;
      untracked(() => void this.game.nominalFlows(body).then((f) => this.flows.set(f)));
    });
  }

  protected save(): void {
    const r = this.r();
    if (!r) return;
    this.session.saveVariant({ cycles: r.cyclesPerOutput, area: r.area, arms: r.arms, power: this.power(), unitValue: this.row()?.productValue ?? null, machineKr: this.machineKr() });
  }
}
