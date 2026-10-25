import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 0;
  readonly toasts = signal<readonly Toast[]>([]);

  show(message: string, kind: ToastKind = 'info', durationMs = 4000): void {
    const id = ++this.nextId;
    this.toasts.update((toasts) => [...toasts, { id, kind, message }]);
    setTimeout(() => this.dismiss(id), durationMs);
  }

  success(message: string): void {
    this.show(message, 'success');
  }

  error(message: string): void {
    this.show(message, 'error', 6000);
  }

  dismiss(id: number): void {
    this.toasts.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }
}
