import { daysBetween } from '../../shared/utils/dates';
import { OPEN_STATUSES, type Task } from '../tasks/task.model';

export type SuggestionTask = Pick<
  Task,
  'id' | 'title' | 'status' | 'priority' | 'due_date' | 'progress_percentage'
>;

export interface Suggestion {
  task: SuggestionTask;
  reason: string;
  score: number;
}

/**
 * Candidates for today's priority list: overdue, due today/soon, and
 * high-priority work in progress. Higher score first.
 */
export function suggestPriorities(
  tasks: readonly SuggestionTask[],
  today: string,
  dueSoonDays: number,
  exclude: ReadonlySet<string>,
  limit = 8,
): Suggestion[] {
  const result: Suggestion[] = [];
  for (const task of tasks) {
    if (exclude.has(task.id) || !OPEN_STATUSES.includes(task.status)) continue;
    const days = task.due_date ? daysBetween(today, task.due_date) : null;
    const urgentPriority = task.priority === 'urgent' || task.priority === 'high';

    let reason: string | null = null;
    let score = 0;
    if (days !== null && days < 0) {
      reason = days === -1 ? 'Atrasada há 1 dia' : `Atrasada há ${-days} dias`;
      score = 100 - days;
    } else if (days === 0) {
      reason = 'Vence hoje';
      score = 90;
    } else if (days !== null && days <= dueSoonDays) {
      reason = days === 1 ? 'Vence amanhã' : `Vence em ${days} dias`;
      score = 80 - days;
    } else if (task.status === 'in_progress' && urgentPriority) {
      reason = 'Em andamento · prioridade alta';
      score = 60;
    } else if (task.priority === 'urgent') {
      reason = 'Prioridade urgente';
      score = 55;
    }
    if (!reason) continue;
    if (task.priority === 'urgent') score += 5;
    if (task.status === 'blocked') score -= 20;
    result.push({ task, reason, score });
  }
  return result
    .sort((a, b) => b.score - a.score || a.task.title.localeCompare(b.task.title))
    .slice(0, limit);
}

export interface FocusTiming {
  started_at: string;
  planned_minutes: number;
}

/** Seconds left in a focus session (never negative). */
export function remainingSeconds(session: FocusTiming, now: number = Date.now()): number {
  const end = Date.parse(session.started_at) + session.planned_minutes * 60_000;
  return Math.max(0, Math.ceil((end - now) / 1000));
}

/** Moves the item at `index` up (-1) or down (+1); returns a new array. */
export function move<T>(items: readonly T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= items.length) return [...items];
  const copy = [...items];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}
