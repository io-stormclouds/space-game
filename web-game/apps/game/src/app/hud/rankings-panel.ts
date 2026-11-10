import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import type { RankEntry, Rankings } from '@space-game/api';
import { HudFrame } from '@space-game/ui';
import { GameService } from '../game/game.service';
import { TEXT } from '../i18n/pl';

const money = (n: number) => n.toLocaleString('pl-PL', { maximumFractionDigits: 0 });
const LISTS = ['netWorth', 'volume', 'reputation', 'corporations'] as const;

/**
 * Rankings of the season (S3, 05-SOCIAL §7, F7): the season and its end, the player's standing,
 * the top places by net worth in the galaxy, trade volume, reputation and corporations, and the
 * closed seasons. Asked from the galaxy service when opened, on demand, and when the season turns.
 */
@Component({
  selector: 'wg-rankings-panel',
  imports: [HudFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section hudFrame class="panel rankings" data-rankings [label]="t.tab" [serial]="t.serial">
      @if (game.galaxy()) {
        @if (error(); as e) {
          <p class="msg" role="status">{{ e }}</p>
        }
        @if (rankings(); as r) {
          <div class="scroll">
            <div class="head">
              <h2 class="hud-title" data-season [attr.data-number]="r.season.number">{{ t.season(r.season.number) }}</h2>
              <button type="button" class="btn" data-action="refresh" [disabled]="busy()" (click)="load()">{{ t.refresh }}</button>
            </div>
            <p class="dim small">{{ r.season.endsAt ? t.endsAt(time(r.season.endsAt)) : t.noEnd }}</p>
            <p data-mine [attr.data-place]="r.mine.netWorthPlace">{{ t.mine(money(r.mine.netWorth), r.mine.netWorthPlace) }}</p>
            @for (list of lists; track list) {
              <h3 class="hud-title">{{ t.lists[list] }}</h3>
              <ol class="list" [attr.data-list]="list">
                @for (e of r[list]; track e.id; let i = $index) {
                  <li [attr.data-entry]="e.name">{{ entry(i, e) }}</li>
                } @empty {
                  <li class="dim">{{ t.empty }}</li>
                }
              </ol>
            }
            @if (r.history.length) {
              <h3 class="hud-title">{{ t.history }}</h3>
              <ul class="list" data-list="history">
                @for (s of r.history; track s.number) {
                  <li [attr.data-season-record]="s.number">{{ t.record(s.number, s.netWorth[0]?.name ?? '', s.megaprojectsCompleted) }}</li>
                }
              </ul>
            }
            <p class="dim small">{{ t.note }}</p>
          </div>
        }
      } @else {
        <p class="note" data-offline>{{ t.offline }}</p>
      }
    </section>
  `,
  styles: `
    .rankings { position: absolute; right: var(--hud-space-6); top: var(--hud-space-7); bottom: var(--hud-space-4); width: 420px; }
    .head { display: flex; justify-content: space-between; align-items: center; gap: var(--hud-space-4); }
    .small { font-size: var(--hud-font-size-micro); }
    .msg { margin: 0; padding: 6px 8px; border-left: 2px solid var(--hud-color-signal); background: var(--hud-color-signal-dim); font-size: var(--hud-font-size-label); }
    ol.list { padding-left: 0; list-style: none; }
    h3.hud-title { margin-top: var(--hud-space-3); font-size: var(--hud-font-size-label); }
  `,
})
export class RankingsPanel {
  protected readonly t = inject(TEXT).rankings;
  protected readonly game = inject(GameService);
  protected readonly rankings = signal<Rankings | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly lists = LISTS;
  protected readonly money = money;

  constructor() {
    // on opening (once the galaxy is there) and when the season turns
    effect(() => {
      const season = this.game.galaxy()?.season.number;
      if (season !== undefined) untracked(() => void this.load());
    });
  }

  protected entry(i: number, e: RankEntry): string {
    return this.t.entry(i + 1, e.name, e.tag, money(e.value));
  }

  protected time(ms: number): string {
    return new Date(ms).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
  }

  async load(): Promise<void> {
    this.busy.set(true);
    try {
      this.rankings.set(await this.game.galaxyOp<Rankings>({ op: 'rankings' }));
      this.error.set(null);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.busy.set(false);
    }
  }
}
