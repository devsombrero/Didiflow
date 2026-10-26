import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { SoundService } from '../../core/feedback/sound.service';
import { DesktopBridge } from '../../core/platform/desktop-bridge';
import { ToastService } from '../../shared/toast/toast.service';
import { relativeTime } from './notification-bell';
import { EmailReportBuilder } from './email-report';
import { AppNotifier, NotificationCenter } from './notification-center';

describe('notifications', () => {
  const user = signal<{ id: string } | null>({ id: 'u1' });

  function setup(
    options: {
      report?: object;
      desktop?: boolean;
      focused?: boolean;
      email?: { send: ReturnType<typeof vi.fn>; status?: ReturnType<typeof vi.fn> };
    } = {},
  ) {
    localStorage.clear();
    user.set({ id: 'u1' });
    const toast = { notify: vi.fn(), error: vi.fn() };
    const sounds = { play: vi.fn(), enabled: true };
    const bridge = {
      isDesktop: options.desktop ?? true,
      notify: vi.fn().mockResolvedValue(true),
      email: options.email ?? null,
    };
    const router = { navigateByUrl: vi.fn() };
    const reports = { build: vi.fn().mockResolvedValue(options.report) };
    vi.spyOn(document, 'hasFocus').mockReturnValue(options.focused ?? true);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { user } },
        { provide: ToastService, useValue: toast },
        { provide: SoundService, useValue: sounds },
        { provide: DesktopBridge, useValue: bridge },
        { provide: Router, useValue: router },
        { provide: EmailReportBuilder, useValue: reports },
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
      reports,
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

  it('forwards notifications by e-mail, except system ones', async () => {
    const email = { send: vi.fn().mockResolvedValue({ status: 'sent' }) };
    const { notifier, toast } = setup({ email });
    await notifier.notify({
      kind: 'reminder',
      title: 'Lembrete',
      body: 'Ligar',
      route: '/tasks/9',
    });
    await notifier.notify({ kind: 'system', title: 'Interno' });
    expect(email.send).toHaveBeenCalledTimes(1);
    expect(email.send).toHaveBeenCalledWith({
      kind: 'reminder',
      title: 'Lembrete',
      body: 'Ligar',
      to: undefined,
    });
    expect(toast.error).not.toHaveBeenCalled();
  });

  it('attaches a task report when e-mail is on for the kind', async () => {
    const report = { tasks: [{ title: 'Gateway' }] };
    const email = {
      send: vi.fn().mockResolvedValue({ status: 'sent' }),
      status: vi.fn().mockResolvedValue({ settings: { enabled: true, kinds: ['reminder'] } }),
    };
    const { notifier, reports } = setup({ email, report });
    await notifier.notify({
      kind: 'reminder',
      title: 'Lembrete',
      email: { taskIds: ['t1'], intro: 'Revisar' },
    });
    await vi.waitFor(() => expect(email.send).toHaveBeenCalled());
    expect(reports.build).toHaveBeenCalledWith(['t1'], 'Revisar');
    expect(email.send.mock.calls[0][0].report).toBe(report);

    // Kind not selected: no report is loaded.
    email.status.mockResolvedValue({ settings: { enabled: true, kinds: ['digest'] } });
    await notifier.notify({ kind: 'reminder', title: 'Outro', email: { taskIds: ['t2'] } });
    await vi.waitFor(() => expect(email.send).toHaveBeenCalledTimes(2));
    expect(reports.build).toHaveBeenCalledTimes(1);
  });

  it('reports an e-mail failure only once per session', async () => {
    const email = { send: vi.fn().mockResolvedValue({ status: 'error', error: 'auth' }) };
    const { notifier, toast } = setup({ email });
    await notifier.notify({ kind: 'digest', title: 'Prazos' });
    await notifier.notify({ kind: 'digest', title: 'Prazos de novo' });
    await vi.waitFor(() => expect(email.send).toHaveBeenCalledTimes(2));
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error.mock.calls[0][0]).toContain('senha de app');
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
