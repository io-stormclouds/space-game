import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { HudFrame } from '@space-game/ui';
import { TEXT } from '../i18n/pl';
import { DesignerAtanor } from './atanor-tab';
import { DESIGNER_TABS, Designer } from './designer';
import { DesignerEvents } from './events-tab';
import { DesignerFile } from './file-tab';
import { DesignerFlows } from './flows-tab';
import { DesignerParams } from './params-tab';
import { DesignerTables } from './tables-tab';

/**
 * Designer panel (F6): economy parameters (Załącznik A) at run time, document vs draft tables,
 * resource and power flows, the full event log, the Atanor comparison (A3), save export / import.
 * A drawer over the right side of the world; F2 or the top-bar button opens it.
 */
@Component({
  selector: 'wg-designer-panel',
  imports: [HudFrame, DesignerParams, DesignerTables, DesignerFlows, DesignerEvents, DesignerAtanor, DesignerFile],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section hudFrame class="panel designer" data-designer [label]="t.tab" [serial]="t.serial">
      <div class="head">
        <span class="tag" [class.tag--sg]="d.gameChanged().length" data-economy>{{ economyText() }}</span>
        <span class="dim small">{{ t.draftChanged(d.draftVsGame().length) }}</span>
      </div>
      <div class="seg tabs" role="tablist" [attr.aria-label]="t.tab">
        @for (tab of tabs; track tab) {
          <button type="button" role="tab" [attr.aria-selected]="d.tab() === tab" [attr.aria-pressed]="d.tab() === tab" [attr.data-tab]="tab" (click)="d.tab.set(tab)">
            {{ t.tabs[tab] }}
          </button>
        }
      </div>
      @if (d.message(); as m) {
        <p class="msg" role="status" data-message>{{ m }}</p>
      }
      <div class="scroll" role="tabpanel">
        @switch (d.tab()) {
          @case ('params') {
            <wg-designer-params />
          }
          @case ('tables') {
            <wg-designer-tables />
          }
          @case ('flows') {
            <wg-designer-flows />
          }
          @case ('log') {
            <wg-designer-events />
          }
          @case ('atanor') {
            <wg-designer-atanor />
          }
          @case ('file') {
            <wg-designer-file />
          }
        }
      </div>
    </section>
  `,
  styles: `
    .designer { position: absolute; right: var(--hud-space-6); top: var(--hud-space-7); bottom: var(--hud-space-4); width: 600px; }
    .head { display: flex; justify-content: space-between; align-items: center; gap: var(--hud-space-4); }
    .small { font-size: var(--hud-font-size-micro); }
    .tabs { align-self: stretch; }
    .tabs button { flex: 1; min-width: 0; padding: 0 6px; }
    .msg { margin: 0; padding: 6px 8px; border-left: 2px solid var(--hud-color-signal); background: var(--hud-color-signal-dim); font-size: var(--hud-font-size-label); }
  `,
})
export class DesignerPanel {
  protected readonly t = inject(TEXT).designer;
  protected readonly d = inject(Designer);
  protected readonly tabs = DESIGNER_TABS;
  protected readonly economyText = computed(() => {
    const n = this.d.gameChanged().length;
    return n ? this.t.economyChanged(n) : this.t.economyDoc;
  });
}
