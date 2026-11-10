import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CATALOG, CATEGORIES, resolveItem } from '../domain/catalog/catalog';
import type { CatalogEntry, CategoryId } from '../domain/catalog/catalog.types';
import { footprintOf } from '../domain/placement';
import { EditorStore } from '../state/editor-store';

/** Buy/build catalog: categories, entries with rendered icons, colour variants. */
@Component({
  selector: 'app-catalog-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="seg" role="tablist" aria-label="Grupa">
      <button type="button" role="tab" class="seg__btn" [class.is-on]="group() === 'build'" [attr.aria-selected]="group() === 'build'" (click)="setGroup('build')">Budowa</button>
      <button type="button" role="tab" class="seg__btn" [class.is-on]="group() === 'furnish'" [attr.aria-selected]="group() === 'furnish'" (click)="setGroup('furnish')">Wyposażenie</button>
    </div>

    <input class="search" type="search" placeholder="Szukaj w katalogu…" aria-label="Szukaj w katalogu" [value]="query()" (input)="query.set($any($event.target).value)" />

    @if (!query()) {
      <div class="chips" role="tablist" aria-label="Kategoria">
        @for (c of categories(); track c.id) {
          <button type="button" role="tab" class="chip" [class.is-on]="category() === c.id" [attr.aria-selected]="category() === c.id" (click)="category.set(c.id)">
            {{ c.label }} <span class="chip__n">{{ c.count }}</span>
          </button>
        }
      </div>
    }

    @if (active(); as a) {
      <div class="picked">
        <div class="hud-micro">Wybrane</div>
        <div class="picked__name">{{ a.entry.label }} · <span class="hud-signal">{{ a.variant.label }}</span></div>
        @if (a.entry.hint) {
          <div class="hud-micro picked__hint">{{ a.entry.hint }}</div>
        }
        @if (a.entry.variants.length > 1) {
          <div class="swatches" role="radiogroup" aria-label="Wariant">
            @for (v of a.entry.variants; track v.id) {
              <button type="button" class="swatch" role="radio" [attr.aria-checked]="v.id === a.variant.id" [class.is-on]="v.id === a.variant.id" [style.--swatch]="v.swatch" [title]="v.label" (click)="store.selectItem(v.id)"></button>
            }
          </div>
        }
      </div>
    }

    <div class="grid" role="list">
      @for (e of entries(); track e.id) {
        <button type="button" role="listitem" class="item" [class.is-on]="active()?.entry?.id === e.id" (click)="pick(e)" [title]="e.label">
          <span class="item__thumb">
            @if (thumb(e); as url) {
              <img [src]="url" alt="" width="72" height="72" />
            } @else {
              <span class="item__placeholder hud-dots"></span>
            }
          </span>
          <span class="item__label">{{ e.label }}</span>
          <span class="item__meta hud-micro">{{ meta(e) }}</span>
          @if (e.variants.length > 1) {
            <span class="item__variants hud-micro">{{ e.variants.length }} war.</span>
          }
        </button>
      }
    </div>
  `,
  host: { class: 'catalog' },
})
export class CatalogPanelComponent {
  readonly store = inject(EditorStore);
  readonly group = signal<'build' | 'furnish'>('build');
  readonly category = signal<CategoryId>('walls');
  readonly query = signal('');
  /** Variant last used per entry, so picking an entry again keeps its colour. */
  private readonly lastVariant = new Map<string, string>();

  readonly categories = computed(() =>
    CATEGORIES.filter((c) => c.group === this.group()).map((c) => ({ ...c, count: CATALOG.filter((e) => e.category === c.id).length })),
  );

  readonly entries = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (q) return CATALOG.filter((e) => e.label.toLowerCase().includes(q) || e.variants.some((v) => v.label.toLowerCase().includes(q)));
    return CATALOG.filter((e) => e.category === this.category());
  });

  readonly active = computed(() => {
    const id = this.store.activeItem();
    return id ? resolveItem(id) : undefined;
  });

  setGroup(g: 'build' | 'furnish'): void {
    this.group.set(g);
    this.category.set(CATEGORIES.find((c) => c.group === g)!.id);
  }

  pick(e: CatalogEntry): void {
    const current = this.active();
    const variant = current?.entry.id === e.id ? current.variant.id : (this.lastVariant.get(e.id) ?? e.variants[0].id);
    this.store.selectItem(variant);
    this.lastVariant.set(e.id, variant);
  }

  thumb(e: CatalogEntry): string | undefined {
    const thumbs = this.store.thumbs();
    const a = this.active();
    const id = a?.entry.id === e.id ? a.variant.id : (this.lastVariant.get(e.id) ?? e.variants[0].id);
    return thumbs.get(id) ?? thumbs.get(e.variants[0].id);
  }

  meta(e: CatalogEntry): string {
    const p = e.placement;
    switch (p.kind) {
      case 'floor':
        return p.size === 2 ? '2×2 pola' : '1 pole';
      case 'ceiling':
        return 'sufit';
      case 'edge':
        return p.span === 2 ? '2 krawędzie' : 'krawędź';
      case 'object': {
        if (p.layer === 'wall') return 'na ścianę';
        if (p.layer === 'ceiling') return 'pod sufit';
        const fp = footprintOf(resolveItem(e.variants[0].id)!);
        return `${fp.w}×${fp.d} m${p.layer === 'surface' ? ' · blat' : ''}`;
      }
    }
  }
}
