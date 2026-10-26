import { formatDateValue } from '../../shared/utils/format-date';
import { deadlineLabel, deadlineState } from '../tasks/task-deadline';
import { PRIORITY_LABELS, STATUS_LABELS, type Task } from '../tasks/task.model';
import { formatDuration } from '../time-tracking/time-calc';

/** Open tasks summarized for DidiBot (no descriptions or notes). */
export const MAX_CONTEXT_TASKS = 60;

export type ContextTask = Pick<
  Task,
  | 'id'
  | 'title'
  | 'kind'
  | 'parent_id'
  | 'status'
  | 'priority'
  | 'progress_percentage'
  | 'due_date'
  | 'project_id'
>;

export interface ContextInput {
  today: string;
  dueSoonDays: number;
  dateFormat: string;
  timeZone: string;
  displayName: string;
  tasks: readonly ContextTask[];
  /** Titles of ancestors that are not in `tasks`. */
  parents: ReadonlyMap<string, Pick<Task, 'title' | 'parent_id'>>;
  projects: ReadonlyMap<string, string>;
  todayPriorities: readonly string[];
  secondsToday: number;
  dailyTargetHours: number | null;
  completedLast30Days: number;
  /** Names DidiBot should reuse when it proposes projects and tasks. */
  organization?: OrganizationNames;
}

export interface OrganizationNames {
  projects: readonly string[];
  categories: readonly string[];
  tags: readonly string[];
}

/** Existing projects, categories and tags, one line each. */
export function organizationLines(names: OrganizationNames): string[] {
  const line = (label: string, items: readonly string[]) =>
    `${label}: ${items.length ? items.slice(0, 60).join('; ') : 'nenhum'}`;
  return [
    line('Projetos existentes', names.projects),
    line('Categorias existentes', names.categories),
    line('Tags existentes', names.tags),
  ];
}

const PRIORITY_RANK: Record<Task['priority'], number> = { urgent: 0, high: 1, medium: 2, low: 3 };

/** Plain-text context sent with each DidiBot question. */
export function buildContext(input: ContextInput): string {
  const byId = new Map<string, Pick<Task, 'title' | 'parent_id'>>([
    ...input.parents,
    ...input.tasks.map((task) => [task.id, task] as const),
  ]);
  const chain = (task: ContextTask): string[] => {
    const titles: string[] = [];
    let parentId = task.parent_id;
    while (parentId && titles.length < 3) {
      const parent = byId.get(parentId);
      if (!parent) break;
      titles.unshift(parent.title);
      parentId = parent.parent_id;
    }
    return titles;
  };
  const sorted = [...input.tasks].sort(
    (a, b) =>
      (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31') ||
      PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority],
  );
  const shown = sorted.slice(0, MAX_CONTEXT_TASKS);
  const states = sorted.map((task) => deadlineState(task, input.today, input.dueSoonDays).kind);
  const overdue = states.filter((kind) => kind === 'overdue').length;
  const dueSoon = states.filter((kind) => kind === 'due-soon').length;
  const lines = shown.map((task) => {
    const state = deadlineState(task, input.today, input.dueSoonDays);
    const parts = [
      `${STATUS_LABELS[task.status]}, ${task.progress_percentage}%`,
      task.due_date
        ? `entrega ${formatDateValue(task.due_date, input.dateFormat, input.timeZone)}${
            deadlineLabel(state) ? ` (${deadlineLabel(state)})` : ''
          }`
        : 'sem data de entrega',
    ];
    const project = task.project_id ? input.projects.get(task.project_id) : undefined;
    if (project) parts.push(`projeto ${project}`);
    const ancestors = chain(task);
    if (ancestors.length) parts.push(`épico/tarefa-mãe: ${ancestors.join(' › ')}`);
    const kind = task.kind === 'epic' ? 'Épico: ' : '';
    return `- [${PRIORITY_LABELS[task.priority]}] ${kind}${task.title} — ${parts.join('; ')}`;
  });

  const target = input.dailyTargetHours ? ` (meta ${input.dailyTargetHours} h)` : '';
  return [
    `Usuário: ${input.displayName || 'sem nome'}`,
    `Hoje: ${formatDateValue(input.today, input.dateFormat, input.timeZone)} (${input.today})`,
    `Horas registradas hoje: ${formatDuration(input.secondsToday)}${target}`,
    `Tarefas abertas: ${input.tasks.length} (${overdue} atrasadas, ${dueSoon} vencendo em até ${input.dueSoonDays} dia(s))`,
    `Concluídas nos últimos 30 dias: ${input.completedLast30Days}`,
    input.todayPriorities.length
      ? `Prioridades de hoje definidas pelo usuário: ${input.todayPriorities.join('; ')}`
      : 'Prioridades de hoje: nenhuma definida',
    ...(input.organization ? organizationLines(input.organization) : []),
    '',
    'Tarefas abertas (mais próximas do prazo primeiro):',
    ...(lines.length ? lines : ['- nenhuma']),
    input.tasks.length > shown.length ? `- … e mais ${input.tasks.length - shown.length}` : '',
  ]
    .filter((line, index, all) => line !== '' || all[index - 1] !== '')
    .join('\n')
    .trim();
}
