import { Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

@Component({
  selector: 'app-toast-container',
  template: `
    <div class="toasts" aria-live="polite">
      @for (toast of toastService.toasts(); track toast.id) {
        <div
          [class]="'toast toast--' + toast.kind"
          [attr.role]="toast.kind === 'error' ? 'alert' : 'status'"
        >
          <span>{{ toast.message }}</span>
          <button
            type="button"
            class="toast__close"
            aria-label="Fechar"
            (click)="toastService.dismiss(toast.id)"
          >
            ×
          </button>
        </div>
      }
    </div>
  `,
  styles: `
    .toasts {
      position: fixed;
      right: var(--space-4);
      bottom: var(--space-4);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      z-index: 1000;
      max-width: 360px;
    }
    .toast {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      border-radius: var(--radius-md);
      border: 1px solid var(--color-border);
      border-left: 4px solid var(--color-primary);
      background: var(--color-surface);
      box-shadow: 0 4px 16px rgb(0 0 0 / 12%);
    }
    .toast--success {
      border-left-color: var(--color-success);
    }
    .toast--error {
      border-left-color: var(--color-danger);
    }
    .toast span {
      flex: 1;
    }
    .toast__close {
      border: 0;
      background: none;
      color: var(--color-text-muted);
      cursor: pointer;
      font-size: 18px;
      line-height: 1;
    }
  `,
})
export class ToastContainer {
  protected readonly toastService = inject(ToastService);
}
