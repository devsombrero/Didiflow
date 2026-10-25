import { addDays } from '../../shared/utils/dates';
import { weekStart } from '../dashboard/metrics';
import { deadlineState } from '../tasks/task-deadline';
import { OPEN_STATUSES } from '../tasks/task.model';
import type { Task } from '../tasks/task.model';

export type CalendarView = 'day' | 'week' | 'month';

export type CalendarTask = Pick<
  Task,
  'id' | 'title' | 'status' | 'priority' | 'start_date' | 'due_date' | 'progress_percentage'
>;

export interface CalendarEvent {
  task: CalendarTask;
  kind: 'start' | 'due';
  overdue: boolean;
  urgent: boolean;
}

export interface CalendarDay {
  date: string;
  inMonth: boolean;
  isToday: boolean;
  events: CalendarEvent[];
}

/** Inclusive date range shown by a view anchored at `anchor`. */
export function visibleRange(view: CalendarView, anchor: string): { from: string; to: string } {
  switch (view) {
    case 'day':
      return { from: anchor, to: anchor };
    case 'week': {
      const from = weekStart(anchor);
      return { from, to: addDays(from, 6) };
    }
    case 'month': {
      const first = `${anchor.slice(0, 8)}01`;
      const from = weekStart(first);
      const last = addDays(nextMonth(first), -1);
      const to = addDays(weekStart(last), 6);
      return { from, to };
    }
  }
}

/** Anchor moved one view-length forward (+1) or backward (-1). */
export function shiftAnchor(view: CalendarView, anchor: string, direction: 1 | -1): string {
  if (view === 'day') return addDays(anchor, direction);
  if (view === 'week') return addDays(anchor, 7 * direction);
  const first = `${anchor.slice(0, 8)}01`;
  return direction === 1 ? nextMonth(first) : previousMonth(first);
}

export function buildDays(
  view: CalendarView,
  anchor: string,
  tasks: readonly CalendarTask[],
  today: string,
  dueSoonDays: number,
): CalendarDay[] {
  const { from, to } = visibleRange(view, anchor);
  const month = anchor.slice(0, 7);
  const byDate = new Map<string, CalendarEvent[]>();

  const push = (date: string, event: CalendarEvent) => {
    if (date < from || date > to) return;
    byDate.set(date, [...(byDate.get(date) ?? []), event]);
  };

  for (const task of tasks) {
    const state = deadlineState(task, today, dueSoonDays);
    const overdue = state.kind === 'overdue';
    const open = OPEN_STATUSES.includes(task.status);
    const urgent = open && (task.priority === 'urgent' || overdue || state.kind === 'due-soon');
    if (task.start_date && task.start_date !== task.due_date) {
      push(task.start_date, {
        task,
        kind: 'start',
        overdue: false,
        urgent: open && task.priority === 'urgent',
      });
    }
    if (task.due_date) push(task.due_date, { task, kind: 'due', overdue, urgent });
  }

  const days: CalendarDay[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const events = (byDate.get(date) ?? []).sort(compareEvents);
    days.push({ date, inMonth: date.slice(0, 7) === month, isToday: date === today, events });
  }
  return days;
}

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 } as const;

function compareEvents(a: CalendarEvent, b: CalendarEvent): number {
  return (
    Number(b.overdue) - Number(a.overdue) ||
    PRIORITY_ORDER[a.task.priority] - PRIORITY_ORDER[b.task.priority] ||
    a.task.title.localeCompare(b.task.title, 'pt-BR')
  );
}

function nextMonth(first: string): string {
  const [year, month] = first.split('-').map(Number);
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

function previousMonth(first: string): string {
  const [year, month] = first.split('-').map(Number);
  return month === 1 ? `${year - 1}-12-01` : `${year}-${String(month - 1).padStart(2, '0')}-01`;
}

const MONTHS = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];
export const WEEKDAYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

export function monthTitle(anchor: string): string {
  const [year, month] = anchor.split('-').map(Number);
  const name = MONTHS[month - 1];
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${year}`;
}
