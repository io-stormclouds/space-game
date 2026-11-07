import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  RESOURCE_METER_SEGMENTS,
  formatLoad,
  formatQty,
  formatRate,
  resourceRatio,
  resourceState,
  type ResourceReadout,
} from '@space-game/hud-design-system/core';
import { HUD_TEXT } from './hud-text';

const SEGMENTS = Array.from({ length: RESOURCE_METER_SEGMENTS }, (_, i) => i);

/**
 * Narrow top bar of readouts (DS `ResourcePanel`): micro label row over a tabular value and an
 * optional 10-segment meter. Put it on a `<header>`. Extra controls go into an element marked
 * `hudResbarTrail` with the class `hud-resbar__trail`.
 */
@Component({
  selector: 'header[hudResourcePanel]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'hud-resbar', '[attr.aria-label]': 'text.resources' },
  template: `
    @if (designation()) {
      <div class="hud-resbar__id">
        @if (subline()) {
          <span class="hud-micro">{{ subline() }}</span>
        }
        <span class="hud-resbar__name">{{ designation() }}</span>
      </div>
    }
    <dl class="hud-resbar__list">
      @for (r of rows(); track r.id) {
        <div class="hud-res" [attr.data-state]="r.state">
          <dt class="hud-res__meta">
            <span class="hud-res__led" [class.hud-blink]="r.state === 'critical'" aria-hidden="true"></span>
            <span class="hud-res__code">{{ r.code }}</span>
            <span class="hud-res__name">{{ r.label }}</span>
            @if (r.rateText) {
              <span class="hud-res__rate" [class.is-negative]="r.negative">{{ r.rateText }}{{ text.perMinute }}</span>
            }
          </dt>
          <dd class="hud-res__data">
            <span class="hud-res__value"
              >{{ r.valueText }}@if (r.maxText) {<span class="hud-res__max">/{{ r.maxText }}</span>}@if (r.unit) {<span class="hud-res__unit">{{ r.unit }}</span>}</span
            >
            @if (r.lit !== undefined) {
              <span class="hud-res__meter" aria-hidden="true">
                @for (i of segments; track i) {
                  <span class="hud-res__seg" [class.is-lit]="i < r.lit"></span>
                }
              </span>
            }
            @if (r.state === 'low') {
              <span class="hud-visually-hidden">, {{ text.stateLow }}</span>
            } @else if (r.state === 'critical') {
              <span class="hud-visually-hidden">, {{ text.stateCritical }}</span>
            }
          </dd>
        </div>
      }
    </dl>
    <ng-content select="[hudResbarTrail]" />
    @if (serial()) {
      <span class="hud-resbar__serial" aria-hidden="true">{{ serial() }}</span>
    }
  `,
})
export class ResourcePanel {
  readonly readouts = input.required<readonly ResourceReadout[]>();
  /** Left block, e.g. colony designation "KOL · TAU-CETI/E". */
  readonly designation = input<string>();
  /** Micro line above the designation, e.g. game time. */
  readonly subline = input<string>();
  /** Decorative serial in the right corner. */
  readonly serial = input<string>();

  protected readonly text = inject(HUD_TEXT);
  protected readonly segments = SEGMENTS;
  protected readonly rows = computed(() =>
    this.readouts().map((r) => {
      const format = r.kind === 'load' ? formatLoad : formatQty;
      const ratio = resourceRatio(r);
      return {
        id: r.id,
        code: r.code,
        label: r.label,
        unit: r.unit,
        state: resourceState(r),
        valueText: format(r.value),
        maxText: r.max === undefined ? '' : format(r.max),
        rateText: r.rate === undefined ? '' : formatRate(r.rate),
        negative: (r.rate ?? 0) < 0,
        lit: ratio === undefined ? undefined : Math.round(ratio * RESOURCE_METER_SEGMENTS),
      };
    }),
  );
}
