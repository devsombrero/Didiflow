import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth/auth.service';
import { DesktopBridge } from '../../core/platform/desktop-bridge';
import { ProfileService, type UserPreferences } from '../../core/profile/profile.service';
import { queryMock } from '../../../testing/query.mock';
import { createSupabaseMock, provideSupabaseMock } from '../../../testing/supabase.mock';
import {
  type CustomNotification,
  CustomNotificationsService,
} from './custom-notifications.service';
import { AppNotifier } from './notification-center';
import { NotificationScheduler } from './notification-scheduler';

describe('NotificationScheduler', () => {
  const prefs = {
    notifications_enabled: true,
    notify_overdue: true,
    notify_due_soon: false,
    due_soon_days: 2,
    timezone: 'UTC',
    date_format: 'dd/MM/yyyy',
  } as UserPreferences;

  function setup(preferences: UserPreferences | null, rules: Partial<CustomNotification>[] = []) {
    localStorage.clear();
    const supabase = createSupabaseMock();
    const reminders = queryMock({ data: [], error: null });
    const tasks = queryMock({
      data: [{ id: 't1', title: 'Atrasada', status: 'in_progress', due_date: '2000-01-01' }],
      error: null,
    });
    supabase.from.mockImplementation((table: string) =>
      table === 'task_reminders' ? reminders : tasks,
    );
    const notify = vi.fn().mockResolvedValue(true);
    const custom = {
      version: signal(0),
      active: vi.fn().mockResolvedValue(rules),
      markFired: vi.fn().mockResolvedValue(undefined),
    };

    TestBed.configureTestingModule({
      providers: [
        provideSupabaseMock(supabase),
        { provide: DesktopBridge, useValue: { isDesktop: true } },
        { provide: AppNotifier, useValue: { notify } },
        { provide: CustomNotificationsService, useValue: custom },
        { provide: AuthService, useValue: { user: signal({ id: 'u1' }) } },
        { provide: ProfileService, useValue: { preferences: signal(preferences) } },
      ],
    });
    return { scheduler: TestBed.inject(NotificationScheduler), notify, custom };
  }

  it('sends the overdue digest only once per day', async () => {
    const { scheduler, notify } = setup(prefs);
    await scheduler.tick();
    await scheduler.tick();

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith({
      kind: 'digest',
      title: '1 tarefa atrasada',
      body: 'Atrasada',
      route: '/tasks/t1',
      email: { taskIds: ['t1'], intro: expect.stringContaining('passaram da data de entrega') },
    });
  });

  it('stays silent when notifications are disabled', async () => {
    const { scheduler, notify } = setup({ ...prefs, notifications_enabled: false });
    await scheduler.tick();
    expect(notify).not.toHaveBeenCalled();
  });

  it('delivers a due custom notification once and records it', async () => {
    const recent = new Date(Date.now() - 60_000).toISOString();
    const rule = {
      id: 'r1',
      title: 'Beber água',
      message: 'Pausa',
      schedule: 'once',
      run_at: recent,
      sound: 'chime',
      active: true,
      created_at: recent,
      last_fired_at: null,
    };
    const { scheduler, notify, custom } = setup({ ...prefs, notify_overdue: false }, [rule]);
    await scheduler.tick();
    await scheduler.tick();

    expect(custom.markFired).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'custom',
        title: 'Beber água',
        body: 'Pausa',
        sound: 'chime',
      }),
    );
  });
});
