import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import type { AtanorMeasured, EconomyParams, EconomyReport } from '@space-game/api';
import { GameService } from '../game/game.service';
import { UiState } from '../game/ui-state';
import { TEXT } from '../i18n/pl';
import { Telemetry } from './telemetry';

export type DesignerTab = 'params' | 'tables' | 'flows' | 'log' | 'atanor' | 'file';
export const DESIGNER_TABS: DesignerTab[] = ['params', 'tables', 'flows', 'log', 'atanor', 'file'];

/** Keys of EconomyParams whose values differ (arrays and the Atanor overrides compared by value). */
export function paramDiff(a: EconomyParams | null, b: EconomyParams | null): string[] {
  if (!a || !b) return [];
  const keys = new Set([...Object.keys(a), ...Object.keys(b)] as Array<keyof EconomyParams>);
  return [...keys].filter((k) => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null));
}

/**
 * State of the designer panel (F6): the draft of the economy parameters, the document-vs-draft
 * report (recomputed by the mock as the draft changes), Atanor measurements from the building view
 * (A3), and applying the draft to the game (new game or replay of this one).
 */
@Injectable({ providedIn: 'root' })
export class Designer {
  private readonly game = inject(GameService);
  private readonly ui = inject(UiState);
  private readonly t = inject(TEXT);
  /** Collects from the game start, whether the panel is open or not. */
  readonly telemetry = inject(Telemetry);

  readonly open = signal(false);
  readonly tab = signal<DesignerTab>('params');
  readonly defaults = signal<EconomyParams | null>(null);
  readonly draft = signal<EconomyParams | null>(null);
  /** Document tables vs the draft's. */
  readonly report = signal<EconomyReport | null>(null);
  /**
   * Document tables vs the document's parameters with the measured Atanor numbers only (A3), so the
   * comparison shows the measurement and not other changes of the draft.
   */
  readonly measuredReport = signal<EconomyReport | null>(null);
  /** Cycles / area / arms measured in the Atanor view, by recipe id. */
  readonly measuredAtanor = signal<Readonly<Record<string, AtanorMeasured>>>({});
  readonly busy = signal(false);
  readonly message = signal<string | null>(null);

  /** Parameters of the running game (the document's when the game runs without changes). */
  readonly gameParams = computed(() => this.game.economy() ?? this.defaults());
  readonly gameChanged = computed(() => paramDiff(this.gameParams(), this.defaults()));
  readonly draftVsGame = computed(() => paramDiff(this.draft(), this.gameParams()));

  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      if (this.open() && !untracked(this.draft)) untracked(() => void this.loadDefaults());
    });
    effect(() => {
      const draft = this.draft();
      const measured = this.measuredAtanor();
      if (!draft) return;
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.refresh(draft, measured), 150);
    });
    effect(() => {
      const r = this.ui.atanorReadout();
      if (!r?.recipeId || !r.spec) return;
      const m = { cycles: r.spec.cycles, area: r.spec.area, arms: r.spec.arms };
      untracked(() => {
        const cur = this.measuredAtanor()[r.recipeId!];
        if (!cur || cur.cycles !== m.cycles || cur.area !== m.area || cur.arms !== m.arms) this.measuredAtanor.update((x) => ({ ...x, [r.recipeId!]: m }));
      });
    });
  }

  toggle(): void {
    this.open.update((o) => !o);
  }

  private async loadDefaults(): Promise<void> {
    const r = await this.game.economyReport();
    this.defaults.set(r.defaults);
    this.draft.set(structuredClone(r.params));
  }

  private async refresh(draft: EconomyParams, measured: Readonly<Record<string, AtanorMeasured>>): Promise<void> {
    this.report.set(await this.game.economyReport(draft));
    const doc = this.defaults() ?? draft;
    this.measuredReport.set(Object.keys(measured).length ? await this.game.economyReport({ ...doc, atanor: { ...measured } }) : null);
  }

  set<K extends keyof EconomyParams>(key: K, value: EconomyParams[K]): void {
    const d = this.draft();
    if (d) this.draft.set({ ...d, [key]: value });
  }

  setAt(key: 'paybackTargetMin' | 'atanorTick', index: number, value: number): void {
    const d = this.draft();
    if (!d) return;
    const list = [...d[key]];
    list[index] = value;
    this.draft.set({ ...d, [key]: list });
  }

  resetToDoc(): void {
    const d = this.defaults();
    if (d) this.draft.set(structuredClone(d));
  }

  resetToGame(): void {
    const g = this.gameParams();
    if (g) this.draft.set(structuredClone(g));
  }

  useMeasuredAtanor(): void {
    const d = this.draft();
    if (d) this.draft.set({ ...d, atanor: { ...(d.atanor ?? {}), ...this.measuredAtanor() } });
  }

  /** The scenario from its start, with the draft. */
  async applyNew(): Promise<void> {
    const draft = this.draft();
    const scenario = this.game.snapshot()?.scenarioId;
    if (!draft || !scenario) return;
    await this.run(async () => {
      await this.game.start(scenario, this.economyOrDoc(draft));
      this.ui.restartView(true);
      this.message.set(this.t.designer.params.applied);
    });
  }

  /** The same commands at the same steps, with the draft (the same game under other parameters). */
  async applyReplay(): Promise<void> {
    const draft = this.draft();
    if (!draft) return;
    await this.run(async () => {
      const file = await this.game.save();
      const economy = this.economyOrDoc(draft);
      const { economy: _old, ...rest } = file;
      const stats = await this.game.replay(economy ? { ...rest, economy } : rest);
      this.ui.restartView(true);
      this.message.set(this.t.designer.params.replayed(stats.rejected));
    });
  }

  private economyOrDoc(draft: EconomyParams): EconomyParams | undefined {
    return paramDiff(draft, this.defaults()).length ? draft : undefined;
  }

  async run(work: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.message.set(null);
    try {
      await work();
    } catch (e) {
      this.message.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.busy.set(false);
    }
  }
}
