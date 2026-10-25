import { inject, Injectable } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';
import { SoundService } from '../../core/feedback/sound.service';
import type { SoundName } from '../../core/feedback/sounds';

export type ToastKind = 'success' | 'error' | 'info';

/** Short feedback messages, shown with Material snack bars. */
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
    if (sound) this.sounds.play(sound);
    this.snackBar.open(message, 'Fechar', {
      duration: durationMs,
      panelClass: ['toast', `toast--${kind}`],
      politeness: kind === 'error' ? 'assertive' : 'polite',
    });
  }

  success(message: string, sound: SoundName | null = 'success'): void {
    this.show(message, 'success', 4000, sound);
  }

  error(message: string): void {
    this.show(message, 'error', 6000);
  }
}
