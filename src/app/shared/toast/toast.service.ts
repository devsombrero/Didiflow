import { inject, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

export type ToastKind = 'success' | 'error' | 'info';

/** Short feedback messages, shown with Material snack bars. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly snackBar = inject(MatSnackBar);

  show(message: string, kind: ToastKind = 'info', durationMs = 4000): void {
    this.snackBar.open(message, 'Fechar', {
      duration: durationMs,
      panelClass: ['toast', `toast--${kind}`],
      politeness: kind === 'error' ? 'assertive' : 'polite',
    });
  }

  success(message: string): void {
    this.show(message, 'success');
  }

  error(message: string): void {
    this.show(message, 'error', 6000);
  }
}
