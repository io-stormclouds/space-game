import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

const DEG = Math.PI / 180;
const CARDINALS = ['N', 'E', 'S', 'W'] as const;
/** Fine step of the arrow keys on the dial. */
const KEY_STEP = 15;

/**
 * View rotation widget: Q/E buttons, a compass dial that turns with the view (drag it to rotate
 * freely, click it to put north up), top-down toggle and centring. Presentational: the viewport
 * feeds it the camera heading and turns the camera on its events.
 */
@Component({
  selector: 'app-view-compass',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="hud-frame compass" aria-label="Obrót widoku">
      <span class="hud-frame__label">Widok</span>
      <button type="button" class="btn btn--icon compass__icon" title="Obróć w lewo o 45° (Q)" aria-label="Obróć w lewo" (click)="turn.emit(-45)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>
      </button>

      <div
        class="compass__dial"
        role="slider"
        tabindex="0"
        aria-label="Kierunek widoku"
        aria-valuemin="0"
        aria-valuemax="359"
        [attr.aria-valuenow]="rose360()"
        [attr.aria-valuetext]="'patrzysz na ' + bearing() + '°'"
        title="Przeciągnij: obrót · klik: północ u góry · strzałki: co 15°"
        (pointerdown)="onDown($event)"
        (pointermove)="onMove($event)"
        (pointerup)="onUp($event)"
        (pointercancel)="drag = null"
        (keydown)="onKey($event)"
      >
        <svg viewBox="-32 -32 64 64" aria-hidden="true">
          <circle class="compass__ring" r="29" />
          <g [attr.transform]="'rotate(' + heading() + ')'">
            @for (t of ticks; track t) {
              <line class="compass__tick" [class.compass__tick--north]="t === 0" x1="0" y1="-29" x2="0" [attr.y2]="t % 90 === 0 ? -23 : -26" [attr.transform]="'rotate(' + t + ')'" />
            }
          </g>
          @for (c of letters(); track c.label) {
            <text class="compass__letter" [class.compass__letter--north]="c.label === 'N'" [attr.x]="c.x" [attr.y]="c.y">{{ c.label }}</text>
          }
          <path class="compass__index" d="M0 -32 L3 -28 L-3 -28 Z" />
          <text class="compass__deg" y="3">{{ bearing() }}°</text>
        </svg>
      </div>

      <button type="button" class="btn btn--icon compass__icon" title="Obróć w prawo o 45° (E)" aria-label="Obróć w prawo" (click)="turn.emit(45)">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /></svg>
      </button>

      <div class="compass__row">
        <button type="button" class="btn" [class.is-on]="topDown()" [attr.aria-pressed]="topDown()" title="Widok z góry / izometryczny (T)" (click)="toggleTop.emit()">Z góry</button>
        <button type="button" class="btn" title="Wyśrodkuj na pokładzie (Home)" (click)="center.emit()">Środek</button>
      </div>
    </section>
  `,
})
export class ViewCompassComponent {
  /**
   * Camera heading in degrees (CameraRig.heading): 0 = looking north (−Z), and the angle by which
   * the world, and this rose with it, is turned clockwise on screen.
   */
  readonly heading = input.required<number>();
  readonly topDown = input.required<boolean>();
  /** 45° step (Q/E). */
  readonly turn = output<number>();
  /** Immediate rotation in degrees (dragging the dial). */
  readonly orbit = output<number>();
  /** Eased turn to an absolute heading in degrees. */
  readonly turnTo = output<number>();
  readonly toggleTop = output<void>();
  readonly center = output<void>();

  readonly ticks = [0, 45, 90, 135, 180, 225, 270, 315];
  readonly rose360 = computed(() => mod360(Math.round(this.heading())));
  /** Compass bearing of the view direction (what the centre shows): looking west = 270°. */
  readonly bearing = computed(() => mod360(-Math.round(this.heading())));
  /** Cardinal letters ride the ring but stay upright. */
  readonly letters = computed(() =>
    CARDINALS.map((label, i) => {
      const a = (this.heading() + i * 90) * DEG;
      return { label, x: +(18 * Math.sin(a)).toFixed(2), y: +(-18 * Math.cos(a) + 3).toFixed(2) };
    }),
  );

  drag: { last: number; x: number; y: number; moved: boolean } | null = null;

  onDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    el.focus();
    this.drag = { last: angleOf(e), x: e.clientX, y: e.clientY, moved: false };
    e.preventDefault();
  }

  onMove(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 3) return;
    d.moved = true;
    const a = angleOf(e);
    const delta = ((a - d.last + 540) % 360) - 180;
    d.last = a;
    if (delta) this.orbit.emit(delta);
  }

  onUp(e: PointerEvent): void {
    const d = this.drag;
    this.drag = null;
    if (d && !d.moved && e.button === 0) this.turnTo.emit(0);
  }

  onKey(e: KeyboardEvent): void {
    const step = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -KEY_STEP : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? KEY_STEP : 0;
    if (step) this.turnTo.emit(Math.round((this.heading() + step) / KEY_STEP) * KEY_STEP);
    else if (e.key === 'Enter' || e.key === ' ') this.turnTo.emit(0);
    else return;
    e.preventDefault();
    e.stopPropagation();
  }
}

const mod360 = (d: number) => ((d % 360) + 360) % 360;

/** Pointer angle around the dial centre in degrees, clockwise from up. */
function angleOf(e: PointerEvent): number {
  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const dx = e.clientX - (r.left + r.width / 2);
  const dy = e.clientY - (r.top + r.height / 2);
  return Math.atan2(dx, -dy) / DEG;
}
