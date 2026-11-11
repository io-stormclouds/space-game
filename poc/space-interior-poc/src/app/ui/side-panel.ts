import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { RoomTypeId } from '../domain/catalog/catalog.types';
import { ROOM_TYPES, type Room } from '../domain/rooms';
import type { Issue } from '../domain/validation';
import { EditorStore } from '../state/editor-store';
import { CatalogPanelComponent } from './catalog-panel';

type Tab = 'catalog' | 'ship' | 'issues';

const SEVERITY_LABEL = { error: 'Błąd', warning: 'Uwaga', info: 'Info' } as const;

@Component({
  selector: 'app-side-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CatalogPanelComponent],
  template: `
    <div class="tabs" role="tablist" aria-label="Panel">
      <button type="button" role="tab" class="tabs__btn" [class.is-on]="tab() === 'catalog'" [attr.aria-selected]="tab() === 'catalog'" (click)="tab.set('catalog')">Katalog</button>
      <button type="button" role="tab" class="tabs__btn" [class.is-on]="tab() === 'ship'" [attr.aria-selected]="tab() === 'ship'" (click)="tab.set('ship')">Statek</button>
      <button type="button" role="tab" class="tabs__btn" [class.is-on]="tab() === 'issues'" [attr.aria-selected]="tab() === 'issues'" (click)="tab.set('issues')">
        Uwagi
        @if (counts().errors) {
          <span class="badge badge--alert">{{ counts().errors }}</span>
        }
        @if (counts().warnings) {
          <span class="badge">{{ counts().warnings }}</span>
        }
      </button>
    </div>

    <div class="side__body">
      @switch (tab()) {
        @case ('catalog') {
          <app-catalog-panel />
        }
        @case ('ship') {
          @let s = store.summary();
          <section class="block">
            <div class="hud-label">Bilans</div>
            <div class="kv-grid">
              <div class="kv"><span class="hud-micro">Koje</span><b>{{ s.stats.berths }}</b></div>
              <div class="kv"><span class="hud-micro">Moc [MW]</span><b [class.hud-alert]="s.stats.power < 0">{{ s.stats.power > 0 ? '+' : '' }}{{ s.stats.power }}</b></div>
              <div class="kv"><span class="hud-micro">Żywność</span><b>{{ s.stats.food }}</b></div>
              <div class="kv"><span class="hud-micro">Opieka med.</span><b>{{ s.stats.care }}</b></div>
              <div class="kv"><span class="hud-micro">Magazyn [MWh]</span><b>{{ s.stats.storage }}</b></div>
              <div class="kv"><span class="hud-micro">Kadłub</span><b [class.hud-alert]="!s.sealed" [class.hud-signal]="s.sealed">{{ s.sealed ? 'Szczelny' : 'Nieszczelny' }}</b></div>
            </div>
          </section>
          <section class="block">
            <div class="hud-label">Konstrukcja</div>
            <div class="kv-grid">
              <div class="kv"><span class="hud-micro">Powierzchnia</span><b>{{ s.area }} m²</b></div>
              <div class="kv"><span class="hud-micro">Pomieszczenia</span><b>{{ s.rooms }}</b></div>
              <div class="kv"><span class="hud-micro">Elementy</span><b>{{ s.pieces }}</b></div>
              <div class="kv"><span class="hud-micro">Trójkąty</span><b>{{ s.triangles.toLocaleString('pl-PL') }}</b></div>
              <div class="kv"><span class="hud-micro">Pokłady</span><b>{{ s.decks.length }}</b></div>
              <div class="kv"><span class="hud-micro">Schody</span><b>{{ s.stairs }}</b></div>
              <div class="kv"><span class="hud-micro">Windy · przystanki</span><b>{{ s.lifts }} · {{ s.liftStops }}</b></div>
            </div>
          </section>
          <section class="block">
            <div class="hud-label">Pomieszczenia</div>
            @for (d of roomsByDeck(); track d.level) {
              <button type="button" class="rows__head hud-micro" [class.hud-signal]="d.level === store.level()" (click)="store.setLevel(d.level)">
                Pokład {{ d.level }} · {{ d.rooms.length }} pom. · {{ d.area }} m²
              </button>
              <ul class="rows">
                @for (r of d.rooms; track r.id) {
                  <li>
                    <button type="button" class="row" [class.is-on]="store.selectedRoomId() === r.id" (click)="focusRoom(r.id)">
                      <span class="row__title">{{ typeLabel(r.type) }}</span>
                      <span class="hud-micro">{{ r.area }} m² · drzwi {{ r.doors.length }}</span>
                      @if (r.breaches.length) {
                        <span class="tag tag--alert">Nieszczelne</span>
                      }
                    </button>
                  </li>
                }
              </ul>
            }
          </section>
        }
        @case ('issues') {
          @if (store.issues().length === 0) {
            <div class="empty">
              <div class="hud-label hud-signal">Brak uwag</div>
              <p class="hud-micro">Kadłub szczelny, wszystkie pomieszczenia osiągalne (drzwi, schody, windy), obiekty na swoich miejscach.</p>
            </div>
          }
          <ul class="rows">
            @for (i of store.issues(); track i.id) {
              <li>
                <button type="button" class="row issue" [class.issue--error]="i.severity === 'error'" (click)="focusIssue(i)">
                  <span class="tag" [class.tag--alert]="i.severity === 'error'">{{ severity(i) }}</span>
                  <span class="row__title">{{ i.title }}</span>
                  <span class="hud-micro issue__detail">{{ i.detail }}</span>
                  <span class="hud-micro">Pokład {{ i.level }}</span>
                </button>
              </li>
            }
          </ul>
        }
      }
    </div>
  `,
  host: { class: 'side' },
})
export class SidePanelComponent {
  readonly store = inject(EditorStore);
  readonly tab = signal<Tab>('catalog');
  readonly counts = computed(() => ({ errors: this.store.summary().errors, warnings: this.store.summary().warnings }));
  readonly roomsByDeck = computed(() => {
    const decks = new Map<number, Room[]>();
    for (const r of this.store.rooms()) {
      const list = decks.get(r.level);
      if (list) list.push(r);
      else decks.set(r.level, [r]);
    }
    return [...decks]
      .sort((a, b) => a[0] - b[0])
      .map(([level, rooms]) => ({ level, rooms, area: rooms.reduce((s, r) => s + r.area, 0) }));
  });

  typeLabel(t: RoomTypeId): string {
    return ROOM_TYPES[t].label;
  }

  severity(i: Issue): string {
    return SEVERITY_LABEL[i.severity];
  }

  focusRoom(id: string): void {
    const r = this.store.rooms().find((x) => x.id === id);
    if (!r) return;
    this.store.selection.set([]);
    this.store.selectedRoomId.set(id);
    this.store.focus(r.center.x, r.center.z, r.level);
  }

  focusIssue(i: Issue): void {
    this.store.selection.set(i.pieces.filter((id) => this.store.index().get(id)));
    this.store.selectedRoomId.set(i.roomId ?? null);
    this.store.focus(i.at.x, i.at.z, i.level);
  }
}
