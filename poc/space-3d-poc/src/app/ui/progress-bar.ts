import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-progress-bar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  template: `
    <div class="flex items-center justify-between text-xs text-slate-300 mb-1">
      <span>{{ label() }}</span>
      <span class="tabular-nums">{{ value() | number: '1.0-0' }} / {{ max() }}</span>
    </div>
    <div class="h-2 w-full rounded bg-slate-700/70 overflow-hidden">
      <div class="h-full rounded transition-[width] duration-150" [class]="barClass()" [style.width.%]="percent()"></div>
    </div>
  `,
})
export class ProgressBar {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly max = input.required<number>();
  /** Tailwind background class; when `lowClass` is given it is used at or below `lowThreshold`. */
  readonly colorClass = input('bg-blue-500');
  readonly lowClass = input<string | null>(null);
  readonly lowThreshold = input(0.3);

  readonly percent = computed(() => (this.max() > 0 ? Math.min(100, Math.max(0, (this.value() / this.max()) * 100)) : 0));
  readonly barClass = computed(() => {
    const low = this.lowClass();
    return low && this.max() > 0 && this.value() / this.max() <= this.lowThreshold() ? low : this.colorClass();
  });
}
