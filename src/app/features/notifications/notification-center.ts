import { computed, effect, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { SoundService } from '../../core/feedback/sound.service';
import type { SoundName } from '../../core/feedback/sounds';
import { DesktopBridge } from '../../core/platform/desktop-bridge';
import { MobileNotifications } from '../../core/platform/mobile-platform';
import { ToastService } from '../../shared/toast/toast.service';
import type { EmailKind } from '../../../../electron/ipc/contract';
import { emailResultMessage } from './email-messages';

export type NotificationKind = 'reminder' | 'digest' | 'custom' | 'focus' | 'system';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  route: string | null;
  createdAt: string;
  read: boolean;
}

export interface NotifyRequest {
  kind: NotificationKind;
  title: string;
  body?: string;
  route?: string | null;
  /** Effect played on delivery; 'none' = silent. */
  sound?: SoundName | 'none';
}

export const NOTIFICATION_ICONS: Record<NotificationKind, string> = {
  reminder: 'alarm',
  digest: 'event_upcoming',
  custom: 'campaign',
  focus: 'self_improvement',
  system: 'notifications',
};

const MAX_ITEMS = 100;

/**
 * Recent notifications of the signed-in user, kept on this device (local
 * storage) so the bell can list what was delivered while the app was open.
 */
@Injectable({ providedIn: 'root' })
export class NotificationCenter {
  private readonly auth = inject(AuthService);
  readonly items = signal<AppNotification[]>([]);
  readonly unread = computed(() => this.items().filter((item) => !item.read).length);
  constructor() {
    effect(() => {
      const userId = this.auth.user()?.id;
      this.items.set(userId ? this.read(userId) : []);
    });
  }

  add(entry: Omit<AppNotification, 'id' | 'createdAt' | 'read'>): AppNotification {
    const item: AppNotification = {
      ...entry,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      read: false,
    };
    this.update((items) => [item, ...items].slice(0, MAX_ITEMS));
    return item;
  }

  markRead(id: string): void {
    this.update((items) => items.map((item) => (item.id === id ? { ...item, read: true } : item)));
  }

  markAllRead(): void {
    if (this.unread() === 0) return;
    this.update((items) => items.map((item) => ({ ...item, read: true })));
  }

  remove(id: string): void {
    this.update((items) => items.filter((item) => item.id !== id));
  }

  clear(): void {
    this.update(() => []);
  }

  private update(change: (items: AppNotification[]) => AppNotification[]): void {
    this.items.update(change);
    const userId = this.auth.user()?.id;
    if (userId) this.write(userId, this.items());
  }

  private key(userId: string): string {
    return `didiflow:notifications:${userId}`;
  }

  private read(userId: string): AppNotification[] {
    try {
      const parsed: unknown = JSON.parse(localStorage.getItem(this.key(userId)) ?? '[]');
      return Array.isArray(parsed) ? (parsed as AppNotification[]).slice(0, MAX_ITEMS) : [];
    } catch {
      return [];
    }
  }

  private write(userId: string, items: AppNotification[]): void {
    try {
      localStorage.setItem(this.key(userId), JSON.stringify(items));
    } catch {
      // Storage unavailable: the list lives only in memory for this session.
    }
  }
}

/**
 * Delivers a notification: records it in the center, plays its sound and
 * shows an in-app toast while the window is focused, or a native Windows
 * notification otherwise (silent, since the app already played the effect).
 */
@Injectable({ providedIn: 'root' })
export class AppNotifier {
  private readonly center = inject(NotificationCenter);
  private readonly bridge = inject(DesktopBridge);
  private readonly toast = inject(ToastService);
  private readonly sounds = inject(SoundService);
  private readonly router = inject(Router);
  private readonly mobile = inject(MobileNotifications);
  /** E-mail failures are reported once per session, not on every notification. */
  private emailFailureShown = false;

  async notify(request: NotifyRequest): Promise<AppNotification> {
    const route = request.route ?? null;
    const body = request.body ?? '';
    const item = this.center.add({ kind: request.kind, title: request.title, body, route });
    if (request.kind !== 'system') void this.forwardByEmail(request.kind, request.title, body);
    const sound = request.sound ?? 'notify';
    if (sound !== 'none') this.sounds.play(sound);

    const focused = document.visibilityState === 'visible' && document.hasFocus();
    if (!focused && this.mobile.available) {
      // Android, app in the background: system notification.
      if (await this.mobile.show({ title: request.title, body, route: route ?? undefined })) {
        return item;
      }
    }
    if (focused || !this.bridge.isDesktop) {
      this.toast.notify({
        kind: 'notification',
        title: request.title,
        message: body,
        icon: NOTIFICATION_ICONS[request.kind],
        actionLabel: route ? 'Abrir' : undefined,
        onAction: route
          ? () => {
              this.center.markRead(item.id);
              void this.router.navigateByUrl(route);
            }
          : undefined,
        durationMs: 8000,
      });
    } else {
      await this.bridge.notify({
        title: request.title.slice(0, 120),
        body: body.slice(0, 500),
        route: route ?? undefined,
        silent: sound !== 'none' && this.sounds.enabled,
      });
    }
    return item;
  }

  /** Also sends the notification by e-mail when enabled for its kind (desktop only). */
  private async forwardByEmail(kind: EmailKind, title: string, body: string): Promise<void> {
    if (!this.bridge.email) return;
    try {
      const result = await this.bridge.email.send({
        kind,
        title: title.slice(0, 120),
        body: body.slice(0, 2000),
      });
      if (result.status === 'error' && !this.emailFailureShown) {
        this.emailFailureShown = true;
        this.toast.error(`E-mail não enviado: ${emailResultMessage(result)}`);
      }
    } catch {
      // Rejected by the main process validation: the in-app notification is enough.
    }
  }
}
