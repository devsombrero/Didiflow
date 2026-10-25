import { inject, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SoundService } from '../../core/feedback/sound.service';
import type { SoundName } from '../../core/feedback/sounds';
import { ToastCard, type ToastCardData, type ToastCardKind } from './toast-card';

export type ToastKind = 'success' | 'error' | 'info';

export interface RichToast {
  kind?: ToastCardKind;
  title?: string;
  message: string;
  icon?: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
  /** Effect played with the toast; null = silent. */
  sound?: SoundName | null;
}

/** Feedback messages, shown as rich toasts (Material snack bar + own card). */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly snackBar = inject(MatSnackBar);
  private readonly sounds = inject(SoundService);

  /** Shows the message; `sound` overrides the effect of the kind (null = silent). */
  show(
    message: string,
    kind: ToastKind = 'info',
    durationMs = 4000,
    sound: SoundName | null = kind === 'success' ? 'success' : kind === 'error' ? 'error' : null,
  ): void {
    this.notify({ kind, message, durationMs, sound });
  }

  success(message: string, sound: SoundName | null = 'success'): void {
    this.show(message, 'success', 4000, sound);
  }

  error(message: string): void {
    this.show(message, 'error', 6000);
  }

  /** Toast with title, icon and an optional action button. */
  notify(toast: RichToast): void {
    const kind = toast.kind ?? 'info';
    const durationMs = toast.durationMs ?? 5000;
    if (toast.sound) this.sounds.play(toast.sound);
    const data: ToastCardData = {
      kind,
      message: toast.message,
      title: toast.title,
      icon: toast.icon,
      actionLabel: toast.actionLabel,
      durationMs,
    };
    const ref = this.snackBar.openFromComponent(ToastCard, {
      data,
      duration: durationMs || undefined,
      panelClass: ['toast', `toast--${kind}`],
      politeness: kind === 'error' ? 'assertive' : 'polite',
    });
    if (toast.onAction) {
      const onAction = toast.onAction;
      ref.onAction().subscribe(() => onAction());
    }
  }
}
