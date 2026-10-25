import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth/auth.service';
import { DesktopBridge } from '../../core/platform/desktop-bridge';
import { ProfileService, type UserPreferences } from '../../core/profile/profile.service';
import { queryMock } from '../../../testing/query.mock';
import { createSupabaseMock, provideSupabaseMock } from '../../../testing/supabase.mock';
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

  function setup(preferences: UserPreferences | null) {
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

    TestBed.configureTestingModule({
      providers: [
        provideSupabaseMock(supabase),
        { provide: DesktopBridge, useValue: { isDesktop: true, notify } },
        { provide: AuthService, useValue: { user: signal({ id: 'u1' }) } },
        { provide: ProfileService, useValue: { preferences: signal(preferences) } },
      ],
    });
    return { scheduler: TestBed.inject(NotificationScheduler), notify };
  }

  it('sends the overdue digest only once per day', async () => {
    const { scheduler, notify } = setup(prefs);
    await scheduler.tick();
    await scheduler.tick();

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith({
      title: '1 tarefa atrasada',
      body: 'Atrasada',
      route: '/tasks/t1',
    });
  });

  it('stays silent when notifications are disabled', async () => {
    const { scheduler, notify } = setup({ ...prefs, notifications_enabled: false });
    await scheduler.tick();
    expect(notify).not.toHaveBeenCalled();
  });
});
