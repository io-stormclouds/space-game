import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { TEXT } from '../i18n/pl';
import { Designer } from './designer';
import { diffPct, num, pct } from './series';

type Section = 'eras' | 'materials' | 'buildings';

/** The economy document's tables (default parameters) next to the draft's, with the differences. */
@Component({
  selector: 'wg-designer-tables',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar">
      <div class="seg" role="tablist">
        @for (s of sections; track s) {
          <button type="button" role="tab" [attr.aria-selected]="section() === s" [attr.aria-pressed]="section() === s" [attr.data-section]="s" (click)="section.set(s)">
            {{ t[s] }}
          </button>
        }
      </div>
      <label class="check"><input type="checkbox" [checked]="onlyChanged()" (change)="onlyChanged.set(!onlyChanged())" /> {{ t.onlyChanged }}</label>
    </div>
    @if (d.report(); as r) {
      @switch (section()) {
        @case ('eras') {
          <table class="dtable" data-table="eras">
            <thead>
              <tr><th class="l">{{ h.era }}</th><th>{{ h.doc }}</th><th>{{ h.current }}</th><th>{{ h.diff }}</th></tr>
            </thead>
            <tbody>
              @for (e of eras(); track e.era) {
                <tr [class.is-changed]="e.changed">
                  <td class="l">{{ e.name }}</td><td>{{ fmt(e.doc) }}</td><td class="cur">{{ fmt(e.cur) }}</td><td [class]="e.cls">{{ e.diff }}</td>
                </tr>
              }
            </tbody>
          </table>
        }
        @case ('materials') {
          <table class="dtable" data-table="materials">
            <thead>
              <tr><th class="l">{{ h.code }}</th><th class="l">{{ h.name }}</th><th>{{ h.tier }}</th><th>{{ h.value }} · {{ h.doc }}</th><th>{{ h.current }}</th><th>{{ h.diff }}</th></tr>
            </thead>
            <tbody>
              @for (m of materials(); track m.id) {
                <tr [class.is-changed]="m.changed">
                  <td class="l">{{ m.id }}</td><td class="l name">{{ m.name }}</td><td>{{ m.tier }}</td><td>{{ fmt(m.doc) }}</td><td class="cur">{{ fmt(m.cur) }}</td><td [class]="m.cls">{{ m.diff }}</td>
                </tr>
              } @empty {
                <tr><td class="l" colspan="6">{{ t.none }}</td></tr>
              }
            </tbody>
          </table>
        }
        @case ('buildings') {
          <table class="dtable" data-table="buildings">
            <thead>
              <tr>
                <th class="l">{{ h.code }}</th><th>E</th><th>{{ h.cost }} · {{ h.doc }}</th><th>{{ h.current }}</th><th>{{ h.time }} · {{ h.doc }}</th><th>{{ h.current }}</th><th>{{ h.payback }} · {{ h.doc }}</th><th>{{ h.current }}</th>
              </tr>
            </thead>
            <tbody>
              @for (b of buildings(); track b.id) {
                <tr [class.is-changed]="b.changed" [title]="b.name">
                  <td class="l">{{ b.id }}</td><td>{{ b.era }}</td>
                  <td>{{ fmt(b.doc.costKr) }}</td><td [class.cur]="b.doc.costKr !== b.cur.costKr">{{ fmt(b.cur.costKr) }}</td>
                  <td>{{ fmt(b.doc.buildTime) }}</td><td [class.cur]="b.doc.buildTime !== b.cur.buildTime">{{ fmt(b.cur.buildTime) }}</td>
                  <td>{{ fmt(b.doc.paybackMin) }}</td><td [class.cur]="b.doc.paybackMin !== b.cur.paybackMin">{{ fmt(b.cur.paybackMin) }}</td>
                </tr>
              } @empty {
                <tr><td class="l" colspan="8">{{ t.none }}</td></tr>
              }
            </tbody>
          </table>
        }
      }
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: var(--hud-space-4); }
    .bar { display: flex; justify-content: space-between; align-items: center; gap: var(--hud-space-4); }
    .check { display: inline-flex; gap: 6px; align-items: center; font-size: var(--hud-font-size-label); color: var(--hud-color-text-dim); }
  `,
})
export class DesignerTables {
  protected readonly t = inject(TEXT).designer.tables;
  protected readonly h = this.t.head;
  protected readonly d = inject(Designer);
  protected readonly sections: Section[] = ['eras', 'materials', 'buildings'];
  protected readonly section = signal<Section>('eras');
  protected readonly onlyChanged = signal(false);
  protected readonly fmt = num;

  private row(doc: number, cur: number) {
    const p = diffPct(doc, cur);
    const changed = Math.abs(cur - doc) > 1e-9;
    return { changed, diff: changed ? pct(p) : '', cls: !changed ? '' : (p ?? 0) > 0 ? 'up' : 'down' };
  }

  protected readonly eras = computed(() => {
    const r = this.d.report();
    if (!r) return [];
    return r.doc.eras.map((e, i) => ({ era: e.era, name: e.name, doc: e.k, cur: r.current.eras[i]!.k, ...this.row(e.k, r.current.eras[i]!.k) }));
  });

  protected readonly materials = computed(() => {
    const r = this.d.report();
    if (!r) return [];
    const cur = new Map(r.current.materials.map((m) => [m.id, m]));
    const rows = r.doc.materials.map((m) => {
      const c = cur.get(m.id)!;
      return { id: m.id, name: m.name, tier: m.tier, doc: m.V, cur: c.V, ...this.row(m.V, c.V) };
    });
    return this.onlyChanged() ? rows.filter((x) => x.changed) : rows;
  });

  protected readonly buildings = computed(() => {
    const r = this.d.report();
    if (!r) return [];
    const cur = new Map(r.current.buildings.map((b) => [b.id, b]));
    const rows = r.doc.buildings.map((b) => {
      const c = cur.get(b.id)!;
      const changed = b.costKr !== c.costKr || b.buildTime !== c.buildTime || b.paybackMin !== c.paybackMin;
      return { id: b.id, name: b.name, era: b.era, doc: b, cur: c, changed };
    });
    return this.onlyChanged() ? rows.filter((x) => x.changed) : rows;
  });
}
