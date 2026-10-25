import { Component, effect, type ElementRef, inject, viewChild } from '@angular/core';
import { ConfirmService } from './confirm.service';

/** Single app-wide confirmation dialog built on the native <dialog> (focus trap, Esc). */
@Component({
  selector: 'app-confirm-dialog',
  template: `
    <dialog
      #dialog
      class="confirm"
      aria-labelledby="confirm-title"
      aria-describedby="confirm-message"
      (close)="confirm.settle(false)"
    >
      @if (confirm.pending(); as pending) {
        <h2 id="confirm-title">{{ pending.title }}</h2>
        <p id="confirm-message">{{ pending.message }}</p>
        <div class="actions confirm__actions">
          <button type="button" class="btn" (click)="confirm.settle(false)">Cancelar</button>
          <button
            type="button"
            class="btn"
            [class.btn--primary]="!pending.danger"
            [class.btn--danger]="pending.danger"
            (click)="confirm.settle(true)"
            autofocus
          >
            {{ pending.confirmLabel ?? 'Confirmar' }}
          </button>
        </div>
      }
    </dialog>
  `,
  styles: `
    .confirm {
      width: min(420px, calc(100% - 32px));
      padding: var(--space-6);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      background: var(--color-surface);
      color: var(--color-text);
    }
    .confirm::backdrop {
      background: rgb(0 0 0 / 40%);
    }
    .confirm__actions {
      justify-content: flex-end;
    }
  `,
})
export class ConfirmDialog {
  protected readonly confirm = inject(ConfirmService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const element = this.dialog().nativeElement;
      if (this.confirm.pending() && !element.open) {
        element.showModal();
      } else if (!this.confirm.pending() && element.open) {
        element.close();
      }
    });
  }
}
