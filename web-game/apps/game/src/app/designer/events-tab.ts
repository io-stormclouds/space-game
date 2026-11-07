import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { DomainEvent } from '@space-game/api';
import { costText, describeEvent } from '../game/format';
import { GameService } from '../game/game.service';
import { TEXT } from '../i18n/pl';
import { downloadText } from './download';
import { timeLabel } from './series';
import { Telemetry } from './telemetry';

type Scope = 'events' | 'ticks' | 'all';
const SHOWN = 200;

/** Short line for events the colony log does not describe (ticks, batches, rover moves). */
function summary(e: DomainEvent): string {
  switch (e.type) {
    case 'EXTRACTION_TICK':
      return `${e.resource} +${e.amount} · pole ${e.tileId.split(':')[1] ?? e.tileId}`;
    case 'MINING_TICK':
      return `${e.resource} +${e.amount} · ${e.shipId}`;
    case 'BATCH_STARTED':
      return `${e.recipe} · ${e.structureId} · −${costText(e.consumed)}`;
    case 'BATCH_COMPLETED':
      return `${e.recipe} · ${e.structureId} · +${costText(e.produced)}`;
    case 'ROVER_ARRIVED':
      return `${e.roverId} → pole ${e.tileIndex}`;
    case 'ROVER_MOVE_ORDERED':
      return `${e.roverId}: ${e.path.length} pól`;
    default: {
      const { type: _t, ...rest } = e as DomainEvent & Record<string, unknown>;
      const s = JSON.stringify(rest);
      return s.length > 90 ? s.slice(0, 89) + '…' : s;
    }
  }
}

/** The full event log of the game (designer), filterable by type, exportable as CSV. */
@Component({
  selector: 'wg-designer-events',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bar">
      <div class="seg" role="group">
        @for (s of scopes; track s) {
          <button type="button" [attr.aria-pressed]="scope() === s" [attr.data-scope]="s" (click)="scope.set(s)">{{ t[s] }}</button>
        }
      </div>
      <label class="type">
        {{ t.type }}
        <select [value]="type()" (change)="type.set($any($event.target).value)">
          <option value="">{{ t.anyType }}</option>
          @for (c of types(); track c.type) {
            <option [value]="c.type">{{ c.type }} ({{ c.count }})</option>
          }
        </select>
      </label>
      <button type="button" class="btn" data-action="export-csv" (click)="exportCsv()">{{ t.export }}</button>
    </div>
    <p class="note">{{ t.count(rows().length, pool().length) }}</p>
    <ol class="list log" data-list="events">
      @for (r of shown(); track $index) {
        <li [class.al]="r.alert">
          <span class="time">{{ r.time }}</span><span class="code">{{ r.type }}</span><span class="text">{{ r.text }}</span>
        </li>
      } @empty {
        <li class="dim">{{ t.empty }}</li>
      }
    </ol>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: var(--hud-space-3); min-height: 0; }
    .bar { display: flex; gap: var(--hud-space-4); align-items: center; flex-wrap: wrap; }
    .type { display: inline-flex; gap: 6px; align-items: center; font-size: var(--hud-font-size-label); color: var(--hud-color-text-dim); }
    select { height: 26px; background: var(--hud-color-void); border: 1px solid var(--hud-color-metal); color: var(--hud-color-text); font: inherit; font-size: var(--hud-font-size-label); }
    .log li { grid-template-columns: 64px 150px minmax(0, 1fr); padding: 3px 0; font-size: var(--hud-font-size-micro); }
    .time { color: var(--hud-color-text-dim); font-variant-numeric: tabular-nums; }
    .code { color: var(--hud-color-text-dim); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .text { overflow-wrap: anywhere; }
    .al .text { color: var(--hud-color-alert); }
  `,
})
export class DesignerEvents {
  protected readonly t = inject(TEXT).designer.log;
  private readonly dict = inject(TEXT);
  private readonly game = inject(GameService);
  private readonly tm = inject(Telemetry);
  protected readonly scopes: Scope[] = ['events', 'ticks', 'all'];
  protected readonly scope = signal<Scope>('events');
  protected readonly type = signal('');

  protected readonly types = computed(() =>
    Object.entries(this.tm.counts())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => a.type.localeCompare(b.type)),
  );

  protected readonly pool = computed(() => {
    const s = this.scope();
    if (s === 'events') return this.tm.log();
    if (s === 'ticks') return this.tm.ticks();
    return [...this.tm.log(), ...this.tm.ticks()].sort((a, b) => b.time - a.time);
  });

  protected readonly rows = computed(() => {
    const type = this.type();
    const world = this.game.world();
    const catalog = this.game.catalog();
    return this.pool()
      .filter((l) => !type || l.event.type === type)
      .map((l) => {
        const d = describeEvent(this.dict, l.event, world, catalog);
        return { time: timeLabel(l.time), minutes: l.time, type: l.event.type, text: d?.text ?? summary(l.event), alert: d?.alert ?? false };
      });
  });

  protected readonly shown = computed(() => this.rows().slice(0, SHOWN));

  protected exportCsv(): void {
    const q = (s: string | number) => `"${String(s).replaceAll('"', '""')}"`;
    const lines = ['czas_min;czas;typ;opis', ...this.rows().map((r) => [r.minutes.toFixed(3), r.time, r.type, r.text].map(q).join(';'))];
    downloadText(`space-game-dziennik-${this.game.snapshot()?.scenarioId ?? 'gra'}.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }
}
