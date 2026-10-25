import type { Enums, Tables, TablesInsert, TablesUpdate } from '../../core/supabase/database.types';

export type Task = Tables<'tasks'>;
export type TaskStatus = Enums<'task_status'>;
export type TaskPriority = Enums<'task_priority'>;
export type TaskInsert = Omit<
  TablesInsert<'tasks'>,
  'id' | 'owner_id' | 'created_at' | 'updated_at'
>;
export type TaskUpdate = Omit<
  TablesUpdate<'tasks'>,
  'id' | 'owner_id' | 'created_at' | 'updated_at'
>;

export const TASK_STATUSES: readonly TaskStatus[] = [
  'not_started',
  'in_progress',
  'blocked',
  'done',
  'cancelled',
];

export const TASK_PRIORITIES: readonly TaskPriority[] = ['low', 'medium', 'high', 'urgent'];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: 'Não iniciado',
  in_progress: 'Em andamento',
  blocked: 'Bloqueado',
  done: 'Concluído',
  cancelled: 'Cancelado',
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  urgent: 'Urgente',
};

/** Statuses counted as open work. */
export const OPEN_STATUSES: readonly TaskStatus[] = ['not_started', 'in_progress', 'blocked'];

export type TaskSortField = 'updated_at' | 'due_date' | 'priority' | 'title' | 'requested_at';

export interface TaskSort {
  field: TaskSortField;
  ascending: boolean;
}

export const SORT_OPTIONS: readonly { label: string; sort: TaskSort }[] = [
  { label: 'Atualizadas recentemente', sort: { field: 'updated_at', ascending: false } },
  { label: 'Vencimento mais próximo', sort: { field: 'due_date', ascending: true } },
  { label: 'Maior prioridade', sort: { field: 'priority', ascending: false } },
  { label: 'Título (A–Z)', sort: { field: 'title', ascending: true } },
  { label: 'Solicitadas recentemente', sort: { field: 'requested_at', ascending: false } },
];

export type ArchiveFilter = 'active' | 'archived';

export interface TaskQuery {
  search: string;
  statuses: readonly TaskStatus[];
  priorities: readonly TaskPriority[];
  archive: ArchiveFilter;
  sort: TaskSort;
  page: number;
  pageSize: number;
}

export const DEFAULT_TASK_QUERY: TaskQuery = {
  search: '',
  statuses: [],
  priorities: [],
  archive: 'active',
  sort: SORT_OPTIONS[0].sort,
  page: 1,
  pageSize: 20,
};

export interface TaskPage {
  items: Task[];
  total: number;
}
