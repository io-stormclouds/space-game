import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import type { BodyId, CelestialBody } from '@space-game/api';
import { HudFrame } from '@space-game/ui';
import { bodyName, clockShort, describeEvent } from '../game/format';
import { GameService } from '../game/game.service';
import { UiState } from '../game/ui-state';
import { TEXT } from '../i18n/pl';

/** "Rozkaz misji · Kolonizacja Tau Ceti" with the four canvas goals. */
@Component({
  selector: 'wg-mission-panel',
  imports: [HudFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section hudFrame class="panel panel--left" [label]="t.mission.tab" [serial]="t.mission.serial">
      <h2 class="hud-title">{{ t.mission.title }}</h2>
      <ol class="list goals">
        @for (g of goals(); track g.id; let i = $index) {
          <li [class.is-done]="g.done" [class.is-current]="g.current">
            <span class="no">{{ g.done ? t.mission.done : '0' + (i + 1) }}</span>
            <span>{{ t.mission.goals[g.id] }}</span>
          </li>
        }
      </ol>
    </section>
  `,
  styles: `
    .goals li { grid-template-columns: 28px 1fr; text-transform: uppercase; letter-spacing: 0.06em; color: var(--hud-color-text-dim); }
    .no { display: inline-grid; place-items: center; height: 20px; border: 1px solid var(--hud-color-metal); font-size: var(--hud-font-size-micro); }
    .is-current { color: var(--hud-color-signal); font-weight: var(--hud-font-weight-bold); }
    .is-current .no { border-color: var(--hud-color-signal); }
    .is-done span:last-child { text-decoration: line-through; }
  `,
})
export class MissionPanel {
  protected readonly t = inject(TEXT);
  private readonly game = inject(GameService);
  protected readonly goals = computed(() => {
    const list = this.game.snapshot()?.objectives ?? [];
    const current = list.findIndex((o) => !o.done);
    return list.map((o, i) => ({ id: o.id, done: o.done, current: i === current }));
  });
}

/** Phase banner in the middle (canvas "STATUS"). */
@Component({
  selector: 'wg-status-banner',
  imports: [HudFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (status(); as s) {
      <section hudFrame class="panel panel--center" [label]="t.status.tab" role="status">
        <strong class="title">■ {{ s.title }}</strong>
        <span class="dim">{{ s.text }}</span>
      </section>
    }
  `,
  styles: `
    .title { text-transform: uppercase; letter-spacing: var(--hud-tracking-title); }
    .title::first-letter { color: var(--hud-color-signal); }
  `,
})
export class StatusBanner {
  protected readonly t = inject(TEXT);
  private readonly game = inject(GameService);
  private readonly ui = inject(UiState);
  protected readonly status = computed(() => {
    const t = this.t.status;
    const w = this.game.world();
    if (!w || this.game.snapshot()?.scenarioId !== 'tau-ceti') return null;
    const ark = w.ships.find((s) => s.role === 'MOTHERSHIP');
    const site = w.colony.siteBodyId;
    const port = w.structures.find((s) => s.kind === 'HQ');
    if (w.scan.state === 'NONE') return t.arrived;
    if (w.scan.state === 'RUNNING') return { title: t.scanning.title, text: t.scanning.text(this.t.units.min(w.scan.endsAt - w.time)) };
    if (!site) return t.choose;
    if (!port && (ark?.state !== 'DOCKED' || ark.currentBodyId !== site)) return { title: t.flying.title, text: t.flying.text(bodyName(w, site)) };
    if (!port) return this.ui.placement() ? t.place : null;
    if (w.colony.foundedAt === null) return { title: t.building.title, text: t.building.text(Math.round(port.progress * 100)) };
    return null;
  });
}

/** "Wyniki skanu · Ciała układu" with the deposits of the selected body (canvas board 4). */
@Component({
  selector: 'wg-scan-panel',
  imports: [HudFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section hudFrame class="panel panel--right" [label]="t.scan.tab" serial="SCN · 5+1 OBJ">
      <div class="head"><h2 class="hud-title">{{ t.scan.title }}</h2><span class="hud-micro">{{ t.scan.columns }}</span></div>
      <div class="scroll">
      <ul class="list bodies">
        @for (b of bodies(); track b.id) {
          <li [class.is-on]="b.id === selectedId()" (click)="select(b.id)">
            <span class="letter">{{ b.letter }}</span>
            <span><strong>{{ b.name }}</strong><br /><span class="hud-micro">{{ b.type }}</span></span>
            <span>{{ b.sun }}</span>
            <span class="tag" [class.tag--sg]="b.recommended">{{ b.rating }}</span>
          </li>
        }
      </ul>
      @if (deposits(); as d) {
        <span class="hud-micro">{{ t.scan.depositsOf(d.name) }}</span>
        <ul class="list deps">
          @for (x of d.list; track x.code) {
            <li>
              <strong>{{ x.code }}</strong><span class="dim">{{ x.name }}</span>
              <span class="bar-meter"><span [style.width.%]="x.pct"></span></span>
              <span class="lvl">{{ x.level }}</span>
            </li>
          }
        </ul>
      }
      </div>
    </section>
  `,
  styles: `
    .head { display: flex; justify-content: space-between; align-items: baseline; }
    .bodies li { grid-template-columns: 24px 1fr 44px 90px; cursor: pointer; text-transform: uppercase; letter-spacing: 0.06em; }
    .bodies li.is-on { background: var(--hud-color-signal-tint); color: var(--hud-color-signal); border-left: 2px solid var(--hud-color-signal); }
    .bodies .tag { justify-self: end; }
    .letter { color: var(--hud-color-text-dim); }
    .deps li { grid-template-columns: 40px 1fr 60px 80px; }
    .lvl { text-align: right; text-transform: uppercase; font-size: var(--hud-font-size-micro); }
  `,
})
export class ScanPanel {
  protected readonly t = inject(TEXT);
  private readonly game = inject(GameService);
  private readonly ui = inject(UiState);
  protected readonly selectedId = computed(() => {
    const s = this.ui.selection();
    return s.kind === 'BODY' || s.kind === 'TILE' ? s.bodyId : null;
  });

  protected readonly bodies = computed(() =>
    (this.game.world()?.bodies ?? [])
      .filter((b): b is CelestialBody & { profile: NonNullable<CelestialBody['profile']> } => !!b.profile)
      .map((b) => ({
        id: b.id,
        letter: b.kind === 'BELT' ? 'PAS' : b.name.split(' ').pop()!.toUpperCase(),
        name: b.name,
        type: b.profile.type,
        sun: `×${(b.insolation ?? 1).toLocaleString('pl-PL')}`,
        rating: b.profile.rating,
        recommended: b.profile.rating === 'zalecana',
      })),
  );

  protected readonly deposits = computed(() => {
    const id = this.selectedId() ?? this.game.world()?.colony.siteBodyId;
    const w = this.game.world();
    const b = w?.bodies.find((x) => x.id === id);
    if (!b?.profile) return null;
    const cat = this.game.catalog();
    return {
      name: b.name,
      list: Object.entries(b.profile.deposits).map(([code, pct]) => ({
        code,
        name: cat?.materials.find((m) => m.id === code)?.name ?? code,
        pct,
        level: this.t.scan.levels(pct),
      })),
    };
  });

  protected select(bodyId: BodyId): void {
    this.ui.select({ kind: 'BODY', bodyId });
  }
}

/** "Dziennik" (canvas board 6): latest events, rejections in alert colour. */
@Component({
  selector: 'wg-log-panel',
  imports: [HudFrame],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section hudFrame class="panel panel--right log" [label]="t.log.tab" [serial]="t.log.serial(lines().length)" aria-live="polite">
      <div class="scroll">
        @for (l of lines(); track $index) {
          <div class="line" [class.al]="l.alert"><span class="dim">{{ l.time }}</span><span>{{ l.text }}</span></div>
        } @empty {
          <span class="dim">{{ t.log.empty }}</span>
        }
      </div>
    </section>
  `,
  styles: `
    .log { max-height: 240px; }
    .log .scroll { gap: 0; }
    .line { display: grid; grid-template-columns: 44px 1fr; gap: 8px; font-size: var(--hud-font-size-label); padding: 3px 0; }
  `,
})
export class LogPanel {
  protected readonly t = inject(TEXT);
  private readonly game = inject(GameService);
  protected readonly lines = computed(() => {
    const w = this.game.world();
    const cat = this.game.catalog();
    return this.game
      .log()
      .slice(0, 12)
      .map((e) => ({ time: clockShort(e.time), ...describeEvent(this.t, e.event, w, cat) }))
      .filter((l): l is { time: string; text: string; alert: boolean } => !!l.text);
  });
}

export const FLOAT_PANELS = [MissionPanel, StatusBanner, ScanPanel, LogPanel];
