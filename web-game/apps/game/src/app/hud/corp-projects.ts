import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import type { GalaxyOp, GalaxyReply, GalaxyView, MegaKind, MegaScope, MegaView } from '@space-game/api';
import { GameService } from '../game/game.service';
import { TEXT } from '../i18n/pl';

const qty = (n: number) => n.toLocaleString('pl-PL', { maximumFractionDigits: 1 });
const money = (n: number) => n.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * The alliance and the megaprojects of the player's corporation (S3, 05-SOCIAL §5–6), inside the
 * corporation panel: found an alliance, invite a corporation by tag, accept or decline invitations,
 * give notice; start a terminal (the corporation's, in its seat) or a gate (the corporation's or the
 * alliance's), and give goods from the player's stock in the project's hub. The server decides.
 */
@Component({
  selector: 'wg-corp-projects',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (message(); as m) {
      <p class="msg" role="status" data-projects-message>{{ m }}</p>
    }
    @let v = view();
    @let corp = v.corporation;
    <h3 class="hud-title">{{ t.alliance }}</h3>
    @if (v.alliance; as a) {
      <div data-alliance [attr.data-alliance-name]="a.name">
        <p><strong>{{ a.name }}</strong></p>
        <ul class="list" data-list="alliance-members">
          @for (m of a.members; track m.corpId) {
            <li [attr.data-alliance-member]="m.tag">
              {{ t.member(m.name, m.tag, m.leader) }}
              @if (m.leavingAt) {
                <span class="dim"> · {{ t.leaving(time(m.leavingAt)) }}</span>
              }
            </li>
          }
        </ul>
        @if (a.leads) {
          <div class="actions">
            <input type="text" class="short" maxlength="4" data-input="ally-tag" [placeholder]="t.tagPlaceholder" [value]="allyTag()" (input)="allyTag.set(text($event))" />
            <button type="button" class="btn" data-action="invite-corp" [disabled]="busy() || !allyTag().trim()" (click)="inviteCorp()">{{ t.inviteCorp }}</button>
          </div>
        }
        @if (a.invited.length) {
          <p class="dim small">{{ t.invitedCorps(a.invited.join(', ')) }}</p>
        }
        @if (a.chief) {
          <div class="actions">
            <button type="button" class="btn" data-action="leave-alliance" [disabled]="busy()" (click)="run({ op: 'leaveAlliance' }, t.message.allianceLeft)">{{ t.leaveAlliance }}</button>
          </div>
        }
      </div>
    } @else {
      <p class="dim small">{{ t.noAlliance }}</p>
      @if (corp?.role === 'chief') {
        @if (v.allianceInvitations.length) {
          <ul class="list" data-list="alliance-invitations">
            @for (i of v.allianceInvitations; track i.allianceId) {
              <li class="row" [attr.data-alliance-invitation]="i.allianceId">
                <span>{{ t.allianceInvitedBy(i.name, i.by) }}</span>
                <span class="actions">
                  <button type="button" class="btn btn--primary" data-action="accept-alliance" [disabled]="busy()" (click)="run({ op: 'acceptAlliance', allianceId: i.allianceId }, t.message.allianceJoined)">✓</button>
                  <button type="button" class="btn" data-action="decline-alliance" [disabled]="busy()" (click)="run({ op: 'declineAlliance', allianceId: i.allianceId }, t.message.allianceDeclined)">✕</button>
                </span>
              </li>
            }
          </ul>
        }
        <div class="actions">
          <input type="text" class="wide" maxlength="32" data-input="alliance-name" [placeholder]="t.allianceName" [value]="allianceName()" (input)="allianceName.set(text($event))" />
          <button type="button" class="btn" data-action="found-alliance" [disabled]="busy() || !allianceName().trim()" (click)="foundAlliance()">{{ t.foundAlliance }}</button>
        </div>
      } @else {
        <p class="dim small">{{ t.chiefOnly }}</p>
      }
    }

    <h3 class="hud-title">{{ t.megaprojects }}</h3>
    <ul class="list" data-list="megaprojects">
      @for (p of v.megaprojects; track p.id) {
        <li class="project" [attr.data-project]="p.kind" [attr.data-scope]="p.scope" [attr.data-done]="p.completedAt !== null">
          <span>{{ t.project(t.kinds[p.kind], t.scopes[p.scope], p.ownerName, hubName(p.hubId)) }}</span>
          <span class="bar"><span class="fill" [style.width.%]="p.done * 100"></span></span>
          <span class="dim small">
            {{ p.completedAt !== null ? t.completed + ' · ' + t.effects[p.kind] : t.done(pct(p)) }}
          </span>
          <span class="small">
            @for (r of needs(p); track r.m) {
              <span [attr.data-need]="r.m" [class.dim]="r.have >= r.need">{{ t.needs(r.m, qty(r.have), qty(r.need)) }} </span>
            }
          </span>
          @if (p.shares.length) {
            <span class="dim small" data-shares>{{ t.shares(shares(p)) }}</span>
          }
          @if (p.mine > 0) {
            <span class="dim small">{{ t.mine(money(p.mine)) }}</span>
          }
          @if (p.completedAt === null) {
            <button type="button" class="btn btn--primary" data-action="give" [title]="t.giveHint" [disabled]="busy() || !canGive(p)" (click)="give(p)">{{ t.give }}</button>
          }
        </li>
      } @empty {
        <li class="dim">{{ t.noProjects }}</li>
      }
    </ul>
    @if (corp && corp.role !== 'member') {
      <div class="actions">
        <label class="field">
          <span class="k">{{ t.kind }}</span>
          <select data-input="mega-kind" (change)="kind.set($any(text($event)))">
            <option value="terminal" [selected]="kind() === 'terminal'">{{ t.kinds.terminal }}</option>
            <option value="gate" [selected]="kind() === 'gate'">{{ t.kinds.gate }}</option>
          </select>
        </label>
        <label class="field">
          <span class="k">{{ t.scope }}</span>
          <select data-input="mega-scope" (change)="scope.set($any(text($event)))">
            <option value="corporation" [selected]="scope() === 'corporation'">{{ t.scopes.corporation }}</option>
            @if (v.alliance?.leads) {
              <option value="alliance" [selected]="scope() === 'alliance'">{{ t.scopes.alliance }}</option>
            }
          </select>
        </label>
        <label class="field">
          <span class="k">{{ t.hub }}</span>
          <select data-input="mega-hub" (change)="hub.set(text($event))">
            @for (h of v.hubs; track h.id) {
              <option [value]="h.id" [selected]="h.id === hubOf()">{{ h.name }}</option>
            }
          </select>
        </label>
      </div>
      <div class="actions">
        <button type="button" class="btn" data-action="start-project" [disabled]="busy()" (click)="start()">{{ t.start }}</button>
      </div>
    }

    @if (v.alliances.length) {
      <h3 class="hud-title">{{ t.alliances }}</h3>
      <ul class="list" data-list="alliances">
        @for (a of v.alliances; track a.id) {
          <li>{{ t.allianceSummary(a.name, a.corporations) }}</li>
        }
      </ul>
    }
  `,
  styles: `
    .small { font-size: var(--hud-font-size-micro); }
    .msg { margin: 0; padding: 6px 8px; border-left: 2px solid var(--hud-color-signal); background: var(--hud-color-signal-dim); font-size: var(--hud-font-size-label); }
    .row { grid-template-columns: 1fr auto; }
    .project { display: flex; flex-direction: column; gap: 4px; padding: 6px 0; border-bottom: 1px solid var(--hud-color-line-faint); }
    .bar { height: 4px; background: var(--hud-color-hull); }
    .fill { display: block; height: 100%; background: var(--hud-color-signal); }
    .field { display: flex; flex-direction: column; gap: 2px; font-size: var(--hud-font-size-micro); }
    input, select { height: 28px; padding: 0 6px; background: var(--hud-color-hull); border: 1px solid var(--hud-color-metal); color: var(--hud-color-text); font: inherit; }
    input.short { width: 64px; text-transform: uppercase; }
    input.wide { flex: 1; min-width: 0; }
    h3.hud-title { margin-top: var(--hud-space-3); font-size: var(--hud-font-size-label); }
  `,
})
export class CorpProjects {
  protected readonly t = inject(TEXT).projects;
  private readonly game = inject(GameService);
  readonly view = input.required<GalaxyView>();

  protected readonly busy = signal(false);
  protected readonly message = signal<string | null>(null);
  protected readonly allianceName = signal('');
  protected readonly allyTag = signal('');
  protected readonly kind = signal<MegaKind>('terminal');
  protected readonly scope = signal<MegaScope>('corporation');
  /** null: the corporation's seat. */
  protected readonly hub = signal<string | null>(null);
  protected readonly qty = qty;
  protected readonly money = money;

  protected readonly hubOf = computed(() => this.hub() ?? this.view().corporation?.hubId ?? 'hub-sirius');
  private readonly hubNames = computed(() => new Map(this.view().hubs.map((h) => [h.id, h.name])));

  protected hubName(id: string): string {
    return this.hubNames().get(id) ?? id;
  }

  protected text(e: Event): string {
    return (e.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected time(ms: number): string {
    return new Date(ms).toLocaleString('pl-PL', { dateStyle: 'short', timeStyle: 'short' });
  }

  protected pct(p: MegaView): number {
    return Math.floor(p.done * 100);
  }

  protected needs(p: MegaView): Array<{ m: string; have: number; need: number }> {
    return Object.entries(p.required).map(([m, need]) => ({ m, have: p.progress[m] ?? 0, need }));
  }

  protected shares(p: MegaView): string {
    return p.shares.map((s) => `[${s.tag}] ${money(s.value)} kr`).join(', ');
  }

  /** What the player can give now: their stock in the hub, up to what is missing. */
  private offer(p: MegaView): Record<string, number> {
    const stock = this.view().hubs.find((h) => h.id === p.hubId)?.stock ?? {};
    const out: Record<string, number> = {};
    for (const [m, need] of Object.entries(p.required)) {
      const q = Math.min(stock[m] ?? 0, need - (p.progress[m] ?? 0));
      if (q > 0) out[m] = q;
    }
    return out;
  }

  protected canGive(p: MegaView): boolean {
    return Object.keys(this.offer(p)).length > 0;
  }

  protected async run(op: GalaxyOp, done: string, after?: (r: GalaxyReply) => void): Promise<void> {
    this.busy.set(true);
    try {
      const r = await this.game.galaxyOp<GalaxyReply>(op);
      this.message.set(done);
      after?.(r);
    } catch (e) {
      this.message.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected foundAlliance(): void {
    void this.run({ op: 'foundAlliance', name: this.allianceName() }, this.t.message.allianceFounded, () => this.allianceName.set(''));
  }

  protected inviteCorp(): void {
    void this.run({ op: 'inviteCorporation', tag: this.allyTag() }, this.t.message.corpInvited, () => this.allyTag.set(''));
  }

  protected start(): void {
    void this.run({ op: 'startMegaproject', kind: this.kind(), scope: this.scope(), hubId: this.hubOf() }, this.t.message.started);
  }

  protected give(p: MegaView): void {
    void this.run({ op: 'contribute', projectId: p.id, goods: this.offer(p) }, this.t.message.given, (r) => {
      if ((r as MegaView).completedAt) this.message.set(this.t.message.completed);
    });
  }
}
