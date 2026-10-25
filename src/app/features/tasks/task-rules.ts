import type { Task, TaskInsert, TaskStatus, TaskUpdate } from './task.model';

/** Cancelling is allowed for any task that is not already cancelled. */
export function canCancel(task: Pick<Task, 'status'>): boolean {
  return task.status !== 'cancelled';
}

/** Only cancelled tasks can be reopened from the cancel flow. */
export function canReopen(task: Pick<Task, 'status'>): boolean {
  return task.status === 'cancelled';
}

/**
 * Cancelling keeps the progress reached (history) but a cancelled task is
 * never "completed", so completed_at is cleared.
 */
export function cancelChanges(): TaskUpdate {
  return { status: 'cancelled', completed_at: null };
}

/**
 * Reopening a cancelled task resumes it according to the progress kept:
 * 0% → not started, otherwise in progress (capped at 99%, since 100% means done).
 */
export function reopenChanges(task: Pick<Task, 'progress_percentage'>): TaskUpdate {
  const progress = task.progress_percentage;
  if (progress <= 0) {
    return { status: 'not_started', progress_percentage: 0, completed_at: null };
  }
  return {
    status: 'in_progress' satisfies TaskStatus,
    progress_percentage: Math.min(progress, 99),
    completed_at: null,
  };
}

/** Copy of a task as a fresh, not-started demand. */
export function duplicateInput(task: Task): TaskInsert {
  return {
    title: `${task.title} (cópia)`.slice(0, 200),
    description: task.description,
    requested_at: task.requested_at,
    requester_name: task.requester_name,
    has_jira_card: task.has_jira_card,
    jira_url: task.jira_url,
    has_slack_thread: task.has_slack_thread,
    slack_thread_url: task.slack_thread_url,
    notes: task.notes,
    start_date: task.start_date,
    due_date: task.due_date,
    priority: task.priority,
    project_id: task.project_id,
    category_id: task.category_id,
    estimated_minutes: task.estimated_minutes,
    status: 'not_started',
    progress_percentage: 0,
  };
}

/** Removes characters that would break a PostgREST or() filter or act as wildcards. */
export function sanitizeSearch(term: string): string {
  return term
    .replace(/[,()*%_\\"]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
}
