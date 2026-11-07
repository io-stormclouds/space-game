import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { CatalogStar } from '@space-game/api';
import { HudFrame, RtsButton } from '@space-game/ui';
import { GameService } from '../game/game.service';
import { TEXT } from '../i18n/pl';
import { SiteBar } from './site-bar';

const LY_PER_PC = 3.26156;
const PX_PER_PC = 80;
const TARGET = 'Tau Ceti';
/** Drive bands of the economy doc 9.2 (ly). */
const DRIVES: Array<[number, string]> = [[5, 'Mk I'], [9, 'Mk II'], [12.5, 'Mk III'], [17, 'Mk IV']];
/** Fusion capsules per light year (FUEL_PER_LY). */
const CAPSULES_PER_LY = 40;

/** Strona główna — znany wszechświat (canvas board 1): star catalog, map, target card. */
@Component({
  selector: 'wg-main-page',
  imports: [SiteBar, HudFrame, RtsButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(window:keydown.enter)': 'join()' },
  template: `
    <div class="page hud-gridfield">
      <wg-site-bar mode="main" />
      <main class="stage">
        <section hudFrame class="catalog" [label]="t.main.tab" serial="CAT · 041 / v0.3">
          <h1 class="hud-title">{{ t.main.title }}</h1>
          <span class="hud-micro">{{ t.main.count(list().length) }}</span>
          <table>
            <thead><tr><th>{{ t.main.colClass }}</th><th>{{ t.main.colObject }}</th><th class="r">{{ t.main.colLy }}</th></tr></thead>
            <tbody>
              @for (s of list(); track s.name) {
                <tr [class.is-on]="s.name === selected()?.name" (click)="selected.set(s)">
                  <td>{{ s.spectralClass.charAt(0) }}</td><td>{{ display(s.name) }}</td><td class="r">{{ ly(s.distance) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </section>

        <svg class="map" [attr.viewBox]="viewBox" role="img" [attr.aria-label]="t.main.title">
          @for (r of rings; track r) {
            <circle [attr.r]="ringPx(r)" class="ring" />
            <text [attr.x]="ringPx(r) * 0.7" [attr.y]="-ringPx(r) * 0.72" class="ring-label">{{ r }} LY</text>
          }
          @for (s of plotted(); track s.name) {
            <g [attr.transform]="'translate(' + s.x + ',' + s.y + ')'" class="star" [class.is-on]="s.name === selected()?.name" (click)="selected.set(s.star)">
              <circle [attr.r]="s.r" />
              <text x="10" y="4">{{ s.label }}</text>
              @if (s.name === selected()?.name) {
                <path class="bracket" d="M-12 -6 V-12 H-6 M6 -12 H12 V-6 M12 6 V12 H6 M-6 12 H-12 V6" />
              }
            </g>
          }
        </svg>

        @if (selected(); as s) {
          <section hudFrame class="card" [label]="t.main.objectTab" [serial]="'OBJ · ' + s.name.slice(0, 3).toUpperCase()">
            <div class="card-head">
              <h2 class="hud-title">{{ display(s.name) }}</h2>
              @if (s.name === target) {
                <span class="tag">{{ t.main.target }}</span>
              }
            </div>
            <span class="hud-micro">{{ s.spectralClass }}</span>
            <dl>
              <div><dt>{{ t.main.distance }}</dt><dd>{{ ly(s.distance) }} ly</dd></div>
              <div><dt>{{ t.main.temperature }}</dt><dd>{{ s.temperature }} K</dd></div>
              <div><dt>{{ t.main.luminosity }}</dt><dd>{{ num(s.luminosity) }} L☉</dd></div>
              <div><dt>{{ t.main.planets }}</dt><dd>{{ s.planets }}</dd></div>
              <div><dt>{{ t.main.drive }}</dt><dd>{{ drive(s.distance) }}</dd></div>
              <div><dt>{{ t.main.capsules }}</dt><dd>{{ capsules(s.distance) }}</dd></div>
            </dl>
            <hud-rts-button [label]="t.main.join" hotkey="Enter" variant="primary" (activated)="join()" />
          </section>
        }
      </main>
      <footer class="foot hud-micro">
        <span>{{ t.main.hint }}</span><span>{{ t.main.projection(scale) }}</span>
      </footer>
    </div>
  `,
  styleUrl: './main-page.css',
})
export class MainPage {
  protected readonly t = inject(TEXT);
  private readonly game = inject(GameService);
  private readonly router = inject(Router);
  protected readonly target = TARGET;
  protected readonly rings = [5, 10, 15];
  protected readonly scale = PX_PER_PC;
  protected readonly viewBox = `${-6.2 * PX_PER_PC} ${-5 * PX_PER_PC} ${12.4 * PX_PER_PC} ${10 * PX_PER_PC}`;
  private readonly stars = signal<CatalogStar[]>([]);
  protected readonly selected = signal<CatalogStar | null>(null);

  protected readonly list = computed(() =>
    this.stars()
      .filter((s) => s.distance > 0 && s.distance <= 17)
      .sort((a, b) => a.distance - b.distance),
  );

  protected readonly plotted = computed(() => {
    const near = this.stars().filter((s) => s.distance <= 17);
    return near.map((s) => ({
      star: s,
      name: s.name,
      label: this.display(s.name),
      x: s.pos.x * PX_PER_PC,
      y: -s.pos.z * PX_PER_PC,
      r: s.luminosity >= 1 ? 4 : s.luminosity >= 0.1 ? 3 : 2,
    }));
  });

  constructor() {
    void this.game.loadCatalog().then((c) => {
      this.stars.set(c.stars);
      this.selected.set(c.stars.find((s) => s.name === TARGET) ?? null);
    });
  }

  /** Ring of `ly` light years in map units. */
  protected ringPx(ly: number): number {
    return (ly / LY_PER_PC) * PX_PER_PC;
  }

  /** Polish display name (canvas), else the catalog name. */
  protected display(name: string): string {
    return this.t.starNames[name] ?? name;
  }

  protected join(): void {
    void this.router.navigateByUrl('/logowanie');
  }

  protected ly(n: number): string {
    return n.toLocaleString('pl-PL', { maximumFractionDigits: 2 });
  }

  protected num(n: number): string {
    return n.toLocaleString('pl-PL', { maximumFractionDigits: 4 });
  }

  protected drive(ly: number): string {
    return DRIVES.find(([d]) => ly <= d)?.[1] ?? '—';
  }

  protected capsules(ly: number): number {
    return Math.ceil(ly * CAPSULES_PER_LY);
  }

  static readonly LY_PER_PC = LY_PER_PC;
}
