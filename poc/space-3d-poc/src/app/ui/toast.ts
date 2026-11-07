import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NotificationService } from '../state/notification.service';

@Component({
  selector: 'app-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'pointer-events-auto flex flex-col gap-2 items-center' },
  template: `
    @for (t of notify.toasts(); track t.id) {
      <div
        class="px-3 py-1.5 rounded border text-sm shadow-lg backdrop-blur cursor-pointer"
        [class]="t.kind === 'warn' ? 'bg-amber-900/80 border-amber-600 text-amber-100' : t.kind === 'error' ? 'bg-red-900/80 border-red-600 text-red-100' : 'bg-slate-800/85 border-slate-600 text-slate-100'"
        (click)="notify.dismiss(t.id)">
        {{ t.text }}
      </div>
    }
  `,
})
export class Toast {
  protected readonly notify = inject(NotificationService);
}
