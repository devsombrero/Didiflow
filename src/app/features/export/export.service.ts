import { inject, Injectable } from '@angular/core';
import { UserClock } from '../../core/profile/user-clock';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { type CsvColumn, toCsv } from '../../shared/utils/csv';
import { timeIn, todayIn } from '../../shared/utils/dates';
import { periodFor, type PeriodPreset } from '../dashboard/metrics';
import { KPIS } from '../kpis/kpis';
import { KpisService } from '../kpis/kpis.service';
import { OrganizationStore } from '../organization/organization.service';
import { PRIORITY_LABELS, STATUS_LABELS, type Task } from '../tasks/task.model';
import { workedSeconds } from '../time-tracking/time-calc';

export type ExportFormat = 'csv' | 'json';
export type Dataset = 'tasks' | 'organization' | 'time' | 'kpis' | 'backup';

export interface ExportFile {
  name: string;
  kind: ExportFormat;
  content: string;
}

const PAGE = 1000;

/** Stable ordering for paging tables without an id column. */
const ORDER_COLUMNS: Record<string, string[]> = {
  user_preferences: ['user_id'],
  task_tags: ['task_id', 'tag_id'],
};

/** Tables included in the full JSON backup (all scoped to the user by RLS). */
const BACKUP_TABLES = [
  'profiles',
  'user_preferences',
  'projects',
  'categories',
  'tags',
  'work_contexts',
  'tasks',
  'task_tags',
  'task_status_history',
  'task_activity_logs',
  'time_entries',
  'personal_goals',
  'skill_achievements',
  'task_reminders',
  'daily_priorities',
  'focus_sessions',
] as const;

type TaskExportRow = Task & { task_tags: { tag_id: string }[] };

@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly org = inject(OrganizationStore);
  private readonly kpis = inject(KpisService);
  private readonly clock = inject(UserClock);

  async build(
    dataset: Dataset,
    format: ExportFormat,
    preset: PeriodPreset = '30d',
  ): Promise<ExportFile> {
    await this.org.ensureLoaded();
    const stamp = this.clock.today();
    switch (dataset) {
      case 'tasks':
        return this.tasks(format, stamp);
      case 'organization':
        return this.organization(format, stamp);
      case 'time':
        return this.time(format, stamp);
      case 'kpis':
        return this.kpiSnapshot(format, stamp, preset);
      case 'backup':
        return this.backup(stamp);
    }
  }

  private async tasks(format: ExportFormat, stamp: string): Promise<ExportFile> {
    const rows = await this.all<TaskExportRow>('tasks', '*, task_tags(tag_id)', {
      notDeleted: true,
    });
    const name = (id: string | null) => (id ? (this.org.byId().get(id)?.name ?? '') : '');
    const tags = (row: TaskExportRow) => row.task_tags.map((t) => name(t.tag_id)).filter(Boolean);

    if (format === 'json') {
      const data = rows.map(({ task_tags: _links, ...task }) => ({
        ...task,
        project: name(task.project_id) || null,
        category: name(task.category_id) || null,
        context: name(task.context_id) || null,
        tags: tags({ ...task, task_tags: _links }),
      }));
      return this.json(`didiflow-tarefas-${stamp}.json`, {
        exported_at: new Date().toISOString(),
        tasks: data,
      });
    }

    const columns: CsvColumn<TaskExportRow>[] = [
      { label: 'ID', value: (r) => r.id },
      { label: 'Título', value: (r) => r.title },
      { label: 'Status', value: (r) => STATUS_LABELS[r.status] },
      { label: 'Progresso (%)', value: (r) => r.progress_percentage },
      { label: 'Prioridade', value: (r) => PRIORITY_LABELS[r.priority] },
      { label: 'Projeto', value: (r) => name(r.project_id) },
      { label: 'Categoria', value: (r) => name(r.category_id) },
      { label: 'Contexto', value: (r) => name(r.context_id) },
      { label: 'Tags', value: (r) => tags(r) },
      { label: 'Solicitante', value: (r) => r.requester_name },
      { label: 'Data da solicitação', value: (r) => r.requested_at },
      { label: 'Início', value: (r) => r.start_date },
      { label: 'Entrega prevista', value: (r) => r.due_date },
      { label: 'Concluída em', value: (r) => this.local(r.completed_at) },
      { label: 'Estimativa (min)', value: (r) => r.estimated_minutes },
      { label: 'Jira', value: (r) => r.jira_url },
      { label: 'Slack', value: (r) => r.slack_thread_url },
      { label: 'Descrição', value: (r) => r.description },
      { label: 'Observações', value: (r) => r.notes },
      { label: 'Arquivada em', value: (r) => this.local(r.archived_at) },
      { label: 'Criada em', value: (r) => this.local(r.created_at) },
      { label: 'Atualizada em', value: (r) => this.local(r.updated_at) },
    ];
    return { name: `didiflow-tarefas-${stamp}.csv`, kind: 'csv', content: toCsv(rows, columns) };
  }

  private async organization(format: ExportFormat, stamp: string): Promise<ExportFile> {
    const items = this.org.items();
    if (format === 'json') {
      return this.json(`didiflow-organizacao-${stamp}.json`, {
        exported_at: new Date().toISOString(),
        projects: items.projects,
        categories: items.categories,
        tags: items.tags,
        work_contexts: items.work_contexts,
      });
    }
    const labels = {
      projects: 'Projeto',
      categories: 'Categoria',
      tags: 'Tag',
      work_contexts: 'Contexto',
    };
    const rows = (Object.keys(labels) as (keyof typeof labels)[]).flatMap((kind) =>
      items[kind].map((item) => ({ kind: labels[kind], ...item })),
    );
    return {
      name: `didiflow-organizacao-${stamp}.csv`,
      kind: 'csv',
      content: toCsv(rows, [
        { label: 'Tipo', value: (r) => r.kind },
        { label: 'Nome', value: (r) => r.name },
        { label: 'Cor', value: (r) => r.color },
        { label: 'Descrição', value: (r) => r.description ?? '' },
        { label: 'Arquivado em', value: (r) => this.local(r.archived_at ?? null) },
      ]),
    };
  }

  private async time(format: ExportFormat, stamp: string): Promise<ExportFile> {
    interface Row {
      id: string;
      task_id: string | null;
      description: string | null;
      source: string;
      started_at: string;
      ended_at: string | null;
      paused_at: string | null;
      paused_seconds: number;
      duration_seconds: number | null;
      tasks: { title: string } | null;
    }
    const rows = await this.all<Row>('time_entries', '*, tasks(title)');
    if (format === 'json') {
      return this.json(`didiflow-tempo-${stamp}.json`, {
        exported_at: new Date().toISOString(),
        time_entries: rows,
      });
    }
    const tz = this.clock.timeZone();
    return {
      name: `didiflow-tempo-${stamp}.csv`,
      kind: 'csv',
      content: toCsv(rows, [
        { label: 'Data', value: (r) => todayIn(tz, new Date(r.started_at)) },
        { label: 'Início', value: (r) => timeIn(tz, new Date(r.started_at)) },
        {
          label: 'Fim',
          value: (r) => (r.ended_at ? timeIn(tz, new Date(r.ended_at)) : 'em andamento'),
        },
        { label: 'Minutos', value: (r) => Math.round(workedSeconds(r) / 60) },
        { label: 'Tarefa', value: (r) => r.tasks?.title ?? '' },
        { label: 'Descrição', value: (r) => r.description },
        { label: 'Origem', value: (r) => (r.source === 'timer' ? 'Cronômetro' : 'Manual') },
      ]),
    };
  }

  private async kpiSnapshot(
    format: ExportFormat,
    stamp: string,
    preset: PeriodPreset,
  ): Promise<ExportFile> {
    const data = await this.kpis.data();
    const period = periodFor(preset, this.clock.today());
    const ctx = {
      today: this.clock.today(),
      timeZone: this.clock.timeZone(),
      categoryName: (id: string) => this.org.byId().get(id)?.name,
    };
    const rows = KPIS.map((kpi) => {
      const result = kpi.compute(data, period, ctx);
      return {
        indicator: kpi.name,
        value: result.value,
        display: result.display,
        detail: result.detail ?? '',
        insufficient: result.insufficient ?? '',
        formula: kpi.formula,
        period_from: period.from,
        period_to: period.to,
      };
    });
    if (format === 'json') {
      return this.json(`didiflow-kpis-${stamp}.json`, {
        exported_at: new Date().toISOString(),
        period,
        kpis: rows,
      });
    }
    return {
      name: `didiflow-kpis-${stamp}.csv`,
      kind: 'csv',
      content: toCsv(rows, [
        { label: 'Indicador', value: (r) => r.indicator },
        { label: 'Valor', value: (r) => r.display },
        { label: 'Detalhe', value: (r) => r.detail },
        { label: 'Dados insuficientes', value: (r) => r.insufficient },
        { label: 'Fórmula', value: (r) => r.formula },
        { label: 'Período (início)', value: (r) => r.period_from },
        { label: 'Período (fim)', value: (r) => r.period_to },
      ]),
    };
  }

  private async backup(stamp: string): Promise<ExportFile> {
    const tables: Record<string, unknown[]> = {};
    for (const table of BACKUP_TABLES) {
      tables[table] = await this.all(table, '*');
    }
    return this.json(`didiflow-backup-${stamp}.json`, {
      format: 'didiflow-backup',
      version: 1,
      exported_at: new Date().toISOString(),
      tables,
    });
  }

  private json(name: string, data: unknown): ExportFile {
    return { name, kind: 'json', content: JSON.stringify(data, null, 2) };
  }

  /** Timestamp in the user's zone as "YYYY-MM-DD HH:mm". */
  private local(value: string | null): string {
    if (!value) return '';
    const tz = this.clock.timeZone();
    const date = new Date(value);
    return `${todayIn(tz, date)} ${timeIn(tz, date)}`;
  }

  /** Reads every row of a table in stable pages (RLS scopes rows to the user). */
  private async all<T>(
    table: string,
    columns: string,
    options: { notDeleted?: boolean } = {},
  ): Promise<T[]> {
    interface Query extends PromiseLike<{ data: T[] | null; error: unknown }> {
      order(column: string): Query;
      is(column: string, value: null): Query;
      range(from: number, to: number): Query;
    }
    const db = this.supabase as unknown as {
      from(table: string): { select(columns: string): Query };
    };
    const orderBy = ORDER_COLUMNS[table] ?? ['id'];
    const rows: T[] = [];
    for (let from = 0; ; from += PAGE) {
      let query = db.from(table).select(columns);
      if (options.notDeleted) query = query.is('deleted_at', null);
      for (const column of orderBy) query = query.order(column);
      const { data, error } = await query.range(from, from + PAGE - 1);
      if (error) throw error;
      rows.push(...(data ?? []));
      if (!data || data.length < PAGE) return rows;
    }
  }
}
