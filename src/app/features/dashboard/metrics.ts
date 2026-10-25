import { addDays, todayIn } from '../../shared/utils/dates';
import {
  OPEN_STATUSES,
  type Task,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from '../tasks/task.model';

/** Columns needed to compute dashboard metrics. */
export type MetricTask = Pick<
  Task,
  | 'id'
  | 'status'
  | 'priority'
  | 'progress_percentage'
  | 'start_date'
  | 'due_date'
  | 'completed_at'
  | 'archived_at'
  | 'category_id'
  | 'project_id'
>;

/** Inclusive range of calendar dates (YYYY-MM-DD) in the user's time zone. */
export interface Period {
  from: string;
  to: string;
}

export type PeriodPreset = '7d' | '30d' | '90d' | 'month' | 'year';

export const PERIOD_PRESETS: readonly { value: PeriodPreset; label: string }[] = [
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: '90d', label: 'Últimos 90 dias' },
  { value: 'month', label: 'Este mês' },
  { value: 'year', label: 'Este ano' },
];

export function periodFor(preset: PeriodPreset, today: string): Period {
  switch (preset) {
    case '7d':
      return { from: addDays(today, -6), to: today };
    case '30d':
      return { from: addDays(today, -29), to: today };
    case '90d':
      return { from: addDays(today, -89), to: today };
    case 'month':
      return { from: `${today.slice(0, 8)}01`, to: today };
    case 'year':
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
  }
}

/** The period of equal length immediately before `period`. */
export function previousPeriod(period: Period): Period {
  const length = daysInclusive(period);
  return { from: addDays(period.from, -length), to: addDays(period.from, -1) };
}

function daysInclusive(period: Period): number {
  const from = Date.parse(`${period.from}T00:00:00Z`);
  const to = Date.parse(`${period.to}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000) + 1;
}

const inPeriod = (date: string, period: Period) => date >= period.from && date <= period.to;

export function isOpen(task: Pick<MetricTask, 'status' | 'archived_at'>): boolean {
  return OPEN_STATUSES.includes(task.status) && task.archived_at === null;
}

/** Calendar date of completion in the user's zone, or null when not done. */
export function completionDate(
  task: Pick<MetricTask, 'status' | 'completed_at'>,
  timeZone: string,
): string | null {
  if (task.status !== 'done' || !task.completed_at) return null;
  return todayIn(timeZone, new Date(task.completed_at));
}

export interface MetricFilters {
  statuses: readonly TaskStatus[];
  priorities: readonly TaskPriority[];
  categoryId: string | null;
  projectId: string | null;
}

export const NO_FILTERS: MetricFilters = {
  statuses: [],
  priorities: [],
  categoryId: null,
  projectId: null,
};

export function applyFilters<T extends MetricTask>(
  tasks: readonly T[],
  filters: MetricFilters,
): T[] {
  return tasks.filter(
    (task) =>
      (filters.statuses.length === 0 || filters.statuses.includes(task.status)) &&
      (filters.priorities.length === 0 || filters.priorities.includes(task.priority)) &&
      (filters.categoryId === null || task.category_id === filters.categoryId) &&
      (filters.projectId === null || task.project_id === filters.projectId),
  );
}

export interface DashboardSummary {
  open: number;
  inProgress: number;
  blocked: number;
  overdue: number;
  dueSoon: number;
  completedInPeriod: number;
  /** % of non-cancelled tasks due in the period that are done; null without such tasks. */
  completionRate: number | null;
  /** Average progress of open tasks; null without open tasks. */
  averageProgress: number | null;
  /** % of tasks completed in the period (with a due date) delivered on time; null when none. */
  onTimeRate: number | null;
  onTimeEligible: number;
}

export interface SummaryContext {
  period: Period;
  today: string;
  timeZone: string;
  dueSoonDays: number;
}

const percent = (part: number, total: number) =>
  total === 0 ? null : Math.round((part / total) * 1000) / 10;

export function summarize(tasks: readonly MetricTask[], ctx: SummaryContext): DashboardSummary {
  const open = tasks.filter(isOpen);
  const dueSoonLimit = addDays(ctx.today, ctx.dueSoonDays);

  const completed = tasks.filter((task) => {
    const date = completionDate(task, ctx.timeZone);
    return date !== null && inPeriod(date, ctx.period);
  });
  const eligible = completed.filter((task) => task.due_date !== null);
  const onTime = eligible.filter((task) => completionDate(task, ctx.timeZone)! <= task.due_date!);

  const dueInPeriod = tasks.filter(
    (task) =>
      task.status !== 'cancelled' && task.due_date !== null && inPeriod(task.due_date, ctx.period),
  );

  return {
    open: open.length,
    inProgress: open.filter((task) => task.status === 'in_progress').length,
    blocked: open.filter((task) => task.status === 'blocked').length,
    overdue: open.filter((task) => task.due_date !== null && task.due_date < ctx.today).length,
    dueSoon: open.filter(
      (task) =>
        task.due_date !== null && task.due_date >= ctx.today && task.due_date <= dueSoonLimit,
    ).length,
    completedInPeriod: completed.length,
    completionRate: percent(
      dueInPeriod.filter((task) => task.status === 'done').length,
      dueInPeriod.length,
    ),
    averageProgress:
      open.length === 0
        ? null
        : Math.round(open.reduce((sum, task) => sum + task.progress_percentage, 0) / open.length),
    onTimeRate: percent(onTime.length, eligible.length),
    onTimeEligible: eligible.length,
  };
}

export interface DeliveryBucket {
  label: string;
  start: string;
  onTime: number;
  late: number;
  noDueDate: number;
}

export type Granularity = 'week' | 'month';

/** Monday of the ISO week containing `date`. */
export function weekStart(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, -((day + 6) % 7));
}

/** Deliveries per week or month across the period, split by deadline outcome. */
export function deliveryBuckets(
  tasks: readonly MetricTask[],
  period: Period,
  timeZone: string,
  granularity: Granularity,
): DeliveryBucket[] {
  const keyOf = (date: string) =>
    granularity === 'week' ? weekStart(date) : `${date.slice(0, 7)}-01`;
  const buckets = new Map<string, DeliveryBucket>();

  for (let cursor = keyOf(period.from); cursor <= period.to;) {
    buckets.set(cursor, {
      label: bucketLabel(cursor, granularity),
      start: cursor,
      onTime: 0,
      late: 0,
      noDueDate: 0,
    });
    cursor = granularity === 'week' ? addDays(cursor, 7) : nextMonth(cursor);
  }

  for (const task of tasks) {
    const date = completionDate(task, timeZone);
    if (!date || !inPeriod(date, period)) continue;
    const bucket = buckets.get(keyOf(date));
    if (!bucket) continue;
    if (!task.due_date) bucket.noDueDate++;
    else if (date <= task.due_date) bucket.onTime++;
    else bucket.late++;
  }
  return [...buckets.values()];
}

function nextMonth(date: string): string {
  const [year, month] = date.split('-').map(Number);
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function bucketLabel(start: string, granularity: Granularity): string {
  const [year, month, day] = start.split('-');
  return granularity === 'week'
    ? `${day}/${month}`
    : `${MONTHS[Number(month) - 1]}/${year.slice(2)}`;
}

export function statusDistribution(tasks: readonly MetricTask[]): Record<TaskStatus, number> {
  const counts = Object.fromEntries(TASK_STATUSES.map((status) => [status, 0])) as Record<
    TaskStatus,
    number
  >;
  for (const task of tasks) {
    if (task.archived_at === null) counts[task.status]++;
  }
  return counts;
}

export function openByPriority(tasks: readonly MetricTask[]): Record<TaskPriority, number> {
  const counts = Object.fromEntries(TASK_PRIORITIES.map((p) => [p, 0])) as Record<
    TaskPriority,
    number
  >;
  for (const task of tasks) {
    if (isOpen(task)) counts[task.priority]++;
  }
  return counts;
}
