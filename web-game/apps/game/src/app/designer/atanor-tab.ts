import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { AtanorRow } from '@space-game/api';
import { UiState } from '../game/ui-state';
import { TEXT } from '../i18n/pl';
import { Designer } from './designer';
import { diffPct, num, pct } from './series';

/** A3: Atanor recipes by the document (§8.3) next to the numbers measured in the building view. */
@Component({
  selector: 'wg-designer-atanor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="note">{{ t.intro }}</p>
    <p class="note" data-atanor-now>{{ now() }}</p>
    <div class="actions">
      <button type="button" class="btn" data-action="open-atanor" (click)="ui.openSandbox()">{{ t.open }}</button>
      <button type="button" class="btn btn--primary" data-action="use-measured" [disabled]="!measuredCount()" [title]="t.useNote" (click)="d.useMeasuredAtanor()">{{ t.use }}</button>
    </div>
    <table class="dtable" data-table="atanor">
      <thead>
        <tr>
          <th class="l">{{ h.recipe }}</th><th class="l">{{ h.source }}</th><th>{{ h.cycles }}</th><th>{{ h.area }}</th><th>{{ h.arms }}</th><th>{{ h.time }}</th><th>{{ h.power }}</th><th>{{ h.value }}</th>
        </tr>
      </thead>
      <tbody>
        @for (r of rows(); track r.key) {
          <tr [class.is-changed]="r.measured">
            <td class="l">{{ r.first ? r.recipe : '' }}</td>
            <td class="l name">{{ r.source }}</td>
            @if (r.row; as x) {
              <td [class.cur]="r.measured && x.cycles !== r.doc.cycles">{{ fmt(x.cycles) }}</td>
              <td [class.cur]="r.measured && x.area !== r.doc.area">{{ x.area }}</td>
              <td [class.cur]="r.measured && x.arms !== r.doc.arms">{{ x.arms }}</td>
              <td [class.cur]="r.measured && x.time !== r.doc.time">{{ fmt(x.time) }}</td>
              <td [class.cur]="r.measured && x.power !== r.doc.power">{{ fmt(x.power) }}</td>
              <td [class.cur]="r.measured && x.productValue !== r.doc.productValue">{{ fmt(x.productValue) }}{{ r.diff && r.diff !== '0%' ? ' (' + r.diff + ')' : '' }}</td>
            } @else {
              <td class="l name" colspan="6">{{ t.notMeasured }}</td>
            }
          </tr>
        }
      </tbody>
    </table>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: var(--hud-space-4); }
  `,
})
export class DesignerAtanor {
  protected readonly t = inject(TEXT).designer.atanor;
  protected readonly h = this.t.head;
  protected readonly d = inject(Designer);
  protected readonly ui = inject(UiState);
  protected readonly fmt = num;
  protected readonly measuredCount = computed(() => Object.keys(this.d.measuredAtanor()).length);

  protected readonly now = computed(() => {
    const r = this.ui.atanorReadout();
    if (this.ui.view() !== 'atanor' || !r) return this.t.noView;
    if (!r.spec || r.cyclesPerOutput === null) return this.t.waiting;
    return this.t.now(r.recipeId ?? r.levelId, num(r.cyclesPerOutput), r.spec.area, r.spec.arms);
  });

  protected readonly rows = computed(() => {
    const doc = (this.d.measuredReport() ?? this.d.report())?.doc.atanor ?? [];
    const measured = new Map((this.d.measuredReport()?.current.atanor ?? []).map((a) => [a.recipeId, a]));
    const have = this.d.measuredAtanor();
    const out: Array<{ key: string; recipe: string; first: boolean; source: string; row: AtanorRow | null; doc: AtanorRow; measured: boolean; diff: string }> = [];
    for (const a of doc) {
      const recipe = `${a.recipeId} → ${a.product} · L${a.level}`;
      out.push({ key: a.recipeId + ':doc', recipe, first: true, source: this.t.source.doc, row: a, doc: a, measured: false, diff: '' });
      const m = have[a.recipeId] ? measured.get(a.recipeId) ?? null : null;
      out.push({
        key: a.recipeId + ':m',
        recipe,
        first: false,
        source: this.t.source.measured,
        row: m,
        doc: a,
        measured: !!m,
        diff: m ? pct(diffPct(a.productValue, m.productValue)) : '',
      });
    }
    return out;
  });
}
