import { inject, Injectable } from '@angular/core';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import type { ActivityEntry } from './task-activity';
import type {
  StatusHistoryEntry,
  Task,
  TaskInsert,
  TaskPage,
  TaskPriority,
  TaskQuery,
  TaskStatus,
  TaskUpdate,
  TaskWithTags,
} from './task.model';
import type { HierarchyTask, TaskRollup } from './task-hierarchy';
import { cancelChanges, duplicateInput, reopenChanges, sanitizeSearch } from './task-rules';

const SEARCH_COLUMNS = ['title', 'description', 'requester_name', 'notes'] as const;

/** Task persistence. Ownership is enforced by RLS; deleted rows are hidden here. */
@Injectable({ providedIn: 'root' })
export class TasksService {
  private readonly supabase = inject(SUPABASE_CLIENT);

  async list(query: TaskQuery): Promise<TaskPage> {
    // The tag filter uses a second, inner-joined alias so the row still embeds all its tags.
    const columns = query.tagId
      ? '*, task_tags(tag_id), tag_filter:task_tags!inner(tag_id)'
      : '*, task_tags(tag_id)';
    let request = this.supabase
      .from('tasks')
      .select(columns, { count: 'exact' })
      .is('deleted_at', null);

    request =
      query.archive === 'archived'
        ? request.not('archived_at', 'is', null)
        : request.is('archived_at', null);

    if (query.statuses.length) request = request.in('status', [...query.statuses]);
    if (query.priorities.length) request = request.in('priority', [...query.priorities]);
    if (query.projectId) request = request.eq('project_id', query.projectId);
    if (query.categoryId) request = request.eq('category_id', query.categoryId);
    if (query.contextId) request = request.eq('context_id', query.contextId);
    if (query.requester) request = request.eq('requester_name', query.requester);
    if (query.tagId) request = request.eq('tag_filter.tag_id', query.tagId);

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
    return { items: data as unknown as TaskWithTags[], total: count ?? 0 };
  }

  /**
   * Tasks for the Kanban board: all open work, plus tasks completed (and, if
   * requested, cancelled) since `recentSince`. Archived/deleted are excluded.
   */
  async boardTasks(options: {
    recentSince: string;
    includeCancelled: boolean;
    projectId: string | null;
    priority: TaskPriority | null;
  }): Promise<TaskWithTags[]> {
    const recent = [`and(status.eq.done,completed_at.gte.${options.recentSince})`];
    if (options.includeCancelled) {
      recent.push(`and(status.eq.cancelled,updated_at.gte.${options.recentSince})`);
    }
    let request = this.supabase
      .from('tasks')
      .select('*, task_tags(tag_id)')
      .is('deleted_at', null)
      .is('archived_at', null)
      .or(['status.in.(not_started,in_progress,blocked)', ...recent].join(','));
    if (options.projectId) request = request.eq('project_id', options.projectId);
    if (options.priority) request = request.eq('priority', options.priority);
    const { data, error } = await request.limit(500);
    if (error) throw error;
    return data as unknown as TaskWithTags[];
  }

  /** Open, active tasks for pickers (time entries, focus, planning). */
  async openOptions(): Promise<Pick<Task, 'id' | 'title'>[]> {
    const { data, error } = await this.supabase
      .from('tasks')
      .select('id,title')
      .is('deleted_at', null)
      .is('archived_at', null)
      .in('status', ['not_started', 'in_progress', 'blocked'])
      .order('title')
      .limit(500);
    if (error) throw error;
    return data;
  }

  async get(id: string): Promise<TaskWithTags | null> {
    const { data, error } = await this.supabase
      .from('tasks')
      .select('*, task_tags(tag_id)')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    return data as unknown as TaskWithTags | null;
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

  async duplicate(task: Task): Promise<Task> {
    const copy = await this.create(duplicateInput(task));
    const tagIds = (task as Partial<TaskWithTags>).task_tags?.map((t) => t.tag_id) ?? [];
    if (tagIds.length) await this.setTags(copy.id, tagIds);
    return copy;
  }

  /** Replaces the task tags with `tagIds` (only the difference is written). */
  async setTags(taskId: string, tagIds: readonly string[]): Promise<void> {
    const { data, error } = await this.supabase
      .from('task_tags')
      .select('tag_id')
      .eq('task_id', taskId);
    if (error) throw error;
    const current = new Set(data.map((row) => row.tag_id));
    const wanted = new Set(tagIds);
    const removed = [...current].filter((id) => !wanted.has(id));
    const added = [...wanted].filter((id) => !current.has(id));

    if (removed.length) {
      const result = await this.supabase
        .from('task_tags')
        .delete()
        .eq('task_id', taskId)
        .in('tag_id', removed);
      if (result.error) throw result.error;
    }
    if (added.length) {
      const result = await this.supabase
        .from('task_tags')
        .insert(added.map((tag_id) => ({ task_id: taskId, tag_id })));
      if (result.error) throw result.error;
    }
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

  /** Direct children (tasks of an epic, subtasks of a task), oldest first. */
  async children(parentId: string): Promise<Task[]> {
    const { data, error } = await this.supabase
      .from('tasks')
      .select('*')
      .eq('parent_id', parentId)
      .is('deleted_at', null)
      .order('created_at');
    if (error) throw error;
    return data;
  }

  /** Lightweight list of active tasks for the parent picker and breadcrumbs. */
  async hierarchyOptions(): Promise<HierarchyTask[]> {
    const { data, error } = await this.supabase
      .from('tasks')
      .select('id,title,kind,parent_id,status')
      .is('deleted_at', null)
      .is('archived_at', null)
      .order('title')
      .limit(1000);
    if (error) throw error;
    return data;
  }

  /** Parent chain from the top level down to the direct parent. */
  async ancestors(task: Pick<Task, 'parent_id'>): Promise<Pick<Task, 'id' | 'title' | 'kind'>[]> {
    const chain: Pick<Task, 'id' | 'title' | 'kind'>[] = [];
    let parentId = task.parent_id;
    for (let i = 0; parentId && i < 3; i++) {
      const { data, error } = await this.supabase
        .from('tasks')
        .select('id,title,kind,parent_id')
        .eq('id', parentId)
        .maybeSingle();
      if (error) throw error;
      if (!data) break;
      chain.unshift({ id: data.id, title: data.title, kind: data.kind });
      parentId = data.parent_id;
    }
    return chain;
  }

  createSubtask(
    parent: Pick<Task, 'id' | 'project_id' | 'priority'>,
    title: string,
    description = '',
  ): Promise<Task> {
    return this.create({
      title: title.trim().slice(0, 200),
      description: description.trim() || null,
      parent_id: parent.id,
      project_id: parent.project_id,
      priority: parent.priority,
    });
  }

  /** Tracked hours of the task, of its subtree and of today, plus children counts. */
  async rollup(taskId: string): Promise<TaskRollup | null> {
    const { data, error } = await this.supabase.rpc('task_time_rollup', { p_task_id: taskId });
    if (error) throw error;
    return (data?.[0] as TaskRollup | undefined) ?? null;
  }

  /** Seconds tracked per day (user time zone), optionally for one task and its subtasks. */
  async dailyHours(
    from: string,
    to: string,
    taskId?: string,
  ): Promise<{ day: string; seconds: number }[]> {
    const { data, error } = await this.supabase.rpc('daily_hours', {
      p_from: from,
      p_to: to,
      ...(taskId ? { p_task_id: taskId } : {}),
    });
    if (error) throw error;
    return data ?? [];
  }

  /** Logical delete: the row and its history are kept (see docs/database.md). */
  async remove(id: string): Promise<void> {
    await this.update(id, { deleted_at: new Date().toISOString() });
  }
}
