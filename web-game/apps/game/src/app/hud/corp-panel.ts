import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { CorpLedgerEntry, CorpRole, GalaxyOp, GalaxyReply } from '@space-game/api';
import { HudFrame } from '@space-game/ui';
import { GameService } from '../game/game.service';
import { TEXT } from '../i18n/pl';

const money = (n: number) => n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (n: number) => n.toLocaleString('pl-PL', { maximumFractionDigits: 1 });

/**
 * Corporation panel (S2, 05-SOCIAL §5): without a corporation, the invitations, the founding form
 * and the corporations of the galaxy; with one, its members and roles, invitations by callsign, the
 * treasury (credits and goods in the seat hub) with deposits and withdrawals, the ledger, the board.
 * The server decides; the panel sends requests and shows the pushed view.
 */
@Component({
  selector: 'wg-corp-panel',
  imports: [HudFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section hudFrame class="panel corp" data-corp [label]="t.tab" [serial]="t.serial">
      @if (game.galaxy(); as v) {
        @if (message(); as m) {
          <p class="msg" role="status" data-message>{{ m }}</p>
        }
        <div class="scroll">
          @if (v.corporation; as c) {
            <div class="head">
              <h2 class="hud-title" data-corp-name>{{ c.name }}</h2>
              <span class="tag tag--sg">{{ t.you(t.roles[c.role]) }}</span>
            </div>
            <p class="dim small">{{ t.header(c.tag, hubName(c.hubId)) }}</p>

            <h3 class="hud-title">{{ t.members }}</h3>
            <ul class="list" data-list="members">
              @for (m of c.members; track m.account) {
                <li class="row" [attr.data-member]="m.callsign" [attr.data-role]="m.role">
                  <span>{{ m.callsign }} <span class="dim">· {{ t.roles[m.role] }}</span></span>
                  @if (m.account !== v.account) {
                    <span class="actions">
                      @if (c.role === 'chief') {
                        @if (m.role !== 'officer') {
                          <button type="button" class="btn" data-action="make-officer" [disabled]="busy()" (click)="setRole(m.account, 'officer')">{{ t.makeOfficer }}</button>
                        }
                        @if (m.role === 'officer') {
                          <button type="button" class="btn" data-action="make-member" [disabled]="busy()" (click)="setRole(m.account, 'member')">{{ t.makeMember }}</button>
                        }
                        <button type="button" class="btn" data-action="make-chief" [disabled]="busy()" (click)="setRole(m.account, 'chief')">{{ t.makeChief }}</button>
                      }
                      @if (c.role === 'chief' || (c.role === 'officer' && m.role === 'member')) {
                        <button type="button" class="btn" data-action="expel" [disabled]="busy()" (click)="expel(m.account)">{{ t.expel }}</button>
                      }
                    </span>
                  }
                </li>
              }
            </ul>
            @if (c.role !== 'member') {
              <div class="actions">
                <input type="text" data-input="invite" [placeholder]="t.invitePlaceholder" [value]="invitee()" (input)="invitee.set(text($event))" />
                <button type="button" class="btn" data-action="invite" [disabled]="busy() || !invitee().trim()" (click)="invite()">{{ t.invite }}</button>
              </div>
            }
            @if (c.invited.length) {
              <p class="dim small" data-invited>{{ t.pending(c.invited.join(', ')) }}</p>
            }

            <h3 class="hud-title">{{ t.treasury }}</h3>
            <p data-treasury [attr.data-credits]="c.credits">
              <strong>{{ money(c.credits) }} kr</strong>
              @for (g of goods(c.stock); track g.code) {
                <span class="dim"> · {{ g.code }} {{ qty(g.q) }}</span>
              }
            </p>
            <div class="actions">
              <label class="field">
                <span class="k">{{ t.credits }}</span>
                <input type="number" min="0" step="1" data-input="amount" [value]="amount()" (input)="amount.set(num($event))" />
              </label>
              <label class="field">
                <span class="k">{{ t.note }}</span>
                <input type="text" data-input="note" [value]="note()" (input)="note.set(text($event))" />
              </label>
            </div>
            <div class="actions">
              <button type="button" class="btn btn--primary" data-action="deposit" [disabled]="busy() || amount() <= 0" (click)="move('deposit')">{{ t.deposit }}</button>
              @if (c.role !== 'member') {
                <button type="button" class="btn" data-action="withdraw" [disabled]="busy() || amount() <= 0" (click)="move('withdraw')">{{ t.withdraw }}</button>
              }
            </div>

            <h3 class="hud-title">{{ t.ledger }}</h3>
            <ul class="list" data-list="ledger">
              @for (e of c.ledger; track $index) {
                <li [attr.data-kind]="e.kind">{{ entryText(e) }}</li>
              } @empty {
                <li class="dim">{{ t.noLedger }}</li>
              }
            </ul>

            <h3 class="hud-title">{{ t.board }}</h3>
            <div class="actions">
              <input type="text" class="wide" data-input="notice" maxlength="280" [value]="notice()" (input)="notice.set(text($event))" />
              <button type="button" class="btn" data-action="post" [disabled]="busy() || !notice().trim()" (click)="post()">{{ t.post }}</button>
            </div>
            <ul class="list" data-list="board">
              @for (n of c.board; track $index) {
                <li><span class="dim">{{ n.callsign }}:</span> {{ n.text }}</li>
              } @empty {
                <li class="dim">{{ t.noBoard }}</li>
              }
            </ul>

            <div class="actions">
              <button type="button" class="btn" data-action="leave" [disabled]="busy()" (click)="leave()">
                {{ c.role === 'chief' && c.members.length === 1 ? t.dissolve : t.leave }}
              </button>
            </div>
          } @else {
            <p class="note">{{ t.none }}</p>
            @if (v.invitations.length) {
              <h3 class="hud-title">{{ t.invitations }}</h3>
              <ul class="list" data-list="invitations">
                @for (i of v.invitations; track i.corpId) {
                  <li class="row" [attr.data-invitation]="i.corpId">
                    <span>{{ t.invitedBy(i.name, i.tag, i.by) }}</span>
                    <span class="actions">
                      <button type="button" class="btn btn--primary" data-action="accept" [disabled]="busy()" (click)="accept(i.corpId)">{{ t.accept }}</button>
                      <button type="button" class="btn" data-action="decline" [disabled]="busy()" (click)="decline(i.corpId)">{{ t.decline }}</button>
                    </span>
                  </li>
                }
              </ul>
            }
            <h3 class="hud-title">{{ t.found }}</h3>
            <div class="actions">
              <label class="field">
                <span class="k">{{ t.name }}</span>
                <input type="text" data-input="name" maxlength="32" [value]="name()" (input)="name.set(text($event))" />
              </label>
              <label class="field">
                <span class="k">{{ t.tagLabel }}</span>
                <input type="text" data-input="tag" maxlength="4" class="short" [value]="tag()" (input)="tag.set(text($event))" />
              </label>
              <label class="field">
                <span class="k">{{ t.seat }}</span>
                <select data-input="seat" (change)="seat.set(text($event))">
                  @for (h of v.hubs; track h.id) {
                    <option [value]="h.id" [selected]="h.id === seat()">{{ h.name }}</option>
                  }
                </select>
              </label>
            </div>
            <div class="actions">
              <button type="button" class="btn btn--primary" data-action="found" [disabled]="busy() || !name().trim() || !tag().trim()" (click)="found()">{{ t.found }}</button>
            </div>
          }

          <h3 class="hud-title">{{ t.all }}</h3>
          <ul class="list" data-list="corporations">
            @for (s of v.corporations; track s.id) {
              <li [attr.data-corp-id]="s.id">{{ t.summary(s.name, s.tag, hubName(s.hubId), s.members) }}</li>
            } @empty {
              <li class="dim">{{ t.noneYet }}</li>
            }
          </ul>
        </div>
      } @else {
        <p class="note" data-offline>{{ t.offline }}</p>
      }
    </section>
  `,
  styles: `
    .corp { position: absolute; right: var(--hud-space-6); top: var(--hud-space-7); bottom: var(--hud-space-4); width: 480px; }
    .head { display: flex; justify-content: space-between; align-items: center; gap: var(--hud-space-4); }
    .small { font-size: var(--hud-font-size-micro); }
    .msg { margin: 0; padding: 6px 8px; border-left: 2px solid var(--hud-color-signal); background: var(--hud-color-signal-dim); font-size: var(--hud-font-size-label); }
    .row { grid-template-columns: 1fr auto; }
    .field { display: flex; flex-direction: column; gap: 2px; font-size: var(--hud-font-size-micro); }
    input, select { height: 28px; padding: 0 6px; background: var(--hud-color-hull); border: 1px solid var(--hud-color-metal); color: var(--hud-color-text); font: inherit; }
    input[type='number'] { width: 120px; }
    input.short { width: 64px; text-transform: uppercase; }
    input.wide { flex: 1; min-width: 0; }
    h3.hud-title { margin-top: var(--hud-space-3); font-size: var(--hud-font-size-label); }
  `,
})
export class CorpPanel {
  protected readonly t = inject(TEXT).corp;
  protected readonly game = inject(GameService);

  protected readonly busy = signal(false);
  protected readonly message = signal<string | null>(null);
  protected readonly name = signal('');
  protected readonly tag = signal('');
  protected readonly seat = signal('hub-sirius');
  protected readonly invitee = signal('');
  protected readonly amount = signal(100);
  protected readonly note = signal('');
  protected readonly notice = signal('');

  protected readonly money = money;
  protected readonly qty = qty;

  private readonly hubNames = computed(() => new Map((this.game.galaxy()?.hubs ?? []).map((h) => [h.id, h.name])));

  protected hubName(id: string): string {
    return this.hubNames().get(id) ?? id;
  }

  protected goods(stock: Record<string, number>): Array<{ code: string; q: number }> {
    return Object.entries(stock).map(([code, q]) => ({ code, q }));
  }

  protected entryText(e: CorpLedgerEntry): string {
    const parts = [...(e.credits > 0 ? [`${money(e.credits)} kr`] : []), ...Object.entries(e.goods).map(([m, q]) => `${m} ${qty(q)}`)];
    return this.t.entry(e.callsign, this.t.kinds[e.kind], parts.join(' · '), e.note);
  }

  protected text(e: Event): string {
    return (e.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected num(e: Event): number {
    const v = Number((e.target as HTMLInputElement).value);
    return Number.isFinite(v) ? v : 0;
  }

  private async run(op: GalaxyOp, done: string, after?: () => void): Promise<void> {
    this.busy.set(true);
    try {
      await this.game.galaxyOp<GalaxyReply>(op);
      this.message.set(done);
      after?.();
    } catch (e) {
      this.message.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected found(): void {
    void this.run({ op: 'foundCorporation', name: this.name(), tag: this.tag(), hubId: this.seat() }, this.t.done.founded);
  }

  protected invite(): void {
    void this.run({ op: 'invite', callsign: this.invitee() }, this.t.done.invited, () => this.invitee.set(''));
  }

  protected accept(corpId: string): void {
    void this.run({ op: 'acceptInvitation', corpId }, this.t.done.joined);
  }

  protected decline(corpId: string): void {
    void this.run({ op: 'declineInvitation', corpId }, this.t.done.declined);
  }

  protected leave(): void {
    void this.run({ op: 'leaveCorporation' }, this.t.done.left);
  }

  protected setRole(account: string, role: CorpRole): void {
    void this.run({ op: 'setRole', account, role }, this.t.done.role);
  }

  protected expel(account: string): void {
    void this.run({ op: 'expel', account }, this.t.done.expelled);
  }

  protected move(op: 'deposit' | 'withdraw'): void {
    void this.run({ op, credits: this.amount(), note: this.note() }, op === 'deposit' ? this.t.done.deposited : this.t.done.withdrawn, () => this.note.set(''));
  }

  protected post(): void {
    void this.run({ op: 'postNotice', text: this.notice() }, this.t.done.posted, () => this.notice.set(''));
  }
}
