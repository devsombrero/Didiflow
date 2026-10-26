import { inject, Injectable, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import type { SecureStoreApi } from '../../../../electron/ipc/contract';

/** True inside the Android app (Capacitor), false in Electron or a browser. */
export function isNativeMobile(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * Session storage for the Android app: Capacitor Preferences (the app's
 * private SharedPreferences, not reachable by other apps).
 */
export function mobileSessionStore(): SecureStoreApi {
  return {
    get: async (key) => (await Preferences.get({ key })).value,
    set: async (key, value) => Preferences.set({ key, value }),
    remove: async (key) => Preferences.remove({ key }),
  };
}

export interface ScheduledNotification {
  /** Stable key, e.g. "reminder:<id>" or "custom:<id>:<iso>". */
  key: string;
  at: Date;
  title: string;
  body: string;
  route?: string;
}

/** Keys shared by the OS schedule and the in-app scheduler (no double delivery). */
export const reminderKey = (id: string) => `reminder:${id}`;
export const customKey = (id: string, at: Date) => `custom:${id}:${at.toISOString()}`;

const LEDGER_KEY = 'didiflow:native-scheduled';
const MAX_SCHEDULED = 60;

/** 31-bit positive id derived from a key (Android notification ids are ints). */
export function notificationId(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (Math.imul(31, hash) + key.charCodeAt(i)) | 0;
  return Math.abs(hash) % 2_000_000_000 || 1;
}

/**
 * Android notifications. Upcoming reminders and custom notifications are
 * handed to the OS (delivered even with the app closed); a ledger records
 * them so the in-app scheduler does not show them a second time.
 */
@Injectable({ providedIn: 'root' })
export class MobileNotifications {
  private readonly router = inject(Router);
  private readonly zone = inject(NgZone);
  private listening = false;

  readonly available = isNativeMobile();

  async ensurePermission(): Promise<boolean> {
    if (!this.available) return false;
    const current = await LocalNotifications.checkPermissions();
    if (current.display === 'granted') return true;
    return (await LocalNotifications.requestPermissions()).display === 'granted';
  }

  /** Opens the route carried by a tapped notification. */
  listen(): void {
    if (!this.available || this.listening) return;
    this.listening = true;
    void LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
      const route = event.notification.extra?.route;
      if (typeof route === 'string' && /^\/(?!\/)/.test(route)) {
        this.zone.run(() => void this.router.navigateByUrl(route));
      }
    });
  }

  async show(notification: Omit<ScheduledNotification, 'at' | 'key'>): Promise<boolean> {
    if (!(await this.ensurePermission())) return false;
    await LocalNotifications.schedule({
      notifications: [
        {
          id: notificationId(`now:${Date.now()}:${notification.title}`),
          title: notification.title.slice(0, 120),
          body: notification.body.slice(0, 500),
          extra: { route: notification.route ?? null },
        },
      ],
    });
    return true;
  }

  /** Replaces every pending OS notification with `items` (soonest first, capped). */
  async replaceSchedule(items: ScheduledNotification[]): Promise<void> {
    if (!this.available) return;
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) {
      await LocalNotifications.cancel({
        notifications: pending.notifications.map((n) => ({ id: n.id })),
      });
    }
    const now = Date.now();
    const upcoming = items
      .filter((item) => item.at.getTime() > now)
      .sort((a, b) => a.at.getTime() - b.at.getTime())
      .slice(0, MAX_SCHEDULED);
    if (upcoming.length && (await this.ensurePermission())) {
      await LocalNotifications.schedule({
        notifications: upcoming.map((item) => ({
          id: notificationId(item.key),
          title: item.title.slice(0, 120),
          body: item.body.slice(0, 500),
          schedule: { at: item.at, allowWhileIdle: true },
          extra: { route: item.route ?? null },
        })),
      });
    }
    const ledger = this.readLedger();
    for (const item of upcoming) ledger[item.key] = item.at.toISOString();
    this.writeLedger(ledger);
  }

  /** True when the OS was asked to show this notification at a time already passed. */
  deliveredByOs(key: string, now = new Date()): boolean {
    const at = this.readLedger()[key];
    return !!at && new Date(at) <= now;
  }

  async clear(): Promise<void> {
    this.writeLedger({});
    if (!this.available) return;
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) {
      await LocalNotifications.cancel({
        notifications: pending.notifications.map((n) => ({ id: n.id })),
      });
    }
  }

  private readLedger(): Record<string, string> {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(LEDGER_KEY) ?? '{}');
      if (!parsed || typeof parsed !== 'object') return {};
      // Drop entries older than two days.
      const limit = Date.now() - 2 * 24 * 60 * 60 * 1000;
      return Object.fromEntries(
        Object.entries(parsed as Record<string, string>).filter(([, at]) => Date.parse(at) > limit),
      );
    } catch {
      return {};
    }
  }

  private writeLedger(ledger: Record<string, string>): void {
    try {
      localStorage.setItem(LEDGER_KEY, JSON.stringify(ledger));
    } catch {
      // Storage unavailable: at worst an OS notification is shown again in the app.
    }
  }
}
