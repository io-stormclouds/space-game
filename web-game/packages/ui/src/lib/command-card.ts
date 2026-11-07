import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  signal,
  viewChildren,
} from '@angular/core';
import {
  formatQty,
  type Cost,
  type IconName,
  type RTSButtonVariant,
} from '@space-game/hud-design-system/core';
import { HudFrame } from './hud-frame';
import { HUD_TEXT } from './hud-text';
import { RtsButton } from './rts-button';

export interface CommandSlot {
  id: string;
  label: string;
  hotkey?: string;
  icon?: IconName;
  cost?: readonly Cost[];
  /** One line shown in the inspector. */
  description?: string;
  disabledReason?: string;
  progress?: number;
  selected?: boolean;
  variant?: RTSButtonVariant;
  onActivate?: () => void;
}

/** Hotkey labels that differ from `KeyboardEvent.key` (the badge shows the short form). */
const KEY_ALIASES: Readonly<Record<string, string>> = { ESC: 'ESCAPE', SPACJA: ' ', DEL: 'DELETE' };

/** Normalised key of a hotkey label or a KeyboardEvent.key, for comparison. */
export function normalizeKey(key: string): string {
  const k = key.toUpperCase();
  return KEY_ALIASES[k] ?? k;
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!(t instanceof HTMLElement)) return false;
  return t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName);
}

/**
 * Command panel (DS `CommandCard`): a fixed grid of action cells divided by 1px lines, a header
 * with the selected object and an inspector line for the pointed or focused command.
 * With `hotkeys` it listens on the window; typing in a field and modified keys are ignored.
 */
@Component({
  selector: 'hud-command-card',
  imports: [HudFrame, RtsButton],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents', '(window:keydown)': 'onKey($event)' },
  template: `
    <section
      hudFrame
      class="hud-cmd"
      [label]="title()"
      [serial]="serial()"
      [attr.aria-label]="title() + ': ' + (context() || text.commands)"
    >
      <div class="hud-cmd__head">
        <span class="hud-cmd__context">{{ context() }}</span>
        @if (status()) {
          <span class="hud-micro">{{ status() }}</span>
        }
      </div>

      <div
        class="hud-cmd__grid"
        role="group"
        [attr.aria-label]="text.commandGrid"
        [style.--cols]="columns()"
        [style.--rows]="rows()"
        (mouseleave)="inspectId.set(null)"
      >
        @for (slot of cells(); track slot ? slot.id : 'empty-' + $index) {
          @if (slot) {
            <div class="hud-cmd__cell" (mouseenter)="inspectId.set(slot.id)" (focusin)="inspectId.set(slot.id)">
              <hud-rts-button
                layout="cell"
                [label]="slot.label"
                [hotkey]="slot.hotkey"
                [icon]="slot.icon"
                [cost]="slot.cost"
                [disabledReason]="slot.disabledReason"
                [progress]="slot.progress"
                [selected]="slot.selected"
                [variant]="slot.variant ?? 'default'"
                (activated)="slot.onActivate?.()"
              />
            </div>
          } @else {
            <div class="hud-cmd__cell hud-cmd__cell--empty hud-dots" aria-hidden="true">
              <span class="hud-cmd__slot-no">{{ slotNo($index) }}</span>
            </div>
          }
        }
      </div>

      <div class="hud-cmd__inspector">
        @if (inspected(); as s) {
          <div class="hud-cmd__insp-head">
            <span class="hud-cmd__insp-title">{{ s.label }}</span>
            @if (s.hotkey) {
              <span class="hud-micro">{{ text.hotkey }} · {{ s.hotkey }}</span>
            }
          </div>
          @if (s.cost?.length) {
            <div class="hud-cmd__insp-cost">
              @for (c of s.cost; track c.code) {
                <span [class.hud-alert]="c.missing">{{ c.code }} {{ qty(c.amount) }}</span>
              }
            </div>
          }
          @if (s.disabledReason) {
            <span class="hud-cmd__insp-reason">{{ s.disabledReason }}</span>
          } @else if (s.description) {
            <span class="hud-cmd__insp-desc">{{ s.description }}</span>
          }
        } @else {
          <span class="hud-micro">{{ text.inspectorHint }}</span>
        }
      </div>
    </section>
  `,
})
export class CommandCard {
  /** Tab on the frame edge, e.g. "CMD". */
  readonly title = input.required<string>();
  /** What the commands belong to, e.g. "Port kosmiczny · poz. 2". */
  readonly context = input<string>();
  /** Right side of the header. */
  readonly status = input<string>();
  readonly serial = input<string>();
  readonly columns = input(4);
  readonly rows = input(3);
  /** Slot order is grid order; `null` (or a short array) leaves an empty, inert cell. */
  readonly slots = input.required<ReadonlyArray<CommandSlot | null>>();
  readonly hotkeys = input(true);

  protected readonly text = inject(HUD_TEXT);
  protected readonly qty = formatQty;
  protected readonly inspectId = signal<string | null>(null);
  protected readonly cells = computed(() => {
    const slots = this.slots();
    return Array.from({ length: this.columns() * this.rows() }, (_, i) => slots[i] ?? null);
  });
  protected readonly inspected = computed(
    () => this.cells().find((s) => s !== null && s.id === this.inspectId()) ?? null,
  );
  private readonly buttons = viewChildren(RtsButton);

  protected slotNo(index: number): string {
    return String(index + 1).padStart(2, '0');
  }

  protected onKey(e: KeyboardEvent): void {
    if (!this.hotkeys()) return;
    if (e.defaultPrevented || e.repeat || e.altKey || e.ctrlKey || e.metaKey || isTypingTarget(e.target)) return;
    const key = normalizeKey(e.key);
    const live = this.cells().filter((s): s is CommandSlot => s !== null);
    const index = live.findIndex((s) => s.hotkey !== undefined && normalizeKey(s.hotkey) === key);
    if (index < 0) return;
    e.preventDefault();
    this.inspectId.set(live[index]!.id);
    this.buttons()[index]?.activate();
  }
}
