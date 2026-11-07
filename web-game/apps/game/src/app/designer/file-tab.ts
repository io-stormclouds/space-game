import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { EconomyParams, SaveFile } from '@space-game/api';
import { GameService } from '../game/game.service';
import { UiState } from '../game/ui-state';
import { TEXT } from '../i18n/pl';
import { Designer, paramDiff } from './designer';
import { downloadText } from './download';
import { timeLabel } from './series';

const SCENARIOS = new Set(['tau-ceti', 'planeta-matka', 'fabryka', 'load-s', 'load-m', 'load-l']);

/** Checks the shape of a save file before it reaches the worker. */
export function asSaveFile(data: unknown): SaveFile | null {
  const f = data as Partial<SaveFile> | null;
  if (!f || f.format !== 'space-game-save' || f.version !== 1) return null;
  if (!SCENARIOS.has(f.scenarioId as string) || typeof f.step !== 'number' || !f.world || !Array.isArray(f.commands) || !Array.isArray(f.tempos)) return null;
  return f as SaveFile;
}

/** Scenario export and import (F6): the save file of the mock, with the economy in force. */
@Component({
  selector: 'wg-designer-file',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="note">{{ t.intro }}</p>
    <div class="actions">
      <button type="button" class="btn btn--primary" data-action="export-save" [disabled]="d.busy()" (click)="exportSave()">{{ t.export }}</button>
      <label class="btn file">
        {{ t.load }}
        <input type="file" accept=".json,application/json" data-input="load" [disabled]="d.busy()" (change)="open($event, 'load')" />
      </label>
      <label class="btn file">
        {{ t.replay }}
        <input type="file" accept=".json,application/json" data-input="replay" [disabled]="d.busy()" (change)="open($event, 'replay')" />
      </label>
    </div>
    @if (last(); as f) {
      <dl class="kv" data-file-summary>
        <div><dt>{{ s.scenario }}</dt><dd>{{ f.scenarioId }}</dd></div>
        <div><dt>{{ s.step }}</dt><dd>{{ f.step }}</dd></div>
        <div><dt>{{ s.time }}</dt><dd>{{ time(f.world.time) }}</dd></div>
        <div><dt>{{ s.commands }}</dt><dd>{{ f.commands.length }}</dd></div>
        <div><dt>{{ s.economy }}</dt><dd>{{ economyText(f.economy) }}</dd></div>
      </dl>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: var(--hud-space-4); }
    .file { display: inline-flex; align-items: center; position: relative; }
    .file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
    .file:focus-within { outline: 2px solid var(--hud-color-signal); outline-offset: 2px; }
  `,
})
export class DesignerFile {
  protected readonly t = inject(TEXT).designer.file;
  protected readonly s = this.t.summary;
  protected readonly d = inject(Designer);
  private readonly game = inject(GameService);
  private readonly ui = inject(UiState);
  protected readonly last = signal<SaveFile | null>(null);
  protected readonly time = timeLabel;
  private readonly defaults = computed(() => this.d.defaults());

  protected economyText(e: EconomyParams | undefined): string {
    const n = e ? paramDiff(e, this.defaults()).length : 0;
    return n ? this.s.changed(n) : this.s.doc;
  }

  protected exportSave(): void {
    void this.d.run(async () => {
      const file = await this.game.save();
      const name = `space-game-${file.scenarioId}-krok-${file.step}.json`;
      downloadText(name, JSON.stringify(file), 'application/json');
      this.last.set(file);
      this.d.message.set(this.t.exported(name));
    });
  }

  protected open(e: Event, mode: 'load' | 'replay'): void {
    const input = e.target as HTMLInputElement;
    const picked = input.files?.[0];
    input.value = '';
    if (!picked) return;
    void this.d.run(async () => {
      let file: SaveFile | null = null;
      try {
        file = asSaveFile(JSON.parse(await picked.text()));
      } catch {
        file = null;
      }
      if (!file) {
        this.d.message.set(this.t.invalid);
        return;
      }
      if (mode === 'load') await this.game.load(file);
      else await this.game.replay(file);
      this.ui.restartView(true);
      this.last.set(file);
      this.d.message.set(mode === 'load' ? this.t.loaded(picked.name) : this.t.replayedFile(picked.name));
    });
  }
}
