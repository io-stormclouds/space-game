import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import {
  shipToHubCommand,
  type Contract,
  type GalaxyOp,
  type GalaxyReply,
  type HubView,
  type MarketOrder,
  type Placed,
  type Shipment,
  type Side,
  type Trade,
} from '@space-game/api';
import { HudFrame } from '@space-game/ui';
import { reasonText } from '../game/format';
import { GameService } from '../game/game.service';
import { TEXT } from '../i18n/pl';

const num = (n: number, digits: number) => n.toLocaleString('pl-PL', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const qty = (n: number) => n.toLocaleString('pl-PL', { maximumFractionDigits: 1 });

/**
 * Hub panel (B6, 05-SOCIAL §3): the galaxy's market through the game server. Credits, the hubs
 * with their quotes (the faction's and players' best prices), the player's goods in each hub and in
 * the colony; limit orders, shipments between the colony and the hub, own orders and trades. The
 * server decides everything: the panel sends requests and shows the pushed view.
 */
@Component({
  selector: 'wg-hub-panel',
  imports: [HudFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section hudFrame class="panel hub" data-hub [label]="t.tab" [serial]="t.serial">
      @if (game.galaxy(); as v) {
        <div class="head">
          <span class="tag tag--sg" data-credits [attr.data-value]="v.credits">{{ t.credits(money(v.credits)) }}</span>
          <span class="dim small">{{ t.fee(pct(v.fee)) }} · {{ v.npc ? t.npcOn : t.npcOff }}</span>
        </div>
        <div class="seg tabs" role="tablist" [attr.aria-label]="t.hubs">
          @for (h of v.hubs; track h.id) {
            <button type="button" role="tab" [attr.aria-selected]="h.id === hub()?.id" [attr.aria-pressed]="h.id === hub()?.id" [attr.data-hub-id]="h.id" (click)="hubId.set(h.id)">
              {{ h.name }}
            </button>
          }
        </div>
        @if (hub(); as h) {
          <p class="dim small" data-hub-info>{{ h.faction ? t.host(h.faction) : t.noHost }} · {{ t.distance(ly(h.distanceLy), units.min(h.travelSeconds / 60)) }}</p>
          @if (h.faction) {
            <p class="dim small" data-standing [attr.data-reputation]="h.reputation" [attr.data-tariff]="h.tariff">{{ t.standing(num(h.reputation, 1), pct(h.tariff)) }}</p>
          }
        }
        @if (message(); as m) {
          <p class="msg" role="status" data-message>{{ m }}</p>
        }
        <div class="scroll">
          <table class="dtable" data-table="quotes">
            <thead>
              <tr>
                <th class="l">{{ t.material }}</th>
                <th>{{ t.colony }}</th>
                <th>{{ t.inHub }}</th>
                <th>{{ t.bid }}</th>
                <th>{{ t.ask }}</th>
                <th>{{ t.change }}</th>
              </tr>
            </thead>
            <tbody>
              @for (r of rows(); track r.material) {
                <tr
                  [class.is-selected]="r.material === material()"
                  [attr.data-material]="r.material"
                  [attr.data-bid]="r.bid"
                  [attr.data-ask]="r.ask"
                  [attr.data-stock]="r.stock"
                  [attr.data-colony]="r.colony"
                  (click)="pick(r.material, r.ask)"
                >
                  <td class="l"><button type="button" class="pick" [attr.aria-pressed]="r.material === material()">{{ r.material }}</button></td>
                  <td>{{ qty(r.colony) }}</td>
                  <td>{{ qty(r.stock) }}</td>
                  <td>{{ r.bid ? money(r.bid) : '—' }}</td>
                  <td>{{ r.ask ? money(r.ask) : '—' }}</td>
                  <td [class.up]="r.change > 0" [class.down]="r.change < 0">{{ r.change ? num(r.change, 1) : '—' }}</td>
                </tr>
              }
            </tbody>
          </table>

          @if (material(); as m) {
            <div class="trade" data-trade>
              <h3 class="hud-title">{{ m }} · {{ hub()?.name }}</h3>
              <div class="actions">
                <label class="field">
                  <span class="k">{{ t.quantity }}</span>
                  <input type="number" min="0" step="1" data-input="quantity" [value]="quantity()" (input)="quantity.set(read($event))" />
                </label>
                <label class="field">
                  <span class="k">{{ t.price }}</span>
                  <input type="number" min="0" step="0.01" data-input="price" [value]="limit()" (input)="limit.set(read($event))" />
                </label>
              </div>
              <div class="actions">
                <button type="button" class="btn btn--primary" data-action="buy" [disabled]="busy() || !ready()" (click)="order('buy')">{{ t.buy }}</button>
                <button type="button" class="btn btn--primary" data-action="sell" [disabled]="busy() || !ready()" (click)="order('sell')">{{ t.sell }}</button>
                <button type="button" class="btn" data-action="ship-to-hub" [disabled]="busy() || !colony() || quantity() <= 0" [title]="colony() ? '' : t.noColony" (click)="shipToHub()">
                  {{ t.shipToHub }}
                </button>
                <button type="button" class="btn" data-action="ship-home" [disabled]="busy() || !colony() || quantity() <= 0" [title]="colony() ? '' : t.noColony" (click)="shipHome()">
                  {{ t.shipHome }}
                </button>
              </div>
            </div>
          }

          @if (v.npc) {
            <h3 class="hud-title">{{ t.contracts }}</h3>
            <ul class="list" data-list="contracts">
              @for (c of contracts(); track c.id) {
                <li class="row" [attr.data-contract]="c.id" [attr.data-state]="c.state" [attr.data-material]="c.material" [attr.data-quantity]="c.quantity" [attr.data-reward]="c.reward" [attr.data-min-rep]="c.minRep">
                  <span>
                    {{ t.contract(qty(c.quantity), c.material, money(c.reward), num(c.rep, 1)) }}
                    <span class="dim">
                      · {{ t.contractState[c.state] }}
                      @if (c.minRep > 0) {
                        · {{ t.premium(num(c.minRep, 0)) }}
                      }
                      @if (c.state === 'open' || c.state === 'taken') {
                        · {{ t.eta(units.min(until(c.deadline) / 60)) }}
                      }
                    </span>
                  </span>
                  @if (c.state === 'open') {
                    <button type="button" class="btn" data-action="take" [disabled]="busy() || (hub()?.reputation ?? 0) < c.minRep" (click)="take(c.id)">{{ t.take }}</button>
                  } @else if (c.state === 'taken' && c.taker === v.account) {
                    <button type="button" class="btn btn--primary" data-action="deliver" [disabled]="busy()" (click)="deliver(c.id)">{{ t.deliver }}</button>
                  }
                </li>
              } @empty {
                <li class="dim">{{ t.noContracts }}</li>
              }
            </ul>
          }

          <h3 class="hud-title">{{ t.orders }}</h3>
          <ul class="list" data-list="orders">
            @for (o of v.orders; track o.id) {
              <li class="row" [attr.data-order]="o.id">
                <span>{{ orderText(o) }}</span>
                <button type="button" class="btn" data-action="cancel" [disabled]="busy()" (click)="cancel(o.id)">{{ t.cancel }}</button>
              </li>
            } @empty {
              <li class="dim">{{ t.noOrders }}</li>
            }
          </ul>

          <h3 class="hud-title">{{ t.shipments }}</h3>
          <ul class="list" data-list="shipments">
            @for (s of v.shipments; track s.id) {
              <li class="row" [attr.data-shipment]="s.id" [attr.data-direction]="s.direction">
                <span>{{ shipmentText(s) }}</span>
                <span class="dim">{{ s.arrived ? t.landing : t.eta(units.min(remaining(s) / 60)) }}</span>
              </li>
            } @empty {
              <li class="dim">{{ t.noShipments }}</li>
            }
          </ul>

          @if (v.trades.length) {
            <h3 class="hud-title">{{ t.trades }}</h3>
            <ul class="list" data-list="trades">
              @for (tr of v.trades; track tr.id) {
                <li [attr.data-trade-id]="tr.id">{{ tradeText(tr, v.account) }}</li>
              }
            </ul>
          }
        </div>
      } @else {
        <p class="note" data-offline>{{ t.offline }}</p>
      }
    </section>
  `,
  styles: `
    .hub { position: absolute; right: var(--hud-space-6); top: var(--hud-space-7); bottom: var(--hud-space-4); width: 560px; }
    .head { display: flex; justify-content: space-between; align-items: center; gap: var(--hud-space-4); }
    .small { font-size: var(--hud-font-size-micro); }
    .tabs { align-self: stretch; }
    .tabs button { flex: 1; min-width: 0; padding: 0 6px; }
    .msg { margin: 0; padding: 6px 8px; border-left: 2px solid var(--hud-color-signal); background: var(--hud-color-signal-dim); font-size: var(--hud-font-size-label); }
    tbody tr { cursor: pointer; }
    tr.is-selected td { background: var(--hud-color-signal-tint); }
    .pick { background: none; border: 0; padding: 0; color: inherit; font: inherit; font-weight: var(--hud-font-weight-bold); cursor: pointer; }
    .pick:focus-visible { outline: 2px solid var(--hud-color-signal); outline-offset: 2px; }
    .trade { display: flex; flex-direction: column; gap: var(--hud-space-3); padding: var(--hud-space-3) 0; border-top: 1px solid var(--hud-color-line); }
    .field { display: flex; flex-direction: column; gap: 2px; font-size: var(--hud-font-size-micro); }
    .field input { width: 120px; height: 28px; padding: 0 6px; background: var(--hud-color-hull); border: 1px solid var(--hud-color-metal); color: var(--hud-color-text); font: inherit; }
    .row { grid-template-columns: 1fr auto; }
    h3.hud-title { margin-top: var(--hud-space-3); font-size: var(--hud-font-size-label); }
  `,
})
export class HubPanel {
  protected readonly t = inject(TEXT).hub;
  private readonly text = inject(TEXT);
  protected readonly units = this.text.units;
  protected readonly game = inject(GameService);

  protected readonly hubId = signal<string | null>(null);
  protected readonly material = signal<string | null>(null);
  protected readonly quantity = signal(10);
  protected readonly limit = signal(0);
  protected readonly busy = signal(false);
  protected readonly message = signal<string | null>(null);
  /** Wall clock for the shipments' countdown (server time is unix ms too). */
  private readonly now = signal(Date.now());

  constructor() {
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  protected readonly hub = computed<HubView | null>(() => {
    const hubs = this.game.galaxy()?.hubs ?? [];
    return hubs.find((h) => h.id === this.hubId()) ?? hubs[0] ?? null;
  });

  /** Body of the colony's working port (where shipments start and land). */
  protected readonly colony = computed(() => {
    const w = this.game.world();
    const body = this.game.colonyBodyId();
    const working = (state: string) => state === 'ACTIVE' || state === 'UPGRADING';
    return w && body && w.structures.some((s) => s.kind === 'HQ' && s.bodyId === body && working(s.state)) ? body : null;
  });

  protected readonly rows = computed(() => {
    const h = this.hub();
    if (!h) return [];
    const body = this.game.colonyBodyId();
    const stored = (body && this.game.snapshot()?.colonies[body]?.storage) || {};
    return h.quotes.map((q) => ({
      material: q.material,
      bid: q.bid,
      ask: q.ask,
      change: q.change,
      stock: h.stock[q.material] ?? 0,
      colony: stored[q.material] ?? 0,
    }));
  });

  protected readonly ready = computed(() => this.quantity() > 0 && this.limit() > 0);

  /** Contracts of the selected hub: open ones and the player's own. */
  protected readonly contracts = computed(() => {
    const h = this.hub();
    return h ? (this.game.galaxy()?.contracts ?? []).filter((c) => c.hubId === h.id) : [];
  });

  protected until(at: number): number {
    return Math.max(0, (at - this.now()) / 1000);
  }

  protected take(contractId: string): void {
    void this.run<Contract>({ op: 'takeContract', contractId }, () => this.t.tookContract);
  }

  protected deliver(contractId: string): void {
    void this.run<Contract>({ op: 'deliverContract', contractId }, (c) => this.t.deliveredContract(this.money(c.reward)));
  }

  protected readonly money = (n: number) => num(n, 2);
  protected readonly num = num;
  protected readonly qty = qty;
  protected readonly pct = (f: number) => `${num(f * 100, 0)}%`;
  protected readonly ly = (n: number) => num(n, 1);

  protected remaining(s: Shipment): number {
    return Math.max(0, (s.arrivesAt - this.now()) / 1000);
  }

  protected read(e: Event): number {
    const v = Number((e.target as HTMLInputElement).value);
    return Number.isFinite(v) ? v : 0;
  }

  protected pick(material: string, ask: number): void {
    if (this.material() === material) return;
    this.material.set(material);
    if (ask > 0) this.limit.set(ask);
  }

  private hubName(id: string): string {
    return this.game.galaxy()?.hubs.find((h) => h.id === id)?.name ?? id;
  }

  protected orderText(o: MarketOrder): string {
    return this.t.order(this.t.side[o.side], qty(o.remaining), o.material, this.money(o.price), this.hubName(o.hubId));
  }

  protected shipmentText(s: Shipment): string {
    const cargo = Object.entries(s.cargo)
      .map(([m, q]) => `${m} ${qty(q)}`)
      .join(' · ');
    const route = s.direction === 'toHub' ? this.t.toHub(this.hubName(s.hubId)) : this.t.toColony(this.hubName(s.hubId));
    return `${cargo} ${route}`;
  }

  protected tradeText(tr: Trade, me: string): string {
    const what = tr.buyer === me ? this.t.bought : this.t.sold;
    const other = tr.buyer === me ? tr.seller : tr.buyer;
    return `${what(qty(tr.quantity), tr.material, this.money(tr.price))}${other === null ? ` (${this.t.faction})` : ''}`;
  }

  private async run<T extends GalaxyReply>(op: GalaxyOp, done: (r: T) => string): Promise<void> {
    this.busy.set(true);
    try {
      this.message.set(done(await this.game.galaxyOp<T>(op)));
    } catch (e) {
      this.message.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.busy.set(false);
    }
  }

  protected order(side: Side): void {
    const h = this.hub();
    const m = this.material();
    if (!h || !m) return;
    void this.run<Placed>({ op: 'placeOrder', hubId: h.id, material: m, side, quantity: this.quantity(), price: this.limit() }, (p) => {
      const done = p.order.quantity - p.order.remaining;
      if (done <= 0) return this.t.placed;
      return p.order.remaining > 0 ? this.t.partly(qty(done), qty(p.order.remaining)) : this.t.filled(qty(done));
    });
  }

  protected cancel(orderId: string): void {
    void this.run<MarketOrder>({ op: 'cancelOrder', orderId }, () => this.t.cancelled);
  }

  protected shipHome(): void {
    const h = this.hub();
    const m = this.material();
    const body = this.colony();
    if (!h || !m || !body) return;
    void this.run<Shipment>({ op: 'shipHome', hubId: h.id, bodyId: body, cargo: { [m]: this.quantity() } }, () => this.t.shipped);
  }

  protected async shipToHub(): Promise<void> {
    const h = this.hub();
    const m = this.material();
    const body = this.colony();
    if (!h || !m || !body) return;
    this.busy.set(true);
    try {
      const result = await this.game.command(shipToHubCommand(body, h.id, { [m]: this.quantity() }));
      const rejected = result.events.find((e) => e.type === 'COMMAND_REJECTED');
      this.message.set(rejected ? reasonText(this.text, rejected.reason, rejected.detail) : this.t.shipped);
    } catch (e) {
      this.message.set(e instanceof Error ? e.message : String(e));
    } finally {
      this.busy.set(false);
    }
  }
}
