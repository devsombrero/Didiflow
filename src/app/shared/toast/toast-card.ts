import { Component, inject } from '@angular/core';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MAT_SNACK_BAR_DATA, MatSnackBarRef } from '@angular/material/snack-bar';

export type ToastCardKind = 'success' | 'error' | 'info' | 'notification';

export interface ToastCardData {
  kind: ToastCardKind;
  message: string;
  title?: string;
  icon?: string;
  actionLabel?: string;
  /** Auto-dismiss time, drawn as a shrinking bar; 0 keeps it open. */
  durationMs: number;
}

const ICONS: Record<ToastCardKind, string> = {
  success: 'check_circle',
  error: 'error',
  info: 'info',
  notification: 'notifications_active',
};

/** Toast with icon, optional title and action, and a countdown bar. */
@Component({
  selector: 'app-toast-card',
  imports: [MatButton, MatIconButton, MatIcon],
  template: `
    <div class="toast-card" [attr.data-kind]="data.kind">
      <mat-icon class="toast-card__icon">{{ data.icon ?? icons[data.kind] }}</mat-icon>
      <div class="toast-card__text">
        @if (data.title) {
          <strong class="toast-card__title">{{ data.title }}</strong>
        }
        @if (data.message) {
          <span class="toast-card__message">{{ data.message }}</span>
        }
      </div>
      @if (data.actionLabel) {
        <button
          matButton
          type="button"
          class="toast-card__action"
          (click)="ref.dismissWithAction()"
        >
          {{ data.actionLabel }}
        </button>
      }
      <button matIconButton type="button" aria-label="Fechar" (click)="ref.dismiss()">
        <mat-icon>close</mat-icon>
      </button>
      @if (data.durationMs > 0) {
        <span class="toast-card__timer" [style.animation-duration.ms]="data.durationMs"></span>
      }
    </div>
  `,
})
export class ToastCard {
  protected readonly data = inject<ToastCardData>(MAT_SNACK_BAR_DATA);
  protected readonly ref = inject<MatSnackBarRef<ToastCard>>(MatSnackBarRef);
  protected readonly icons = ICONS;
}
