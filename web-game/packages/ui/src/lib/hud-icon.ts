import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { iconPaths, type IconName } from '@space-game/hud-design-system/core';

/** Stroke icon from the design system: `<svg hudIcon name="produce"></svg>`. Decorative only. */
@Component({
  selector: 'svg[hudIcon]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.75',
    'stroke-linecap': 'square',
    'stroke-linejoin': 'miter',
    'aria-hidden': 'true',
    focusable: 'false',
    '[attr.width]': 'size()',
    '[attr.height]': 'size()',
  },
  template: `<svg:path [attr.d]="path()" />`,
})
export class HudIcon {
  readonly name = input.required<IconName>();
  readonly size = input(20);
  protected readonly path = computed(() => iconPaths[this.name()]);
}
