import { inject, Injectable } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { DesktopBridge } from '../../core/platform/desktop-bridge';
import { ProfileService } from '../../core/profile/profile.service';
import { UserClock } from '../../core/profile/user-clock';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { addDays } from '../../shared/utils/dates';
import { buildDigest } from './deadline-digest';

const INTERVAL_MS = 60_000;

/**
 * Delivers reminders and the daily deadline digest while the app is open.
 * Nothing runs when the app is closed: there is no background service.
 */
@Injectable({ providedIn: 'root' })
export class NotificationScheduler {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly bridge = inject(DesktopBridge);
  private readonly auth = inject(AuthService);
  private readonly preferences = inject(ProfileService).preferences;
  private readonly clock = inject(UserClock);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  start(): void {
    if (this.timer || !this.bridge.isDesktop) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One scheduling pass; exposed for tests. */
  async tick(): Promise<void> {
    const prefs = this.preferences();
    const userId = this.auth.user()?.id;
    if (this.running || !prefs || !userId || !prefs.notifications_enabled) return;

    this.running = true;
    try {
      await this.deliverReminders();
      await this.deliverDigest(userId, prefs);
    } catch (error) {
      console.error('Notification pass failed', error);
    } finally {
      this.running = false;
    }
  }

  private async deliverReminders(): Promise<void> {
    const { data, error } = await this.supabase
      .from('task_reminders')
      .select('id,note,task_id,tasks(title)')
      .is('sent_at', null)
      .lte('remind_at', new Date().toISOString())
      .limit(20);
    if (error) throw error;

    for (const reminder of data) {
      await this.bridge.notify({
        title: `Lembrete: ${reminder.tasks?.title ?? 'tarefa'}`.slice(0, 120),
        body: reminder.note ?? '',
        route: `/tasks/${reminder.task_id}`,
      });
      await this.supabase
        .from('task_reminders')
        .update({ sent_at: new Date().toISOString() })
        .eq('id', reminder.id);
    }
  }

  private async deliverDigest(
    userId: string,
    prefs: NonNullable<ReturnType<ProfileService['preferences']>>,
  ): Promise<void> {
    const today = this.clock.today();
    const pending = (['overdue', 'due-soon'] as const).filter(
      (kind) => !this.wasSent(userId, today, kind),
    );
    if (pending.length === 0) return;

    const { data, error } = await this.supabase
      .from('tasks')
      .select('id,title,status,due_date')
      .is('deleted_at', null)
      .is('archived_at', null)
      .in('status', ['not_started', 'in_progress', 'blocked'])
      .lte('due_date', addDays(today, prefs.due_soon_days))
      .limit(500);
    if (error) throw error;

    for (const notification of buildDigest(data, today, prefs)) {
      if (!pending.includes(notification.kind)) continue;
      const { kind, ...payload } = notification;
      if (await this.bridge.notify(payload)) this.markSent(userId, today, kind);
    }
  }

  // Delivery bookkeeping is a per-device convenience: at worst a digest is
  // shown again on another device or after clearing local data.
  private key(userId: string, date: string, kind: string): string {
    return `didiflow:digest:${userId}:${date}:${kind}`;
  }

  private wasSent(userId: string, date: string, kind: string): boolean {
    try {
      return localStorage.getItem(this.key(userId, date, kind)) !== null;
    } catch {
      return false;
    }
  }

  private markSent(userId: string, date: string, kind: string): void {
    try {
      localStorage.setItem(this.key(userId, date, kind), new Date().toISOString());
    } catch {
      // Storage unavailable: the digest may repeat, which is harmless.
    }
  }
}
