import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { AtanorCommand } from '@space-game/render';
import { AtanorSession, type PaletteCommand } from '../game/atanor-session';
import { UiState } from '../game/ui-state';
import { TEXT } from '../i18n/pl';

/** PoC command palette (command-palette.component.ts:102-115): symbol and key per command. */
const PALETTE: ReadonlyArray<{ id: PaletteCommand; symbol: string; key: string }> = [
  { id: 'GRAB', symbol: '●', key: 'Q' },
  { id: 'DROP', symbol: '○', key: 'W' },
  { id: 'ROTATE_CW', symbol: '↻', key: 'E' },
  { id: 'ROTATE_CCW', symbol: '↺', key: 'R' },
  { id: 'PIVOT_CW', symbol: '⤾', key: 'T' },
  { id: 'PIVOT_CCW', symbol: '⤿', key: 'Y' },
  { id: 'EXTEND', symbol: '⇥', key: 'U' },
  { id: 'RETRACT', symbol: '⇤', key: 'I' },
  { id: 'TRACK_POS', symbol: '⇛', key: 'O' },
  { id: 'TRACK_NEG', symbol: '⇚', key: 'P' },
  { id: 'REPEAT', symbol: '⮌', key: 'X' },
  { id: 'CLEAR', symbol: '✕', key: 'Del' },
];
const SYMBOL = new Map(PALETTE.map((p) => [p.id, p.symbol]));
const BY_KEY = new Map(PALETTE.map((p) => [p.key.toLowerCase(), p.id]));

/**
 * Timeline of the Atanor machine (AT2, docs/atanor-expansion-design.md §5.2), ported from
 * poc/space-atanor timeline.component.ts: a row per arm, a column per tick; click writes the
 * palette command, right click clears. Added: length follows the program, playhead and JAM in
 * their column, commands the arm cannot run, inserting and deleting columns, copy / paste of a
 * range, typing commands with the PoC keys (the cursor moves on like a tracker).
 */
@Component({
  selector: 'wg-atanor-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (session.state(); as ed) {
      <div class="head">
        <h2 class="hud-title sg">{{ r()?.levelName ?? '—' }}</h2>
        <span class="hud-micro" data-atanor="where">{{ r()?.recipeId ?? '' }} · {{ r()?.siteLevel ? tt.building(r()!.siteLevel) : tt.sandbox }}</span>
        <span class="tag" [class.tag--al]="!!r()?.jam" [class.tag--sg]="session.trial() && !r()?.jam">{{ status() }}</span>
      </div>
      <dl class="metrics">
        <div><dt>{{ tt.ticks }}</dt><dd data-atanor="ticks">{{ r()?.ticks ?? 0 }}</dd></div>
        <div><dt>{{ tt.delivered }}</dt><dd data-atanor="delivered">{{ r()?.delivered ?? 0 }} / {{ r()?.target ?? 0 }}</dd></div>
        <div><dt>{{ tt.cycles }}</dt><dd data-atanor="cycles">{{ cycles() }}</dd></div>
        <div><dt>{{ tt.area }}</dt><dd data-atanor="area">{{ r()?.cyclesPerOutput !== null ? r()?.area : tt.unmeasured }}</dd></div>
        <div><dt>{{ tt.arms }}</dt><dd data-atanor="arms">{{ ed.solution.arms.length }}{{ maxArms() ? ' / ' + maxArms() : '' }}</dd></div>
      </dl>
      @if (r()?.jam; as jam) {
        <span class="al" data-atanor="jam">{{ tt.jam }} · {{ jam.reason }}: {{ jam.message }}</span>
      }
      <div class="tools" role="toolbar" [attr.aria-label]="tl.palette">
        @for (p of palette; track p.id) {
          <button type="button" class="pal" [class.on]="session.command() === p.id" [attr.aria-pressed]="session.command() === p.id" [title]="tl.commands[p.id] + ' [' + p.key + ']'" [attr.data-cmd]="p.id" (click)="session.command.set(p.id)">
            <span class="sym">{{ p.symbol }}</span><span class="key">{{ p.key }}</span>
          </button>
        }
        <span class="gap"></span>
        <button type="button" class="act" data-action="insert-column" [title]="tl.insert + ' [Insert]'" (click)="insert()">{{ tl.insert }}</button>
        <button type="button" class="act" data-action="delete-column" [title]="tl.remove + ' [Shift+Delete]'" (click)="remove()">{{ tl.remove }}</button>
        <button type="button" class="act" data-action="undo" [disabled]="!ed.canUndo" [title]="tl.undo + ' [Ctrl+Z]'" (click)="session.undo()">{{ tl.undo }}</button>
        <button type="button" class="act" data-action="redo" [disabled]="!ed.canRedo" [title]="tl.redo + ' [Ctrl+Y]'" (click)="session.redo()">{{ tl.redo }}</button>
      </div>
      @if (ed.solution.arms.length === 0) {
        <p class="dim">{{ tl.empty }}</p>
      } @else {
        <div class="grid" tabindex="0" data-atanor="timeline" [attr.aria-label]="tl.tab" (keydown)="onKey($event)">
          <div class="row hdr">
            <div class="lbl"></div>
            @for (c of columns(); track c) {
              <div class="col" [class.play]="playhead() === c" [class.focus]="focus().col === c">{{ c }}</div>
            }
          </div>
          @for (arm of ed.solution.arms; track arm.id; let i = $index) {
            <div class="row" [class.selected]="ed.selectedId === arm.id" [attr.data-arm]="arm.id">
              <button type="button" class="lbl" (click)="session.selectArm(arm.id)">{{ tl.arm(i + 1, arm.isPiston, arm.length, arm.grippers ?? 1) }}</button>
              @for (c of columns(); track c) {
                <div
                  class="cell"
                  [attr.data-col]="c"
                  [class.play]="playhead() === c"
                  [class.has]="!!cmdAt(arm.id, c)"
                  [class.focus]="focus().arm === arm.id && focus().col === c"
                  [class.range]="inRange(arm.id, c)"
                  [class.jam]="jamAt(arm.id, c)"
                  [class.bad]="!!issueAt(arm.id, c)"
                  [title]="cellTitle(arm.id, c)"
                  (mousedown)="down($event, arm.id, c)"
                  (contextmenu)="clear($event, arm.id, c)"
                >{{ symbol(cmdAt(arm.id, c)) }}</div>
              }
            </div>
          }
        </div>
      }
      <p class="hint">{{ issueText() ?? tl.hint }}</p>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: var(--hud-space-3); min-height: 0; }
    .head { display: flex; align-items: baseline; gap: var(--hud-space-4); }
    .head .tag { margin-left: auto; }
    .metrics { display: flex; gap: var(--hud-space-7); margin: 0; }
    .metrics div { display: flex; gap: var(--hud-space-3); align-items: baseline; }
    .metrics dt { font-size: var(--hud-font-size-micro); letter-spacing: var(--hud-tracking-label); text-transform: uppercase; color: var(--hud-color-text-dim); }
    .metrics dd { margin: 0; font-weight: var(--hud-font-weight-bold); }
    .tools { display: flex; gap: 2px; align-items: center; flex-wrap: wrap; }
    .pal { display: inline-flex; flex-direction: column; align-items: center; justify-content: center; width: 30px; height: 30px; padding: 0; background: var(--hud-color-graphite); border: var(--hud-stroke-hair) solid var(--hud-color-line); color: var(--hud-color-text); cursor: pointer; }
    .pal.on { border-color: var(--hud-color-signal); color: var(--hud-color-signal); }
    .pal .sym { font-size: 13px; line-height: 1; }
    .pal .key { font-size: 8px; color: var(--hud-color-text-faint); }
    .gap { flex: 1; }
    .act { height: 24px; padding: 0 var(--hud-space-3); background: var(--hud-color-graphite); border: var(--hud-stroke-hair) solid var(--hud-color-line); color: var(--hud-color-text-dim); font: inherit; font-size: var(--hud-font-size-micro); letter-spacing: var(--hud-tracking-label); text-transform: uppercase; cursor: pointer; }
    .act:disabled { opacity: 0.4; cursor: default; }
    .grid { overflow: auto; outline: none; border: var(--hud-stroke-hair) solid var(--hud-color-line); min-height: 0; flex: 1; }
    .grid:focus-visible { border-color: var(--hud-color-signal); }
    .row { display: flex; height: 22px; }
    .row.selected .lbl { color: var(--hud-color-signal); }
    .lbl { flex: 0 0 150px; position: sticky; left: 0; z-index: 1; display: flex; align-items: center; padding: 0 var(--hud-space-3); background: var(--hud-color-hull); border: 0; border-right: var(--hud-stroke-hair) solid var(--hud-color-line); color: var(--hud-color-text-dim); font: inherit; font-size: var(--hud-font-size-micro); text-align: left; cursor: pointer; white-space: nowrap; }
    .hdr .lbl { cursor: default; }
    .col, .cell { flex: 0 0 26px; display: grid; place-items: center; border-right: var(--hud-stroke-hair) dashed var(--hud-color-line); font-size: 12px; user-select: none; }
    .col { font-size: var(--hud-font-size-micro); color: var(--hud-color-text-faint); }
    .cell { cursor: pointer; background: var(--hud-color-void); }
    .cell:hover { background: var(--hud-color-graphite); }
    .cell.has { color: var(--hud-color-text); }
    .play { background: var(--hud-color-signal-dim, rgba(255, 176, 0, 0.15)); }
    .col.play { color: var(--hud-color-signal); }
    .focus { outline: 1px solid var(--hud-color-text-dim); outline-offset: -1px; }
    .range { background: var(--hud-color-graphite); }
    .bad { color: var(--hud-color-alert); text-decoration: line-through; }
    .jam { outline: 2px solid var(--hud-color-alert); outline-offset: -2px; }
    .hint { margin: 0; font-size: var(--hud-font-size-micro); color: var(--hud-color-text-dim); }
    .al { color: var(--hud-color-alert); font-size: var(--hud-font-size-label); }
  `,
})
export class AtanorTimeline {
  protected readonly t = inject(TEXT);
  protected readonly tt = this.t.atanor;
  protected readonly tl = this.t.atanor.timeline;
  protected readonly session = inject(AtanorSession);
  private readonly ui = inject(UiState);
  protected readonly palette = PALETTE;
  protected readonly r = this.ui.atanorReadout;

  /** Cursor of the timeline (last clicked cell); typing writes here. */
  protected readonly focus = signal<{ arm: string | null; col: number }>({ arm: null, col: 0 });
  /** Shift+click range in the focused arm's row (copy / paste). */
  private readonly range = signal<{ arm: string; from: number; to: number } | null>(null);
  private clipboard: Array<AtanorCommand | null> = [];

  protected readonly columns = computed(() => {
    const s = this.session.state()?.solution;
    const len = s ? Math.max(0, ...Object.values(s.program).map((t) => t.length)) : 0;
    return Array.from({ length: Math.max(12, len + 4) }, (_, i) => i);
  });

  protected readonly playhead = computed(() => (this.session.trial() ? (this.r()?.timelinePosition ?? null) : null));

  protected readonly maxArms = computed(() => this.session.state()?.maxArms ?? null);

  protected readonly cycles = computed(() => {
    const c = this.r()?.cyclesPerOutput;
    return c === null || c === undefined ? this.tt.unmeasured : String(Math.round(c * 100) / 100).replace('.', ',');
  });

  protected readonly status = computed(() => {
    const r = this.r();
    if (r?.jam) return this.tt.jam;
    return this.session.trial() ? this.tt.mode.trial : this.tt.mode.design;
  });

  /** Why the last board edit did not happen, or the machine's limit problems. */
  protected readonly issueText = computed(() => {
    const ed = this.session.state();
    if (!ed) return null;
    if (ed.issue) return this.tt.issues[ed.issue] ?? ed.issue;
    return ed.machineIssues[0]?.message ?? null;
  });

  /** Command in a cell; an explicit EMPTY (reference programs) reads as an empty cell. */
  protected cmdAt(armId: string, col: number): AtanorCommand | null {
    const cmd = this.session.state()?.solution.program[armId]?.[col] ?? null;
    return cmd === 'EMPTY' ? null : cmd;
  }

  protected symbol(cmd: AtanorCommand | null): string {
    return cmd ? (SYMBOL.get(cmd) ?? '•') : '';
  }

  protected issueAt(armId: string, col: number): string | null {
    const i = this.session.state()?.programIssues.find((x) => x.armId === armId && x.column === col);
    return i ? (this.tl.issue[i.code] ?? i.code) : null;
  }

  protected jamAt(armId: string, col: number): boolean {
    const r = this.r();
    if (!r?.jam || r.jamColumn !== col) return false;
    return r.jamArms.length === 0 || r.jamArms.includes(armId);
  }

  protected inRange(armId: string, col: number): boolean {
    const g = this.range();
    return !!g && g.arm === armId && col >= Math.min(g.from, g.to) && col <= Math.max(g.from, g.to);
  }

  protected cellTitle(armId: string, col: number): string {
    const cmd = this.cmdAt(armId, col);
    const base = this.tl.cell(col, cmd ? (this.tl.commands[cmd] ?? cmd) : this.tl.emptyCell);
    const issue = this.issueAt(armId, col);
    return issue ? `${base} · ${issue}` : this.jamAt(armId, col) ? `${base} · ${this.tl.jam(this.r()?.jam?.reason ?? '')}` : base;
  }

  protected down(e: MouseEvent, armId: string, col: number): void {
    if (e.button !== 0) return;
    if (e.shiftKey && this.focus().arm === armId) {
      this.range.set({ arm: armId, from: this.focus().col, to: col });
      return;
    }
    this.range.set(null);
    this.focus.set({ arm: armId, col });
    this.session.writeCell(armId, col);
  }

  protected clear(e: MouseEvent, armId: string, col: number): void {
    e.preventDefault();
    this.focus.set({ arm: armId, col });
    this.session.writeCell(armId, col, 'CLEAR');
  }

  protected insert(): void {
    this.session.insertColumn(this.focus().col);
  }

  protected remove(): void {
    this.session.deleteColumn(this.focus().col);
  }

  /** Keys while the timeline has focus: PoC palette keys write and move on, arrows move. */
  protected onKey(e: KeyboardEvent): void {
    const ed = this.session.state();
    if (!ed || e.altKey) return;
    const arms = ed.solution.arms.map((a) => a.id);
    const f = this.focus();
    const arm = f.arm && arms.includes(f.arm) ? f.arm : (arms[0] ?? null);
    if (!arm) return;
    const k = e.key.toLowerCase();
    const handled = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (e.ctrlKey || e.metaKey) {
      if (k === 'c') {
        const g = this.range();
        const from = g ? Math.min(g.from, g.to) : f.col;
        const to = g ? Math.max(g.from, g.to) : f.col;
        this.clipboard = Array.from({ length: to - from + 1 }, (_, i) => this.cmdAt(g?.arm ?? arm, from + i));
        handled();
      } else if (k === 'v' && this.clipboard.length) {
        this.session.paste(arm, f.col, this.clipboard);
        this.focus.set({ arm, col: f.col + this.clipboard.length });
        handled();
      }
      return; // Ctrl+Z / Ctrl+Y go to the page (undo / redo)
    }
    const move = (dCol: number, dArm = 0) => {
      const i = Math.max(0, Math.min(arms.length - 1, arms.indexOf(arm) + dArm));
      this.focus.set({ arm: arms[i]!, col: Math.max(0, f.col + dCol) });
      this.range.set(null);
      handled();
    };
    if (k === 'arrowright') return move(1);
    if (k === 'arrowleft') return move(-1);
    if (k === 'arrowdown') return move(0, 1);
    if (k === 'arrowup') return move(0, -1);
    if (k === 'insert') {
      this.insert();
      return handled();
    }
    if (k === 'delete' && e.shiftKey) {
      this.remove();
      return handled();
    }
    if (k === 'delete' || k === 'backspace') {
      this.session.command.set('CLEAR');
      this.session.writeCell(arm, f.col, 'CLEAR');
      this.focus.set({ arm, col: k === 'backspace' ? Math.max(0, f.col - 1) : f.col + 1 });
      return handled();
    }
    const cmd = BY_KEY.get(k);
    if (cmd) {
      this.session.command.set(cmd);
      this.session.writeCell(arm, f.col, cmd);
      this.focus.set({ arm, col: f.col + 1 });
      return handled();
    }
  }
}
