import type { Task } from './task.model';
import {
  canCancel,
  canChangeStatus,
  canComplete,
  canEditProgress,
  canReopen,
  cancelChanges,
  duplicateInput,
  reopenChanges,
  sanitizeSearch,
} from './task-rules';

const task = (overrides: Partial<Task> = {}): Task =>
  ({
    id: 't1',
    owner_id: 'u1',
    title: 'Relatório mensal',
    description: 'Consolidar dados',
    requested_at: '2026-10-01',
    requester_name: 'Ana',
    has_jira_card: true,
    jira_url: 'https://jira.example/DF-1',
    has_slack_thread: false,
    slack_thread_url: null,
    notes: null,
    start_date: '2026-10-02',
    due_date: '2026-10-10',
    completed_at: null,
    status: 'in_progress',
    progress_percentage: 40,
    priority: 'high',
    project_id: null,
    category_id: null,
    estimated_minutes: 120,
    archived_at: null,
    deleted_at: null,
    created_at: '2026-10-01T10:00:00Z',
    updated_at: '2026-10-02T10:00:00Z',
    ...overrides,
  }) as Task;

describe('task rules', () => {
  it('allows cancelling anything but cancelled tasks', () => {
    expect(canCancel(task({ status: 'done' }))).toBe(true);
    expect(canCancel(task({ status: 'cancelled' }))).toBe(false);
  });

  it('allows reopening only cancelled tasks', () => {
    expect(canReopen(task({ status: 'cancelled' }))).toBe(true);
    expect(canReopen(task({ status: 'done' }))).toBe(false);
  });

  it('clears completed_at on cancel and keeps progress', () => {
    expect(cancelChanges()).toEqual({ status: 'cancelled', completed_at: null });
  });

  it('reopens according to the progress kept', () => {
    expect(reopenChanges(task({ progress_percentage: 0 }))).toMatchObject({
      status: 'not_started',
      progress_percentage: 0,
    });
    expect(reopenChanges(task({ progress_percentage: 40 }))).toMatchObject({
      status: 'in_progress',
      progress_percentage: 40,
    });
    expect(reopenChanges(task({ progress_percentage: 100 }))).toMatchObject({
      status: 'in_progress',
      progress_percentage: 99,
    });
  });

  it('duplicates as a fresh not-started task', () => {
    const copy = duplicateInput(task({ status: 'done', progress_percentage: 100 }));
    expect(copy).toMatchObject({
      title: 'Relatório mensal (cópia)',
      status: 'not_started',
      progress_percentage: 0,
      jira_url: 'https://jira.example/DF-1',
    });
    expect(copy).not.toHaveProperty('id');
    expect(copy).not.toHaveProperty('completed_at');
    expect(duplicateInput(task({ title: 'x'.repeat(200) })).title).toHaveLength(200);
  });

  it('sanitizes search terms for PostgREST filters', () => {
    expect(sanitizeSearch('  relatório, (urgente)  ')).toBe('relatório urgente');
    expect(sanitizeSearch('100%_done*')).toBe('100 done');
    expect(sanitizeSearch('a'.repeat(150))).toHaveLength(100);
  });
});

describe('progress rules', () => {
  it('allows manual progress only when not started or in progress', () => {
    expect(canEditProgress(task({ status: 'not_started' }))).toBe(true);
    expect(canEditProgress(task({ status: 'in_progress' }))).toBe(true);
    expect(canEditProgress(task({ status: 'blocked' }))).toBe(false);
    expect(canEditProgress(task({ status: 'done' }))).toBe(false);
  });

  it('locks direct status changes on cancelled tasks', () => {
    expect(canChangeStatus(task({ status: 'cancelled' }))).toBe(false);
    expect(canChangeStatus(task({ status: 'done' }))).toBe(true);
  });

  it('completes only open tasks', () => {
    expect(canComplete(task({ status: 'blocked' }))).toBe(true);
    expect(canComplete(task({ status: 'done' }))).toBe(false);
    expect(canComplete(task({ status: 'cancelled' }))).toBe(false);
  });
});
