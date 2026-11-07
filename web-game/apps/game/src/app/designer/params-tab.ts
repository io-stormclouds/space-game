import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { EconomyParams } from '@space-game/api';
import { TEXT } from '../i18n/pl';
import { Designer, paramDiff } from './designer';
import { num } from './series';

type ScalarKey = Exclude<
  {
    [K in keyof EconomyParams]-?: EconomyParams[K] extends number ? K : never;
  }[keyof EconomyParams],
  undefined
>;

const GROUPS: Array<{ id: 'value' | 'growth' | 'atanor'; keys: ScalarKey[]; step: number }> = [
  { id: 'value', keys: ['energyPrice', 'machineMinute', 'shipMinute'], step: 0.01 },
  { id: 'growth', keys: ['costGrowth', 'timeGrowth', 'producerPowerGrowth', 'consumerPowerGrowth', 'crewGrowth', 'livingSpaceGrowth', 'storageGrowth'], step: 0.05 },
  { id: 'atanor', keys: ['atanorBasePower', 'atanorPowerGrowth', 'atanorPowerPerHex', 'atanorPowerPerArm', 'atanorDeployMinPerKr'], step: 0.05 },
];

/** Załącznik A as a form: the draft, the document's value beside every changed field, apply buttons. */
@Component({
  selector: 'wg-designer-params',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (d.draft(); as draft) {
      <p class="note">{{ t.intro }}</p>
      @for (g of groups; track g.id) {
        <fieldset>
          <legend class="k">{{ t.groups[g.id] }}</legend>
          @for (k of g.keys; track k) {
            <label class="field" [class.is-changed]="changed().has(k)">
              <span>{{ t.fields[k]![0] }}</span>
              <input type="number" [step]="g.step" min="0" [value]="draft[k]" [attr.data-param]="k" (change)="setScalar(k, $event)" />
              <span class="unit">{{ t.fields[k]![1] }}</span>
              <span class="doc">{{ changed().has(k) ? t.doc(fmt(defaults()?.[k])) : '' }}</span>
            </label>
          }
          @if (g.id === 'atanor') {
            @for (l of levels; track l) {
              <label class="field" [class.is-changed]="draft.atanorTick[l] !== defaults()?.atanorTick?.[l]">
                <span>{{ t.tick(l) }}</span>
                <input type="number" step="0.05" min="0.05" [value]="draft.atanorTick[l]" [attr.data-param]="'atanorTick.' + l" (change)="setAt('atanorTick', l, $event)" />
                <span class="unit">min</span>
                <span class="doc">{{ draft.atanorTick[l] !== defaults()?.atanorTick?.[l] ? t.doc(fmt(defaults()?.atanorTick?.[l])) : '' }}</span>
              </label>
            }
            @if (measuredCount()) {
              <p class="note">{{ t.measured(measuredCount()) }}</p>
            }
          }
        </fieldset>
        @if (g.id === 'growth') {
          <fieldset>
            <legend class="k">{{ t.groups.payback }}</legend>
            @for (e of eras; track e) {
              <label class="field" [class.is-changed]="draft.paybackTargetMin[e] !== defaults()?.paybackTargetMin?.[e]">
                <span>{{ t.era(e) }}</span>
                <input type="number" step="1" min="1" [value]="draft.paybackTargetMin[e]" [attr.data-param]="'payback.' + e" (change)="setAt('paybackTargetMin', e, $event)" />
                <span class="unit">min</span>
                <span class="doc">{{ draft.paybackTargetMin[e] !== defaults()?.paybackTargetMin?.[e] ? t.doc(fmt(defaults()?.paybackTargetMin?.[e])) : '' }}</span>
              </label>
            }
          </fieldset>
        }
      }
      <div class="actions sticky">
        <button type="button" class="btn btn--primary" data-action="apply-new" [disabled]="d.busy()" [title]="t.applyNewNote" (click)="d.applyNew()">{{ t.applyNew }}</button>
        <button type="button" class="btn" data-action="apply-replay" [disabled]="d.busy()" [title]="t.applyReplayNote" (click)="d.applyReplay()">{{ t.applyReplay }}</button>
        <button type="button" class="btn" data-action="reset-doc" [disabled]="d.busy()" (click)="d.resetToDoc()">{{ t.resetDoc }}</button>
        <button type="button" class="btn" data-action="reset-game" [disabled]="d.busy()" (click)="d.resetToGame()">{{ t.resetGame }}</button>
      </div>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: var(--hud-space-4); }
    fieldset { margin: 0; padding: 0; border: 0; display: grid; gap: 2px; }
    legend { padding: 0 0 4px; font-size: var(--hud-font-size-micro); }
    .field { display: grid; grid-template-columns: minmax(0, 1fr) 88px 72px 96px; gap: var(--hud-space-3); align-items: center; padding: 2px 0; border-bottom: 1px solid var(--hud-color-line-faint); font-size: var(--hud-font-size-label); }
    .field input { width: 100%; height: 24px; padding: 0 6px; background: var(--hud-color-void); border: 1px solid var(--hud-color-metal); color: var(--hud-color-text); font: inherit; text-align: right; font-variant-numeric: tabular-nums; }
    .field input:focus-visible { outline: 2px solid var(--hud-color-signal); outline-offset: -1px; }
    .field.is-changed input { border-color: var(--hud-color-signal); color: var(--hud-color-signal); }
    .unit, .doc { font-size: var(--hud-font-size-micro); color: var(--hud-color-text-dim); }
    .doc { text-align: right; }
    .sticky { position: sticky; bottom: 0; padding: var(--hud-space-3) 0; background: var(--hud-color-hull); border-top: 1px solid var(--hud-color-line); }
  `,
})
export class DesignerParams {
  protected readonly t = inject(TEXT).designer.params;
  protected readonly d = inject(Designer);
  protected readonly groups = GROUPS;
  protected readonly levels = [1, 2, 3, 4, 5];
  /** E0 has k = 1 by definition, so its payback target is not a parameter. */
  protected readonly eras = [1, 2, 3, 4];
  protected readonly defaults = this.d.defaults;
  protected readonly changed = computed(() => new Set(paramDiff(this.d.draft(), this.defaults())));
  protected readonly measuredCount = computed(() => Object.keys(this.d.draft()?.atanor ?? {}).length);
  protected readonly fmt = num;

  protected setScalar(key: ScalarKey, e: Event): void {
    const v = (e.target as HTMLInputElement).valueAsNumber;
    if (Number.isFinite(v) && v >= 0) this.d.set(key, v);
  }

  protected setAt(key: 'paybackTargetMin' | 'atanorTick', index: number, e: Event): void {
    const v = (e.target as HTMLInputElement).valueAsNumber;
    if (Number.isFinite(v) && v > 0) this.d.setAt(key, index, v);
  }
}
