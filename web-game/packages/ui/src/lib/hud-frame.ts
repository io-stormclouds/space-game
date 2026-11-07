import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Bordered HUD container (DS `HudFrame`): 1px edge, corner ticks, label tab and serial tag.
 * Put it on any block element: `<section hudFrame label="CMD" serial="CC-04">…</section>`.
 */
@Component({
  selector: '[hudFrame]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'hud-frame' },
  template: `
    @if (ticks()) {
      <span class="hud-frame__ticks" aria-hidden="true">
        <span class="hud-frame__tick hud-frame__tick--tl"></span>
        <span class="hud-frame__tick hud-frame__tick--tr"></span>
        <span class="hud-frame__tick hud-frame__tick--bl"></span>
        <span class="hud-frame__tick hud-frame__tick--br"></span>
      </span>
    }
    @if (label()) {
      <span class="hud-frame__label" aria-hidden="true">{{ label() }}</span>
    }
    <ng-content />
    @if (serial()) {
      <span class="hud-frame__serial" aria-hidden="true">{{ serial() }}</span>
    }
  `,
})
export class HudFrame {
  /** Tab label on the top edge, e.g. "CMD". */
  readonly label = input<string>();
  /** Serial / version tag in the bottom-right corner. */
  readonly serial = input<string>();
  /** Signal-coloured angle ticks on the four corners. */
  readonly ticks = input(true);
}
