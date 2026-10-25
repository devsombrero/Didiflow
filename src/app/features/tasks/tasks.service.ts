import { inject, Injectable } from '@angular/core';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import type { ActivityEntry } from './task-activity';
import type {
  StatusHistoryEntry,
  Task,
  TaskInsert,
  TaskPage,
  TaskQuery,
  TaskStatus,
  TaskUpdate,
} from './task.model';
import { cancelChanges, duplicateInput, reopenChanges, sanitizeSearch } from './task-rules';

const SEARCH_COLUMNS = ['title', 'description', 'requester_name', 'notes'] as const;

/** Task persistence. Ownership is enforced by RLS; deleted rows are hidden here. */
@Injectable({ providedIn: 'root' })
export class TasksService {
  private readonly supabase = inject(SUPABASE_CLIENT);

  async list(query: TaskQuery): Promise<TaskPage> {
    let request = this.supabase
      .from('tasks')
      .select('*', { count: 'exact' })
      .is('deleted_at', null);

    request =
      query.archive === 'archived'
        ? request.not('archived_at', 'is', null)
        : request.is('archived_at', null);

    if (query.statuses.length) request = request.in('status', [...query.statuses]);
    if (query.priorities.length) request = request.in('priority', [...query.priorities]);

    const term = sanitizeSearch(query.search);
    if (term) {
      request = request.or(SEARCH_COLUMNS.map((column) => `${column}.ilike.%${term}%`).join(','));
    }

    const from = (query.page - 1) * query.pageSize;
    const { data, error, count } = await request
      .order(query.sort.field, { ascending: query.sort.ascending, nullsFirst: false })
      .order('updated_at', { ascending: false })
      .range(from, from + query.pageSize - 1);
    if (error) throw error;
    return { items: data, total: count ?? 0 };
  }

  async get(id: string): Promise<Task | null> {
    const { data, error } = await this.supabase
      .from('tasks')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async create(input: TaskInsert): Promise<Task> {
    const { data, error } = await this.supabase.from('tasks').insert(input).select().single();
    if (error) throw error;
    return data;
  }

  async update(id: string, changes: TaskUpdate): Promise<Task> {
    const { data, error } = await this.supabase
      .from('tasks')
      .update(changes)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  duplicate(task: Task): Promise<Task> {
    return this.create(duplicateInput(task));
  }

  cancel(task: Task): Promise<Task> {
    return this.update(task.id, cancelChanges());
  }

  reopen(task: Task): Promise<Task> {
    return this.update(task.id, reopenChanges(task));
  }

  archive(id: string): Promise<Task> {
    return this.update(id, { archived_at: new Date().toISOString() });
  }

  unarchive(id: string): Promise<Task> {
    return this.update(id, { archived_at: null });
  }

  /** The database normalizes progress and completed_at (see the status trigger). */
  setStatus(id: string, status: TaskStatus): Promise<Task> {
    return this.update(id, { status });
  }

  setProgress(id: string, progress: number): Promise<Task> {
    return this.update(id, {
      progress_percentage: Math.round(Math.min(Math.max(progress, 0), 100)),
    });
  }

  async statusHistory(taskId: string): Promise<StatusHistoryEntry[]> {
    const { data, error } = await this.supabase
      .from('task_status_history')
      .select('*')
      .eq('task_id', taskId)
      .order('changed_at', { ascending: false })
      .order('id', { ascending: false });
    if (error) throw error;
    return data;
  }

  async activityLog(taskId: string): Promise<ActivityEntry[]> {
    const { data, error } = await this.supabase
      .from('task_activity_logs')
      .select('*')
      .eq('task_id', taskId)
      .order('id', { ascending: false });
    if (error) throw error;
    return data;
  }

  /** Logical delete: the row and its history are kept (see docs/database.md). */
  async remove(id: string): Promise<void> {
    await this.update(id, { deleted_at: new Date().toISOString() });
  }
}
