import type { Tables } from '../../core/supabase/database.types';
import { formatBytes } from '../attachments/attachment-logic';
import { PRIORITY_LABELS, STATUS_LABELS, type TaskPriority, type TaskStatus } from './task.model';

export type ActivityEntry = Tables<'task_activity_logs'>;

export interface ActivityView {
  title: string;
  details: string[];
}

const FIELD_LABELS: Record<string, string> = {
  title: 'Título',
  description: 'Descrição',
  requested_at: 'Data da solicitação',
  requester_name: 'Solicitante',
  has_jira_card: 'Card no Jira',
  jira_url: 'URL do Jira',
  has_slack_thread: 'Thread no Slack',
  slack_thread_url: 'URL do Slack',
  notes: 'Observações',
  start_date: 'Início',
  due_date: 'Entrega prevista',
  priority: 'Prioridade',
  project_id: 'Projeto',
  category_id: 'Categoria',
  estimated_minutes: 'Estimativa',
  context_id: 'Contexto',
  tags: 'Tag',
};

const ACTION_TITLES: Record<string, string> = {
  created: 'Tarefa criada',
  updated: 'Dados alterados',
  status_changed: 'Status alterado',
  progress_changed: 'Progresso atualizado',
  completed: 'Tarefa concluída',
  reopened: 'Tarefa reaberta',
  cancelled: 'Tarefa cancelada',
  archived: 'Tarefa arquivada',
  unarchived: 'Tarefa desarquivada',
  deleted: 'Tarefa excluída',
  restored: 'Tarefa restaurada',
  attachment_added: 'Anexo adicionado',
  link_added: 'Link adicionado',
  link_removed: 'Link removido',
  attachment_removed: 'Anexo removido',
};

interface Change {
  old: unknown;
  new: unknown;
}

function isChange(value: unknown): value is Change {
  return typeof value === 'object' && value !== null && 'old' in value && 'new' in value;
}

/** Human-readable value for a task field, using `formatDate` for date columns. */
export function formatFieldValue(
  field: string,
  value: unknown,
  formatDate: (value: string) => string,
): string {
  if (value === null || value === undefined || value === '') return '—';
  switch (field) {
    case 'priority':
      return PRIORITY_LABELS[value as TaskPriority] ?? String(value);
    case 'status':
      return STATUS_LABELS[value as TaskStatus] ?? String(value);
    case 'has_jira_card':
    case 'has_slack_thread':
      return value ? 'Sim' : 'Não';
    case 'requested_at':
    case 'start_date':
    case 'due_date':
      return formatDate(String(value));
    case 'estimated_minutes': {
      const minutes = Number(value);
      const hours = Math.floor(minutes / 60);
      const rest = minutes % 60;
      return rest ? `${hours}h ${rest}min` : `${hours}h`;
    }
    case 'progress_percentage':
      return `${value}%`;
    case 'project_id':
    case 'category_id':
    case 'context_id':
      return 'alterado';
    default: {
      const text = String(value);
      return text.length > 80 ? `“${text.slice(0, 77)}…”` : `“${text}”`;
    }
  }
}

export function describeActivity(
  entry: Pick<ActivityEntry, 'action' | 'changes'>,
  formatDate: (value: string) => string,
): ActivityView {
  const title = ACTION_TITLES[entry.action] ?? entry.action;
  const changes =
    typeof entry.changes === 'object' && entry.changes !== null && !Array.isArray(entry.changes)
      ? (entry.changes as Record<string, unknown>)
      : {};

  const details = Object.entries(changes)
    .filter((pair): pair is [string, Change] => isChange(pair[1]))
    .filter(([field, change]) => !(field === 'progress_percentage' && change.old === change.new))
    .map(([field, change]) => {
      const label =
        field === 'status'
          ? 'Status'
          : field === 'progress_percentage'
            ? 'Progresso'
            : (FIELD_LABELS[field] ?? field);
      const from = formatFieldValue(field, change.old, formatDate);
      const to = formatFieldValue(field, change.new, formatDate);
      return `${label}: ${from} → ${to}`;
    });

  if (typeof changes['file_name'] === 'string') {
    const size = Number(changes['size_bytes']);
    details.push(
      Number.isFinite(size) && size > 0
        ? `“${changes['file_name']}” (${formatBytes(size)})`
        : `“${changes['file_name']}”`,
    );
  }
  if (typeof changes['url'] === 'string') {
    details.push(`“${String(changes['title'] ?? changes['url'])}”`);
  }
  if (changes['hard_delete'] === true) {
    details.push('Exclusão definitiva');
  }
  return { title, details };
}
