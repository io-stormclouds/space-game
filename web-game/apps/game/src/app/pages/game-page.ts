import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { TEMPO_PRESETS } from '@space-game/api';
import type { ViewKind } from '@space-game/render';
import { CommandCard, HudFrame } from '@space-game/ui';
import { Designer } from '../designer/designer';
import { DesignerPanel } from '../designer/designer-panel';
import { CommandsService } from '../game/commands';
import { GameService } from '../game/game.service';
import { isPreset, runPreset } from '../game/presets';
import { UiState } from '../game/ui-state';
import { LogPanel, MissionPanel, ScanPanel, StatusBanner } from '../hud/float-panels';
import { PerfOverlay } from '../hud/perf-overlay';
import { SelectionPanel } from '../hud/selection-panel';
import { SystemMap } from '../hud/system-map';
import { TopBar } from '../hud/top-bar';
import { TEXT } from '../i18n/pl';
import { WorldView } from '../world/world-view';

const VIEW_KEYS: Record<string, ViewKind> = { '1': 'planet', '2': 'system', '3': 'galaxy', '4': 'atanor' };
const TEMPOS = TEMPO_PRESETS.filter((t) => t !== 10);

/** The game screen: shared HUD of the canvas (top bar 48 px, dock 240 px) over the world view. */
@Component({
  selector: 'wg-game-page',
  imports: [TopBar, WorldView, MissionPanel, StatusBanner, ScanPanel, LogPanel, SystemMap, SelectionPanel, CommandCard, HudFrame, PerfOverlay, DesignerPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:keydown)': 'onKey($event)' },
  template: `
    <div class="game" [attr.data-ready]="ready()">
      <div class="game__world"><wg-world-view /></div>
      <div class="game__top"><wg-top-bar /></div>
      <div class="game__float">
        @if (game.snapshot()?.scenarioId === 'tau-ceti') {
          <wg-mission-panel />
        }
        <wg-status-banner />
        @if (designer.open()) {
          <wg-designer-panel />
        } @else if (showScan()) {
          <wg-scan-panel />
        } @else {
          <wg-log-panel />
        }
        @if (ui.perfVisible()) {
          <wg-perf-overlay />
        }
      </div>
      <div class="game__dock">
        <section hudFrame class="panel map" [label]="t.map.tab" [serial]="t.map.serial">
          <wg-system-map [size]="180" />
        </section>
        <wg-selection-panel />
        <hud-command-card [title]="card().title" [context]="card().context" [status]="card().status" serial="CC" [columns]="4" [rows]="2" [slots]="card().slots" />
      </div>
      @if (loading()) {
        <div class="loading" role="status">{{ t.world.loading }}</div>
      }
    </div>
  `,
  styles: `
    :host { display: block; height: 100%; }
    .map { padding: var(--hud-space-5); }
    .loading { position: absolute; inset: 0; display: grid; place-items: center; background: var(--hud-color-void); color: var(--hud-color-text-dim); letter-spacing: var(--hud-tracking-label); text-transform: uppercase; z-index: 5; }
  `,
})
export class GamePage {
  protected readonly t = inject(TEXT);
  protected readonly game = inject(GameService);
  protected readonly ui = inject(UiState);
  private readonly commands = inject(CommandsService);
  /** Created with the game screen, so its telemetry collects from the first step (F6). */
  protected readonly designer = inject(Designer);
  /** Route parameter of `#/scenariusz-<preset>` (W15 C). */
  readonly preset = input<string>();
  protected readonly loading = signal(false);
  /** The game is started and the start view is set (tests wait for it). */
  protected readonly ready = signal(false);
  protected readonly card = this.commands.card;

  protected readonly showScan = computed(() => {
    const w = this.game.world();
    return !!w && w.scan.state === 'DONE' && w.colony.foundedAt === null && this.game.snapshot()?.scenarioId === 'tau-ceti';
  });

  constructor() {
    effect(() => {
      const preset = this.preset();
      untracked(() => void this.boot(preset));
    });
  }

  private async boot(preset: string | undefined): Promise<void> {
    this.ui.clear();
    this.ready.set(false);
    const wanted = preset && isPreset(preset) ? preset : null;
    this.loading.set(!!wanted);
    try {
      if (wanted) await runPreset(this.game, this.commands, wanted);
      else if (!this.game.snapshot()) await this.game.start('tau-ceti');
      this.ui.restartView();
      this.ready.set(true);
    } finally {
      // only after the start view is set, so a key pressed right away is not overridden
      this.loading.set(false);
    }
  }

  /** Global keys (P1). Command and build-catalog keys are handled by their components. */
  protected onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const view = VIEW_KEYS[e.key];
    if (view) {
      if (view === 'planet' && !this.ui.planetAvailable()) return;
      e.preventDefault();
      this.ui.view.set(view);
      return;
    }
    switch (e.key) {
      case ' ':
        e.preventDefault();
        this.game.togglePause();
        return;
      case '+':
      case '=':
        this.shiftTempo(1);
        return;
      case '-':
        this.shiftTempo(-1);
        return;
      case '`':
        this.ui.perfVisible.update((v) => !v);
        return;
      case 'F2':
        e.preventDefault();
        this.designer.toggle();
        return;
      case 'Escape':
        // after the command card: it cancels placement itself when it has an Esc command
        queueMicrotask(() => {
          if (e.defaultPrevented) return;
          if (this.ui.placement()) this.ui.placement.set(null);
          else if (this.ui.targeting()) this.ui.targeting.set(false);
          else if (this.ui.driveRover()) this.ui.driveRover.set(null);
          else if (this.ui.buildMenu()) this.ui.buildMenu.set(false);
          else this.ui.select({ kind: 'NONE' });
        });
        return;
    }
  }

  private shiftTempo(dir: 1 | -1): void {
    const cur = this.game.snapshot()?.tempo ?? 60;
    const i = TEMPOS.indexOf(cur as (typeof TEMPOS)[number]);
    const next = TEMPOS[Math.max(0, Math.min(TEMPOS.length - 1, (i < 0 ? 1 : i) + dir))]!;
    this.game.setTempo(next);
  }
}
