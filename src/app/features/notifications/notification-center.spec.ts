import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { SoundService } from '../../core/feedback/sound.service';
import { DesktopBridge } from '../../core/platform/desktop-bridge';
import { ToastService } from '../../shared/toast/toast.service';
import { relativeTime } from './notification-bell';
import { AppNotifier, NotificationCenter } from './notification-center';

describe('notifications', () => {
  const user = signal<{ id: string } | null>({ id: 'u1' });

  function setup(options: { desktop?: boolean; focused?: boolean } = {}) {
    localStorage.clear();
    user.set({ id: 'u1' });
    const toast = { notify: vi.fn() };
    const sounds = { play: vi.fn(), enabled: true };
    const bridge = { isDesktop: options.desktop ?? true, notify: vi.fn().mockResolvedValue(true) };
    const router = { navigateByUrl: vi.fn() };
    vi.spyOn(document, 'hasFocus').mockReturnValue(options.focused ?? true);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user } },
        { provide: ToastService, useValue: toast },
        { provide: SoundService, useValue: sounds },
        { provide: DesktopBridge, useValue: bridge },
        { provide: Router, useValue: router },
      ],
    });
    TestBed.tick();
    return {
      center: TestBed.inject(NotificationCenter),
      notifier: TestBed.inject(AppNotifier),
      toast,
      sounds,
      bridge,
      router,
    };
  }

  afterEach(() => vi.restoreAllMocks());

  it('keeps recent notifications per user and tracks unread ones', () => {
    const { center } = setup();
    center.add({ kind: 'custom', title: 'A', body: '', route: null });
    center.add({ kind: 'reminder', title: 'B', body: '', route: '/tasks/1' });
    expect(center.items().map((i) => i.title)).toEqual(['B', 'A']);
    expect(center.unread()).toBe(2);

    center.markRead(center.items()[0].id);
    expect(center.unread()).toBe(1);
    center.markAllRead();
    expect(center.unread()).toBe(0);
    expect(JSON.parse(localStorage.getItem('didiflow:notifications:u1')!)).toHaveLength(2);

    user.set({ id: 'u2' });
    TestBed.tick();
    expect(center.items()).toEqual([]);
    center.clear();
  });

  it('shows an in-app toast with an action while the window is focused', async () => {
    const { notifier, toast, sounds, bridge, router, center } = setup({ focused: true });
    await notifier.notify({
      kind: 'reminder',
      title: 'Lembrete',
      body: 'Ligar',
      route: '/tasks/9',
    });
    expect(sounds.play).toHaveBeenCalledWith('notify');
    expect(bridge.notify).not.toHaveBeenCalled();
    const shown = toast.notify.mock.calls[0][0];
    expect(shown).toMatchObject({ kind: 'notification', title: 'Lembrete', actionLabel: 'Abrir' });
    shown.onAction();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/tasks/9');
    expect(center.unread()).toBe(0);
  });

  it('uses a silent native notification when the window is not focused', async () => {
    const { notifier, toast, bridge } = setup({ focused: false });
    await notifier.notify({ kind: 'custom', title: 'Água', sound: 'chime' });
    expect(toast.notify).not.toHaveBeenCalled();
    expect(bridge.notify).toHaveBeenCalledWith({
      title: 'Água',
      body: '',
      route: undefined,
      silent: true,
    });
  });

  it('plays nothing for silent rules', async () => {
    const { notifier, sounds, bridge } = setup({ focused: false });
    await notifier.notify({ kind: 'custom', title: 'Quieto', sound: 'none' });
    expect(sounds.play).not.toHaveBeenCalled();
    expect(bridge.notify).toHaveBeenCalledWith(expect.objectContaining({ silent: false }));
  });

  it('formats relative times', () => {
    const now = new Date('2026-10-26T12:00:00Z');
    expect(relativeTime('2026-10-26T11:59:40Z', now)).toBe('agora');
    expect(relativeTime('2026-10-26T11:45:00Z', now)).toBe('há 15 min');
    expect(relativeTime('2026-10-26T09:00:00Z', now)).toBe('há 3 h');
    expect(relativeTime('2026-10-25T09:00:00Z', now)).toBe('ontem');
    expect(relativeTime('2026-10-20T09:00:00Z', now)).toBe('há 6 dias');
  });
});
