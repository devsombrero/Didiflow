import { daysBetween } from '../../shared/utils/dates';
import { OPEN_STATUSES, type Task } from './task.model';

export type DeadlineState =
  | { kind: 'none' }
  | { kind: 'overdue'; days: number }
  | { kind: 'due-soon'; days: number }
  | { kind: 'on-track' };

/** Deadline situation of an open task relative to `today` (YYYY-MM-DD in the user's zone). */
export function deadlineState(
  task: Pick<Task, 'status' | 'due_date'>,
  today: string,
  dueSoonDays: number,
): DeadlineState {
  if (!task.due_date || !OPEN_STATUSES.includes(task.status)) return { kind: 'none' };

  const days = daysBetween(today, task.due_date);
  if (days < 0) return { kind: 'overdue', days: -days };
  if (days <= dueSoonDays) return { kind: 'due-soon', days };
  return { kind: 'on-track' };
}

export function deadlineLabel(state: DeadlineState): string {
  switch (state.kind) {
    case 'overdue':
      return state.days === 1 ? 'Atrasada há 1 dia' : `Atrasada há ${state.days} dias`;
    case 'due-soon':
      return state.days === 0
        ? 'Vence hoje'
        : state.days === 1
          ? 'Vence amanhã'
          : `Vence em ${state.days} dias`;
    default:
      return '';
  }
}
