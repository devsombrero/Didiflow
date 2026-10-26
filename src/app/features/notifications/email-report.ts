import { inject, Injectable } from '@angular/core';
import type { EmailReport, EmailTaskCard } from '../../../../electron/ipc/contract';
import { UserClock } from '../../core/profile/user-clock';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { formatDateValue } from '../../shared/utils/format-date';
import { OrganizationStore } from '../organization/organization.service';
import { deadlineLabel, deadlineState } from '../tasks/task-deadline';
import type { TaskRollup } from '../tasks/task-hierarchy';
import { STATUS_LABELS, TASK_PRIORITIES, type Task } from '../tasks/task.model';
import { formatDuration } from '../time-tracking/time-calc';

/** Tasks detailed in one e-mail; the rest is summarized as "e mais N". */
export const MAX_EMAIL_TASKS = 10;

export type ReportTask = Pick<
  Task,
  | 'id'
  | 'title'
  | 'kind'
  | 'parent_id'
  | 'status'
  | 'priority'
  | 'progress_percentage'
  | 'due_date'
  | 'estimated_minutes'
  | 'requester_name'
  | 'jira_url'
  | 'description'
  | 'project_id'
  | 'category_id'
>;

export interface ReportContext {
  today: string;
  dueSoonDays: number;
  dateFormat: string;
  timeZone: string;
  /** Project/category names by id. */
  names: ReadonlyMap<string, string>;
  tagsByTask: ReadonlyMap<string, string[]>;
  /** Ancestor tasks by id (title, kind and parent). */
  ancestors: ReadonlyMap<string, Pick<Task, 'title' | 'kind' | 'parent_id'>>;
  rollups: ReadonlyMap<string, TaskRollup>;
}

const REPORT_COLUMNS =
  'id,title,kind,parent_id,status,priority,progress_percentage,due_date,estimated_minutes,requester_name,jira_url,description,project_id,category_id';

/** Short plain-text version of a Markdown description. */
export function markdownExcerpt(markdown: string | null, max = 280): string | undefined {
  if (!markdown?.trim()) return undefined;
  const plain = markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*[-*]\s+\[[xX]\]\s+/gm, '☑ ')
    .replace(/^\s*[-*]\s+\[ \]\s+/gm, '☐ ')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(\*|_)(.+?)\1/g, '$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

function hoursOf(minutes: number): string {
  return minutes % 60 === 0 ? `${minutes / 60}h` : formatDuration(minutes * 60);
}

export function hoursLabel(
  rollup: TaskRollup | undefined,
  ownEstimate: number | null,
): string | undefined {
  const seconds = rollup?.tree_seconds ?? 0;
  const estimate = rollup?.tree_estimate_minutes ?? rollup?.own_estimate_minutes ?? ownEstimate;
  if (estimate && estimate > 0) {
    const percent = Math.round((seconds / 60 / estimate) * 100);
    return `${formatDuration(seconds)} de ${hoursOf(estimate)} estimadas (${percent}%)`;
  }
  return seconds > 0 ? `${formatDuration(seconds)} registradas` : undefined;
}

/** E-mail card of one task, with its epic chain, deadline and hours. */
export function toEmailCard(task: ReportTask, ctx: ReportContext): EmailTaskCard {
  const chain: Pick<Task, 'title' | 'kind' | 'parent_id'>[] = [];
  let parentId = task.parent_id;
  while (parentId && chain.length < 3) {
    const parent = ctx.ancestors.get(parentId);
    if (!parent) break;
    chain.unshift(parent);
    parentId = parent.parent_id;
  }
  const direct = chain[chain.length - 1];
  const kind: EmailTaskCard['kind'] =
    task.kind === 'epic'
      ? 'epic'
      : direct && (direct.kind !== 'epic' || chain.length > 1)
        ? 'subtask'
        : 'task';
  const state = deadlineState(task, ctx.today, ctx.dueSoonDays);
  const rollup = ctx.rollups.get(task.id);
  const children =
    rollup && rollup.children_total > 0
      ? `${rollup.children_done} de ${rollup.children_total} concluídas`
      : undefined;
  return {
    title: task.title,
    kind,
    status: STATUS_LABELS[task.status],
    priority: task.priority,
    progress: task.progress_percentage,
    due: task.due_date ? formatDateValue(task.due_date, ctx.dateFormat, ctx.timeZone) : undefined,
    deadline: deadlineLabel(state) || undefined,
    overdue: state.kind === 'overdue',
    project: task.project_id ? ctx.names.get(task.project_id) : undefined,
    category: task.category_id ? ctx.names.get(task.category_id) : undefined,
    hierarchy: chain.length ? chain.map((item) => item.title) : undefined,
    tags: ctx.tagsByTask.get(task.id),
    requester: task.requester_name ?? undefined,
    hours: hoursLabel(rollup, task.estimated_minutes),
    children,
    excerpt: markdownExcerpt(task.description),
    jiraUrl: task.jira_url?.startsWith('https://') ? task.jira_url : undefined,
  };
}

/** Most urgent first: priority, then overdue, then nearest due date. */
export function sortForEmail(tasks: readonly ReportTask[]): ReportTask[] {
  const rank = (task: ReportTask) =>
    TASK_PRIORITIES.length - TASK_PRIORITIES.indexOf(task.priority);
  return [...tasks].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') ||
      a.title.localeCompare(b.title),
  );
}

export function reportTone(cards: readonly EmailTaskCard[]): EmailReport['tone'] {
  if (cards.some((card) => card.overdue)) return 'danger';
  if (cards.some((card) => card.deadline || card.priority === 'urgent')) return 'warning';
  return 'info';
}

/** Loads everything a task notification e-mail shows. */
@Injectable({ providedIn: 'root' })
export class EmailReportBuilder {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly clock = inject(UserClock);
  private readonly org = inject(OrganizationStore);

  async build(taskIds: readonly string[], intro?: string): Promise<EmailReport | undefined> {
    const ids = [...new Set(taskIds)];
    if (ids.length === 0) return undefined;

    const { data, error } = await this.supabase
      .from('tasks')
      .select(REPORT_COLUMNS)
      .in('id', ids.slice(0, 200));
    if (error) throw error;
    const tasks = sortForEmail(data as ReportTask[]).slice(0, MAX_EMAIL_TASKS);
    if (tasks.length === 0) return undefined;
    const shown = tasks.map((task) => task.id);

    const [tagsByTask, ancestors, rollups] = await Promise.all([
      this.tags(shown),
      this.ancestors(tasks),
      this.rollups(shown),
      this.org.ensureLoaded(),
    ]);
    const names = new Map([...this.org.byId()].map(([id, item]) => [id, item.name]));
    const ctx: ReportContext = {
      today: this.clock.today(),
      dueSoonDays: this.clock.dueSoonDays(),
      dateFormat: this.clock.dateFormat(),
      timeZone: this.clock.timeZone(),
      names,
      tagsByTask,
      ancestors,
      rollups,
    };
    const cards = tasks.map((task) => toEmailCard(task, ctx));
    return {
      intro,
      tone: reportTone(cards),
      tasks: cards,
      more: Math.max(0, data.length - cards.length) || undefined,
    };
  }

  private async tags(taskIds: string[]): Promise<Map<string, string[]>> {
    const { data, error } = await this.supabase
      .from('task_tags')
      .select('task_id,tag_id')
      .in('task_id', taskIds);
    if (error) throw error;
    await this.org.ensureLoaded();
    const byId = this.org.byId();
    const result = new Map<string, string[]>();
    for (const { task_id, tag_id } of data) {
      const name = byId.get(tag_id)?.name;
      if (name) result.set(task_id, [...(result.get(task_id) ?? []), name]);
    }
    return result;
  }

  /** Parents and grandparents (epic › task › subtask has at most two levels above). */
  private async ancestors(
    tasks: readonly ReportTask[],
  ): Promise<Map<string, Pick<Task, 'title' | 'kind' | 'parent_id'>>> {
    const result = new Map<string, Pick<Task, 'title' | 'kind' | 'parent_id'>>();
    let pending = [...new Set(tasks.map((task) => task.parent_id).filter((id) => id !== null))];
    for (let level = 0; level < 2 && pending.length > 0; level++) {
      const { data, error } = await this.supabase
        .from('tasks')
        .select('id,title,kind,parent_id')
        .in('id', pending);
      if (error) throw error;
      for (const row of data) result.set(row.id, row);
      pending = data
        .map((row) => row.parent_id)
        .filter((id): id is string => id !== null && !result.has(id));
    }
    return result;
  }

  private async rollups(taskIds: string[]): Promise<Map<string, TaskRollup>> {
    const entries = await Promise.all(
      taskIds.map(async (id) => {
        const { data, error } = await this.supabase.rpc('task_time_rollup', { p_task_id: id });
        return [id, error ? undefined : (data?.[0] as TaskRollup | undefined)] as const;
      }),
    );
    return new Map(entries.filter((entry): entry is [string, TaskRollup] => !!entry[1]));
  }
}
