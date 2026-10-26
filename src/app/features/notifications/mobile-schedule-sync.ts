import { effect, inject, Injectable, untracked } from '@angular/core';
import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { ProfileService } from '../../core/profile/profile.service';
import { UserClock } from '../../core/profile/user-clock';
import {
  customKey,
  MobileNotifications,
  reminderKey,
  type ScheduledNotification,
} from '../../core/platform/mobile-platform';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { CustomNotificationsService } from './custom-notifications.service';
import { occurrencesBetween } from './custom-schedule';
import { NotificationScheduler } from './notification-scheduler';

const HORIZON_MS = 7 * 24 * 60 * 60 * 1000;
const PER_RULE = 10;

/**
 * Android only: hands the next week of reminders and custom notifications to
 * the OS, so they appear even when the app is closed. Re-synced on start, when
 * rules change, and whenever the app goes to the background.
 */
@Injectable({ providedIn: 'root' })
export class MobileScheduleSync {
  private readonly mobile = inject(MobileNotifications);
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly custom = inject(CustomNotificationsService);
  private readonly preferences = inject(ProfileService).preferences;
  private readonly clock = inject(UserClock);
  private readonly scheduler = inject(NotificationScheduler);
  private handles: PluginListenerHandle[] = [];
  private started = false;

  constructor() {
    effect(() => {
      this.custom.version();
      if (this.started) untracked(() => void this.sync());
    });
  }

  async start(): Promise<void> {
    if (!this.mobile.available || this.started) return;
    this.started = true;
    this.mobile.listen();
    this.handles = [
      await App.addListener('pause', () => void this.sync()),
      await App.addListener('resume', () => void this.scheduler.tick()),
    ];
    await this.sync();
  }

  async stop(): Promise<void> {
    this.started = false;
    for (const handle of this.handles) await handle.remove();
    this.handles = [];
    await this.mobile.clear().catch(() => undefined);
  }

  async sync(): Promise<void> {
    if (!this.mobile.available) return;
    const prefs = this.preferences();
    try {
      if (!prefs?.notifications_enabled) {
        await this.mobile.replaceSchedule([]);
        return;
      }
      await this.mobile.replaceSchedule([...(await this.reminders()), ...(await this.customs())]);
    } catch (error) {
      console.error('Mobile notification sync failed', error);
    }
  }

  private async reminders(): Promise<ScheduledNotification[]> {
    const now = new Date();
    const { data, error } = await this.supabase
      .from('task_reminders')
      .select('id,note,remind_at,task_id,tasks(title)')
      .is('sent_at', null)
      .gt('remind_at', now.toISOString())
      .lte('remind_at', new Date(now.getTime() + HORIZON_MS).toISOString())
      .order('remind_at')
      .limit(40);
    if (error) throw error;
    return data.map((reminder) => ({
      key: reminderKey(reminder.id),
      at: new Date(reminder.remind_at),
      title: `Lembrete: ${reminder.tasks?.title ?? 'tarefa'}`,
      body: reminder.note ?? '',
      route: `/tasks/${reminder.task_id}`,
    }));
  }

  private async customs(): Promise<ScheduledNotification[]> {
    const now = new Date();
    const until = new Date(now.getTime() + HORIZON_MS);
    const timeZone = this.clock.timeZone();
    const rules = await this.custom.active();
    return rules.flatMap((rule) =>
      occurrencesBetween(rule, now, until, timeZone)
        .slice(0, PER_RULE)
        .map((at) => ({
          key: customKey(rule.id, at),
          at,
          title: rule.title,
          body: rule.message ?? '',
          route: '/notifications',
        })),
    );
  }
}
