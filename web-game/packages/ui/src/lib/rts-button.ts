import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import {
  formatQty,
  motion,
  type Cost,
  type IconName,
  type RTSButtonLayout,
  type RTSButtonVariant,
} from '@space-game/hud-design-system/core';
import { HudIcon } from './hud-icon';
import { HUD_TEXT } from './hud-text';

const FLASH_MS = parseInt(motion.flash, 10);
let nextId = 0;

/**
 * Chamfered action button (DS `RTSButton`). It renders the same classes and attributes as the
 * React version, so the DS stylesheet applies unchanged: hover lights the edge, press inverts,
 * a blocked button is hatched, stays focusable and explains why (`aria-describedby`).
 */
@Component({
  selector: 'hud-rts-button',
  imports: [HudIcon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: contents' },
  template: `
    <button
      #button
      type="button"
      [class]="classes()"
      [attr.aria-disabled]="blocked() || null"
      [attr.aria-pressed]="selected() ?? null"
      [attr.aria-describedby]="blocked() ? reasonId : null"
      [attr.aria-keyshortcuts]="hotkey() || null"
      [attr.data-flash]="flash() ? '' : null"
      [attr.data-busy]="pct() !== undefined ? '' : null"
      (click)="activate()"
    >
      <span class="rts-btn__face">
        @if (icon(); as name) {
          <span class="rts-btn__icon" aria-hidden="true"><svg hudIcon [name]="name"></svg></span>
        }
        <span class="rts-btn__body"
          ><span class="rts-btn__label">{{ label() }}</span
          >@if (pct() !== undefined) {<span class="hud-visually-hidden">, {{ text.inProgress }} {{ percent() }}%</span>}@if (wide() && costs().length) {<span class="rts-btn__cost"
              >@for (c of costs(); track c.code) {<span class="rts-btn__price" [class.is-missing]="c.missing"
                  ><span class="rts-btn__price-code">{{ c.code }}</span>{{ qty(c.amount) }}</span
                >}</span
            >}@if (wide() && blocked()) {<span class="rts-btn__reason" [id]="reasonId">{{ disabledReason() }}</span>}</span
        >
        @if (hotkey()) {
          <span class="rts-btn__key" aria-hidden="true">{{ hotkey() }}</span>
        }
        @if (pct() !== undefined) {
          <span class="rts-btn__progress" aria-hidden="true" [style.--p]="pct()"></span>
        }
      </span>
    </button>
    @if (!wide() && blocked()) {
      <span class="hud-visually-hidden" [id]="reasonId">{{ disabledReason() }}</span>
    }
  `,
})
export class RtsButton {
  readonly label = input.required<string>();
  readonly hotkey = input<string>();
  readonly icon = input<IconName>();
  readonly cost = input<readonly Cost[]>();
  /** Why the action is unavailable. When set the button is `aria-disabled` and ignores activation. */
  readonly disabledReason = input<string>();
  readonly variant = input<RTSButtonVariant>('default');
  readonly layout = input<RTSButtonLayout>('wide');
  /** Toggle state (placement mode, autocast). Renders `aria-pressed`. */
  readonly selected = input<boolean>();
  /** 0..1 while the action is running. */
  readonly progress = input<number>();
  readonly activated = output<void>();

  protected readonly text = inject(HUD_TEXT);
  protected readonly reasonId = `hud-rts-reason-${nextId++}`;
  protected readonly flash = signal(false);
  protected readonly blocked = computed(() => Boolean(this.disabledReason()));
  protected readonly wide = computed(() => this.layout() === 'wide');
  protected readonly costs = computed(() => this.cost() ?? []);
  protected readonly pct = computed(() => {
    const p = this.progress();
    return p === undefined ? undefined : Math.max(0, Math.min(1, p));
  });
  protected readonly percent = computed(() => Math.round((this.pct() ?? 0) * 100));
  protected readonly classes = computed(() => {
    const variant = this.variant();
    return `rts-btn rts-btn--${this.layout()}` + (variant === 'default' ? '' : ` rts-btn--${variant}`);
  });
  protected readonly qty = formatQty;

  private readonly button = viewChild.required<ElementRef<HTMLButtonElement>>('button');
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  /** Presses the button (also used by hotkeys): flashes inverted and emits `activated`. */
  activate(): void {
    if (this.blocked()) return;
    clearTimeout(this.timer);
    this.flash.set(true);
    this.timer = setTimeout(() => this.flash.set(false), FLASH_MS);
    this.activated.emit();
  }

  focus(): void {
    this.button().nativeElement.focus();
  }
}
