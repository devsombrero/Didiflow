import { inject, Injectable } from '@angular/core';
import { BackupService } from './backup.service';

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Creates automatic local backups while the app is open: once at start-up
 * when due, then checks hourly. Failures are logged, never shown as errors,
 * so a full disk or similar does not interrupt the user.
 */
@Injectable({ providedIn: 'root' })
export class BackupScheduler {
  private readonly backups = inject(BackupService);
  private timer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    if (this.timer || !this.backups.available) return;
    void this.check();
    this.timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async check(): Promise<void> {
    try {
      await this.backups.runAutomaticIfDue();
    } catch (error) {
      console.error('Automatic backup failed', error);
    }
  }
}
