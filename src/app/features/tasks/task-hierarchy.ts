import { addDays } from '../../shared/utils/dates';
import type { Task } from './task.model';

export type TaskKind = 'epic' | 'task';

export const KIND_LABELS: Record<TaskKind, string> = { epic: 'Épico', task: 'Tarefa' };

/** Minimal task shape for hierarchy decisions. */
export type HierarchyTask = Pick<Task, 'id' | 'title' | 'kind' | 'parent_id' | 'status'>;

/** Hours roll-up returned by the task_time_rollup RPC. */
export interface TaskRollup {
  own_seconds: number;
  tree_seconds: number;
  today_seconds: number;
  own_estimate_minutes: number | null;
  tree_estimate_minutes: number | null;
  children_total: number;
  children_done: number;
}

/** Number of ancestors (0 = top level). */
export function depthOf(task: HierarchyTask, byId: ReadonlyMap<string, HierarchyTask>): number {
  let depth = 0;
  let parentId = task.parent_id;
  while (parentId && depth < 5) {
    depth++;
    parentId = byId.get(parentId)?.parent_id ?? null;
  }
  return depth;
}

/**
 * Tasks that can become the parent of `self` (epic > task > subtask): epics
 * and tasks at most one level deep, never `self` or its descendants, and
 * leaving room for `self`'s own subtasks. Epics cannot have a parent.
 */
export function parentCandidates<T extends HierarchyTask>(
  tasks: readonly T[],
  self: { id: string | null; kind: TaskKind; subtreeHeight: number },
): T[] {
  if (self.kind === 'epic') return [];
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const isDescendant = (task: T): boolean => {
    let parentId = task.parent_id;
    for (let i = 0; parentId && i < 5; i++) {
      if (parentId === self.id) return true;
      parentId = byId.get(parentId)?.parent_id ?? null;
    }
    return false;
  };
  return tasks.filter(
    (task) =>
      task.id !== self.id &&
      task.status !== 'cancelled' &&
      !isDescendant(task) &&
      depthOf(task, byId) + 1 + self.subtreeHeight <= 2,
  );
}

/** "Concluídas 3 de 5". */
export function childrenSummary(
  rollup: Pick<TaskRollup, 'children_total' | 'children_done'>,
): string {
  return `${rollup.children_done} de ${rollup.children_total} concluída${rollup.children_total === 1 ? '' : 's'}`;
}

/** Working days (Mon–Fri) from `from` to `to`, both inclusive. */
export function workingDaysBetween(from: string, to: string): number {
  let count = 0;
  for (let day = from; day <= to; day = addDays(day, 1)) {
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count++;
  }
  return count;
}

export interface DailyPace {
  remainingHours: number;
  workingDays: number;
  /** Hours per working day needed to finish by the due date; null when not computable. */
  hoursPerDay: number | null;
  overdue: boolean;
}

/**
 * Pace needed to finish the remaining estimate by the due date, counting
 * working days from today (or the start date, if later) to the due date.
 */
export function dailyPace(input: {
  estimateMinutes: number | null;
  trackedSeconds: number;
  today: string;
  startDate: string | null;
  dueDate: string | null;
}): DailyPace | null {
  if (!input.estimateMinutes || input.estimateMinutes <= 0) return null;
  const remainingHours = Math.max(0, input.estimateMinutes / 60 - input.trackedSeconds / 3600);
  if (!input.dueDate) return { remainingHours, workingDays: 0, hoursPerDay: null, overdue: false };
  const from = input.startDate && input.startDate > input.today ? input.startDate : input.today;
  const overdue = input.dueDate < input.today;
  const workingDays = overdue ? 0 : workingDaysBetween(from, input.dueDate);
  return {
    remainingHours,
    workingDays,
    hoursPerDay: workingDays > 0 ? remainingHours / workingDays : null,
    overdue,
  };
}

/** "1h 30min", "45min", "0min". */
export function formatHours(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  return m ? `${h}h ${String(m).padStart(2, '0')}min` : `${h}h`;
}

/** "1,5 h" with one decimal. */
export function formatDecimalHours(hours: number): string {
  return `${hours.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
}
