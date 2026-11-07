import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'warn' | 'error';
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  readonly toasts = signal<ReadonlyArray<Toast>>([]);
  private nextId = 1;

  push(text: string, kind: Toast['kind'] = 'info', ttlMs = 3000): void {
    const toast: Toast = { id: this.nextId++, text, kind };
    this.toasts.update((list) => [...list, toast]);
    setTimeout(() => this.dismiss(toast.id), ttlMs);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}
