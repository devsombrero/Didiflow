import { inject, Injectable } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { DesktopBridge } from '../../core/platform/desktop-bridge';
import { customKey, MobileNotifications, reminderKey } from '../../core/platform/mobile-platform';
import { ProfileService } from '../../core/profile/profile.service';
import { UserClock } from '../../core/profile/user-clock';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { addDays } from '../../shared/utils/dates';
import { checkDue } from './custom-schedule';
import {
  type CustomNotification,
  CustomNotificationsService,
} from './custom-notifications.service';
import { buildDigest } from './deadline-digest';
import { AppNotifier } from './notification-center';

const INTERVAL_MS = 30_000;
/** Custom rules are re-read at most this often (and after any change). */
const RULES_TTL_MS = 5 * 60_000;

/**
 * Delivers reminders, the daily deadline digest and custom notifications
 * while the app is open.
 * Nothing runs when the app is closed: there is no background service.
 */
@Injectable({ providedIn: 'root' })
export class NotificationScheduler {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly bridge = inject(DesktopBridge);
  private readonly auth = inject(AuthService);
  private readonly preferences = inject(ProfileService).preferences;
  private readonly clock = inject(UserClock);
  private readonly notifier = inject(AppNotifier);
  private readonly mobile = inject(MobileNotifications);
  private readonly custom = inject(CustomNotificationsService);
  private rules: { version: number; loadedAt: number; items: CustomNotification[] } | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  start(): void {
    if (this.timer || !(this.bridge.isDesktop || this.mobile.available)) return;
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
      await this.deliverCustom();
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
      if (this.mobile.deliveredByOs(reminderKey(reminder.id))) {
        // Already shown by Android while the app was closed.
        await this.supabase
          .from('task_reminders')
          .update({ sent_at: new Date().toISOString() })
          .eq('id', reminder.id);
        continue;
      }
      await this.notifier.notify({
        kind: 'reminder',
        title: `Lembrete: ${reminder.tasks?.title ?? 'tarefa'}`.slice(0, 120),
        body: reminder.note ?? '',
        route: `/tasks/${reminder.task_id}`,
        email: {
          taskIds: [reminder.task_id],
          intro: reminder.note?.trim() || 'Lembrete agendado para esta tarefa.',
        },
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
      const { kind, taskIds, ...payload } = notification;
      await this.notifier.notify({
        kind: 'digest',
        ...payload,
        email: {
          taskIds,
          intro:
            kind === 'overdue'
              ? 'Estas tarefas já passaram da data de entrega prevista. Priorize ou renegocie os prazos.'
              : `Estas tarefas vencem nos próximos ${prefs.due_soon_days} dia(s).`,
        },
      });
      this.markSent(userId, today, kind);
    }
  }

  private async deliverCustom(): Promise<void> {
    const now = new Date();
    const version = this.custom.version();
    if (
      !this.rules ||
      this.rules.version !== version ||
      now.getTime() - this.rules.loadedAt > RULES_TTL_MS
    ) {
      this.rules = { version, loadedAt: now.getTime(), items: await this.custom.active() };
    }
    const timeZone = this.clock.timeZone();
    for (const rule of this.rules.items) {
      const due = checkDue(rule, now, timeZone);
      if (!due.advanceTo) continue;
      // Record first: a failed delivery must not repeat every pass.
      await this.custom.markFired(rule, due.advanceTo);
      rule.last_fired_at = due.advanceTo.toISOString();
      if (rule.schedule === 'once') rule.active = false;
      if (due.fire && !this.mobile.deliveredByOs(customKey(rule.id, due.fire))) {
        await this.notifier.notify({
          kind: 'custom',
          title: rule.title,
          body: rule.message ?? '',
          sound: rule.sound as never,
          route: '/notifications',
        });
      }
    }
    this.rules.items = this.rules.items.filter((rule) => rule.active);
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
