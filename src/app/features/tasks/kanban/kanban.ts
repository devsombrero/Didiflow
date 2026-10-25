import type { TaskStatus, TaskWithTags } from '../task.model';

export const BOARD_COLUMNS: readonly TaskStatus[] = [
  'not_started',
  'in_progress',
  'blocked',
  'done',
];

export type BoardMove =
  | { kind: 'none' }
  /** Plain status change; the database normalizes progress and completion. */
  | { kind: 'set-status'; status: TaskStatus }
  /** Cancelling needs the confirmed cancel flow. */
  | { kind: 'cancel' }
  /** Leaving "cancelled": reopen first, then apply the target status if different. */
  | { kind: 'reopen'; status: TaskStatus };

/** What dropping `task` on the `target` column means. */
export function boardMove(task: Pick<TaskWithTags, 'status'>, target: TaskStatus): BoardMove {
  if (task.status === target) return { kind: 'none' };
  if (target === 'cancelled') return { kind: 'cancel' };
  if (task.status === 'cancelled') return { kind: 'reopen', status: target };
  return { kind: 'set-status', status: target };
}

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 } as const;

/** Cards per column: urgent first, then nearest due date, then title. */
export function groupByStatus(
  tasks: readonly TaskWithTags[],
  columns: readonly TaskStatus[],
): Record<TaskStatus, TaskWithTags[]> {
  const groups = Object.fromEntries(columns.map((c) => [c, [] as TaskWithTags[]])) as Record<
    TaskStatus,
    TaskWithTags[]
  >;
  for (const task of tasks) groups[task.status]?.push(task);
  for (const column of columns) {
    groups[column].sort(
      (a, b) =>
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
        (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31') ||
        a.title.localeCompare(b.title, 'pt-BR'),
    );
  }
  return groups;
}
