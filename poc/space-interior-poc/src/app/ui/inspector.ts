import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { statsOf } from '../domain/catalog/catalog';
import { EDGE_KINDS, type RoomTypeId } from '../domain/catalog/catalog.types';
import { planLift, planTransform } from '../domain/planners';
import { footprintOf } from '../domain/placement';
import { ROOM_TYPES } from '../domain/rooms';
import { stairsProblems } from '../domain/validation';
import { EditorStore, MAX_DECK } from '../state/editor-store';

const KIND_LABEL = { floor: 'Podłoga', ceiling: 'Sufit', edge: 'Krawędź', object: 'Obiekt', 'wall-object': 'Na ścianie' } as const;
const STAT_LABEL = { berths: 'Koje', power: 'Moc', food: 'Żywność', care: 'Opieka', storage: 'Magazyn' } as const;
const ROT_LABEL = ['0°', '90°', '180°', '270°'];

/** Floating card over the viewport: the selected piece(s) and the room they are in. */
@Component({
  selector: 'app-inspector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (single(); as ip) {
      <section class="hud-frame card">
        <span class="hud-frame__label">{{ kindLabel() }}</span>
        <div class="card__title hud-title">{{ ip.item.entry.label }}</div>
        <div class="card__row hud-micro">
          <span>{{ ip.item.variant.label }}</span>
          <span>X {{ ip.piece.x }} · Z {{ ip.piece.z }} · {{ rotLabel() }}</span>
        </div>
        @if (size(); as s) {
          <div class="card__row hud-micro"><span>Zajmuje</span><span>{{ s }}</span></div>
        }
        @if (link(); as l) {
          @if (l.kind === 'lift') {
            <div class="card__row hud-micro">
              <span>Szyb</span>
              <span>{{ l.shaft.length > 1 ? 'pokłady ' + l.shaft[0] + '–' + l.shaft[l.shaft.length - 1] : 'jeden przystanek' }}</span>
            </div>
            <div class="card__actions">
              @for (d of l.shaft; track d) {
                <button type="button" class="btn btn--icon" [class.is-on]="d === ip.piece.level" [title]="'Przystanek na pokładzie ' + d" (click)="goToStop(d)">{{ d }}</button>
              }
              <button type="button" class="btn" [disabled]="!l.canUp" (click)="addStop(1)">Przystanek wyżej</button>
              <button type="button" class="btn" [disabled]="!l.canDown" (click)="addStop(-1)">Niżej</button>
            </div>
          } @else {
            <div class="card__row hud-micro">
              <span>Prowadzą</span>
              <span>pokład {{ ip.piece.level }} → {{ l.up }}</span>
            </div>
            @for (p of l.problems; track p) {
              <div class="hud-micro hud-alert">{{ p }}</div>
            } @empty {
              <div class="hud-micro hud-signal">Przejście wolne</div>
            }
            <div class="card__actions">
              <button type="button" class="btn" (click)="store.setLevel(l.up)">Pokład {{ l.up }} ↑</button>
            </div>
          }
        }
        @if (stats().length) {
          <div class="card__stats">
            @for (s of stats(); track s.k) {
              <span class="stat"><span class="hud-micro">{{ s.k }}</span><b [class.hud-alert]="s.v < 0">{{ s.v > 0 ? '+' : '' }}{{ s.v }}</b></span>
            }
          </div>
        }
        @if (ip.item.entry.variants.length > 1) {
          <div class="swatches" role="radiogroup" aria-label="Wariant">
            @for (v of ip.item.entry.variants; track v.id) {
              <button
                type="button"
                class="swatch"
                role="radio"
                [attr.aria-checked]="v.id === ip.piece.item"
                [class.is-on]="v.id === ip.piece.item"
                [style.--swatch]="v.swatch"
                [title]="v.label"
                (click)="setVariant(v.id)"
              ></button>
            }
          </div>
        }
        <div class="card__actions">
          <button type="button" class="btn" (click)="store.rotateSelection()">Obróć <kbd>R</kbd></button>
          <button type="button" class="btn" (click)="store.selectItem(ip.piece.item)">Stawiaj takie</button>
          <button type="button" class="btn btn--danger" (click)="store.deleteSelection()">Usuń <kbd>Del</kbd></button>
        </div>
      </section>
    } @else if (store.selection().length > 1) {
      <section class="hud-frame card">
        <span class="hud-frame__label">Zaznaczenie</span>
        <div class="card__title hud-title">{{ store.selection().length }} elementów</div>
        <div class="card__actions">
          <button type="button" class="btn" (click)="store.rotateSelection()">Obróć <kbd>R</kbd></button>
          <button type="button" class="btn btn--danger" (click)="store.deleteSelection()">Usuń <kbd>Del</kbd></button>
        </div>
      </section>
    }
    @if (store.selectedRoom(); as r) {
      <section class="hud-frame card">
        <span class="hud-frame__label">Pomieszczenie</span>
        <div class="card__title hud-title">{{ typeLabel(r.type) }}</div>
        <div class="card__row hud-micro"><span>Powierzchnia</span><span>{{ r.area }} m² · {{ r.cells.length }} pól</span></div>
        <div class="card__row hud-micro"><span>Drzwi</span><span>{{ r.doors.length }}</span></div>
        <div class="card__row hud-micro">
          <span>Szczelność</span>
          @if (r.breaches.length) {
            <span class="hud-alert">Otwarte: {{ r.breaches.length }}</span>
          } @else {
            <span class="hud-signal">Szczelne</span>
          }
        </div>
        <div class="card__row hud-micro"><span>Funkcja</span><span>{{ typeHint(r.type) }}</span></div>
        @if (scores().length) {
          <div class="scores">
            @for (s of scores(); track s.type) {
              <div class="score">
                <span class="hud-micro">{{ typeLabel(s.type) }}</span>
                <span class="score__bar"><span [style.width.%]="s.pct"></span></span>
                <span class="hud-micro">{{ s.v }}</span>
              </div>
            }
          </div>
        }
      </section>
    }
  `,
})
export class InspectorComponent {
  readonly store = inject(EditorStore);
  readonly single = computed(() => {
    const p = this.store.selectedPieces();
    return p.length === 1 ? p[0] : null;
  });
  readonly kindLabel = computed(() => {
    const ip = this.single();
    if (!ip) return '';
    const s = ip.shape;
    if (s.kind === 'floor' && s.connector) return s.connector === 'lift' ? 'Winda' : 'Schody';
    return s.kind === 'edge' ? EDGE_KINDS[s.edgeKind].label : KIND_LABEL[s.kind];
  });
  /** Stairs or lift stop: where it leads and what is wrong with it. */
  readonly link = computed(() => {
    const ip = this.single();
    if (!ip || ip.shape.kind !== 'floor' || !ip.shape.connector) return null;
    const index = this.store.index();
    const c = ip.shape.cells[0];
    const level = ip.piece.level;
    if (ip.shape.connector === 'lift') {
      return {
        kind: 'lift' as const,
        shaft: index.liftShaft(level, c.x, c.z),
        canUp: level < MAX_DECK && !index.liftAt(level + 1, c.x, c.z),
        canDown: level > 0 && !index.liftAt(level - 1, c.x, c.z),
      };
    }
    const s = index.stairs.find((st) => st.id === ip.piece.id);
    return { kind: 'stairs' as const, up: level + 1, problems: s ? stairsProblems(index, s.link) : [] };
  });
  readonly rotLabel = computed(() => ROT_LABEL[this.single()?.piece.rot ?? 0]);
  readonly size = computed(() => {
    const ip = this.single();
    if (!ip) return null;
    const s = ip.shape;
    if (s.kind === 'floor' || s.kind === 'ceiling') return `${s.cells.length} ${s.cells.length === 1 ? 'pole' : 'pola'} (${s.cells.length * 16} m²)`;
    if (s.kind === 'edge') return `${s.edges.length * 4} m krawędzi`;
    const fp = footprintOf(ip.item);
    return `${fp.w} × ${fp.d} m`;
  });
  readonly stats = computed(() => {
    const ip = this.single();
    if (!ip) return [];
    const s = statsOf(ip.item);
    return (Object.keys(STAT_LABEL) as (keyof typeof STAT_LABEL)[])
      .filter((k) => s[k])
      .map((k) => ({ k: STAT_LABEL[k], v: s[k]! }));
  });
  readonly scores = computed(() => {
    const r = this.store.selectedRoom();
    if (!r) return [];
    const list = (Object.entries(r.scores) as [RoomTypeId, number][]).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const max = Math.max(...list.map(([, v]) => v), 1);
    return list.map(([type, v]) => ({ type, v: Math.round(v * 10) / 10, pct: (100 * v) / max }));
  });

  typeLabel(t: RoomTypeId): string {
    return ROOM_TYPES[t].label;
  }

  typeHint(t: RoomTypeId): string {
    return ROOM_TYPES[t].hint;
  }

  /** Extends the selected lift's shaft by one stop (same cell, same door side). */
  addStop(dir: 1 | -1): void {
    const ip = this.single();
    if (!ip || ip.shape.kind !== 'floor') return;
    const level = ip.piece.level + dir;
    const plan = planLift(this.store.index(), [level], ip.shape.cells[0], ip.piece.rot, ip.piece.item);
    if (this.store.commit(plan)) this.store.notify(`Przystanek windy na pokładzie ${level}`);
  }

  /** Rides the lift: switches deck and selects the stop there. */
  goToStop(level: number): void {
    const ip = this.single();
    if (!ip || ip.shape.kind !== 'floor') return;
    const c = ip.shape.cells[0];
    const stop = this.store.index().liftAt(level, c.x, c.z);
    this.store.setLevel(level);
    if (stop) this.store.selection.set([stop.piece.id]);
  }

  setVariant(variantId: string): void {
    const ip = this.single();
    if (!ip || ip.piece.item === variantId) return;
    this.store.commit(planTransform(this.store.index(), [ip.piece.id], (p) => ({ ...p, item: variantId }), 'Zmień wariant'));
  }
}
