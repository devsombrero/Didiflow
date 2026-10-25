import type { DesktopNotification } from '../../../../electron/ipc/contract';
import type { UserPreferences } from '../../core/profile/profile.service';
import { addDays } from '../../shared/utils/dates';
import { OPEN_STATUSES, type Task } from '../tasks/task.model';

export type DigestTask = Pick<Task, 'id' | 'title' | 'status' | 'due_date'>;
export type DigestKind = 'overdue' | 'due-soon';

export interface DigestNotification extends DesktopNotification {
  kind: DigestKind;
}

type DigestPreferences = Pick<
  UserPreferences,
  'notifications_enabled' | 'notify_overdue' | 'notify_due_soon' | 'due_soon_days'
>;

function titles(tasks: readonly DigestTask[]): string {
  const names = tasks.slice(0, 3).map((task) => task.title);
  const rest = tasks.length - names.length;
  return rest > 0 ? `${names.join(', ')} e mais ${rest}` : names.join(', ');
}

/** Daily deadline summary notifications, honoring the user's preferences. */
export function buildDigest(
  tasks: readonly DigestTask[],
  today: string,
  prefs: DigestPreferences,
): DigestNotification[] {
  if (!prefs.notifications_enabled) return [];

  const open = tasks.filter((task) => OPEN_STATUSES.includes(task.status) && task.due_date);
  const limit = addDays(today, prefs.due_soon_days);
  const overdue = open.filter((task) => task.due_date! < today);
  const dueSoon = open.filter((task) => task.due_date! >= today && task.due_date! <= limit);
  const result: DigestNotification[] = [];

  if (prefs.notify_overdue && overdue.length) {
    result.push({
      kind: 'overdue',
      title: overdue.length === 1 ? '1 tarefa atrasada' : `${overdue.length} tarefas atrasadas`,
      body: titles(overdue),
      route: overdue.length === 1 ? `/tasks/${overdue[0].id}` : '/tasks',
    });
  }
  if (prefs.notify_due_soon && dueSoon.length) {
    const days = prefs.due_soon_days;
    result.push({
      kind: 'due-soon',
      title:
        dueSoon.length === 1
          ? `1 tarefa vence em até ${days} dia(s)`
          : `${dueSoon.length} tarefas vencem em até ${days} dia(s)`,
      body: titles(dueSoon),
      route: dueSoon.length === 1 ? `/tasks/${dueSoon[0].id}` : '/calendar',
    });
  }
  return result;
}
