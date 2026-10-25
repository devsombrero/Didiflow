import type { Enums } from '../../core/supabase/database.types';
import { daysBetween, todayIn } from '../../shared/utils/dates';
import {
  completionDate,
  isOpen,
  type MetricTask,
  type Period,
  previousPeriod,
} from '../dashboard/metrics';
import { formatDuration, type TimeEntryTiming, workedSeconds } from '../time-tracking/time-calc';

export type KpiMetric = Enums<'kpi_metric'>;

export interface HistoryRow {
  task_id: string;
  from_status: string | null;
  to_status: string;
  changed_at: string;
}

export type KpiTimeEntry = TimeEntryTiming & { task_id: string | null; category_id: string | null };

export interface AchievementRow {
  achieved_on: string;
  kind: string;
}

export interface KpiData {
  tasks: readonly MetricTask[];
  history: readonly HistoryRow[];
  time: readonly KpiTimeEntry[];
  achievements: readonly AchievementRow[];
}

export interface KpiContext {
  today: string;
  timeZone: string;
  /** Resolves a category id to its name (effort distribution). */
  categoryName: (id: string) => string | undefined;
}

export interface KpiBreakdown {
  label: string;
  value: number;
  display: string;
}

export interface KpiResult {
  value: number | null;
  display: string;
  detail?: string;
  breakdown?: KpiBreakdown[];
  /** Why the indicator cannot be calculated yet. */
  insufficient?: string;
}

export type KpiId =
  | 'deliveries'
  | 'on_time_rate'
  | 'late_rate'
  | 'lead_time'
  | 'cycle_time'
  | 'predictability'
  | 'rework_rate'
  | 'effort_distribution'
  | 'productivity_trend'
  | 'learning';

export interface KpiDefinition {
  id: KpiId;
  name: string;
  description: string;
  formula: string;
  better: 'higher' | 'lower' | 'neutral';
  /** Goal metric measured by this indicator, if any. */
  metric?: KpiMetric;
  compute(data: KpiData, period: Period, ctx: KpiContext): KpiResult;
}

const inPeriod = (date: string, period: Period) => date >= period.from && date <= period.to;
const round1 = (value: number) => Math.round(value * 10) / 10;
const pct = (value: number) => `${round1(value).toLocaleString('pt-BR')}%`;
const days = (value: number) =>
  `${round1(value).toLocaleString('pt-BR')} ${value === 1 ? 'dia' : 'dias'}`;
const insufficient = (reason: string): KpiResult => ({
  value: null,
  display: '—',
  insufficient: reason,
});

function completedIn(data: KpiData, period: Period, timeZone: string) {
  return data.tasks
    .map((task) => ({ task, date: completionDate(task, timeZone) }))
    .filter(
      (row): row is { task: MetricTask; date: string } =>
        row.date !== null && inPeriod(row.date, period),
    );
}

function lateDeliveries(data: KpiData, period: Period, timeZone: string) {
  const eligible = completedIn(data, period, timeZone).filter(({ task }) => task.due_date !== null);
  const late = eligible.filter(({ task, date }) => date > task.due_date!);
  return { eligible: eligible.length, late: late.length };
}

function timeIn(data: KpiData, period: Period, timeZone: string): KpiTimeEntry[] {
  return data.time.filter((entry) =>
    inPeriod(todayIn(timeZone, new Date(entry.started_at)), period),
  );
}

function reopenedIn(data: KpiData, period: Period, timeZone: string): number {
  return data.history.filter(
    (row) =>
      row.from_status === 'done' &&
      row.to_status !== 'done' &&
      row.to_status !== 'cancelled' &&
      inPeriod(todayIn(timeZone, new Date(row.changed_at)), period),
  ).length;
}

export const KPIS: readonly KpiDefinition[] = [
  {
    id: 'deliveries',
    name: 'Volume de entregas',
    description: 'Tarefas concluídas no período.',
    formula: 'count(tarefas concluídas no período)',
    better: 'higher',
    metric: 'deliveries',
    compute: (data, period, ctx) => {
      const count = completedIn(data, period, ctx.timeZone).length;
      return { value: count, display: String(count) };
    },
  },
  {
    id: 'on_time_rate',
    name: 'Cumprimento de prazos',
    description: 'Entregas concluídas até a data prevista, entre as que tinham prazo.',
    formula: 'concluídas até o prazo ÷ concluídas com prazo × 100',
    better: 'higher',
    metric: 'on_time_rate',
    compute: (data, period, ctx) => {
      const { eligible, late } = lateDeliveries(data, period, ctx.timeZone);
      if (eligible === 0) return insufficient('Nenhuma entrega com data prevista no período.');
      const value = ((eligible - late) / eligible) * 100;
      return { value, display: pct(value), detail: `${eligible - late} de ${eligible} entregas` };
    },
  },
  {
    id: 'late_rate',
    name: 'Taxa de atraso',
    description:
      'Tarefas abertas que já passaram do prazo, mais o histórico de entregas atrasadas no período.',
    formula: 'abertas com prazo vencido ÷ abertas com prazo × 100',
    better: 'lower',
    metric: 'late_rate',
    compute: (data, period, ctx) => {
      const withDue = data.tasks.filter((task) => isOpen(task) && task.due_date !== null);
      const { late } = lateDeliveries(data, period, ctx.timeZone);
      const history = `${late} entrega(s) atrasada(s) no período`;
      if (withDue.length === 0) {
        return { ...insufficient('Nenhuma tarefa aberta com data prevista.'), detail: history };
      }
      const overdue = withDue.filter((task) => task.due_date! < ctx.today).length;
      const value = (overdue / withDue.length) * 100;
      return { value, display: pct(value), detail: `${overdue} vencida(s) agora · ${history}` };
    },
  },
  {
    id: 'lead_time',
    name: 'Lead time',
    description: 'Tempo médio entre a data de início e a conclusão.',
    formula: 'média(data de conclusão − data de início)',
    better: 'lower',
    metric: 'lead_time',
    compute: (data, period, ctx) => {
      const rows = completedIn(data, period, ctx.timeZone).filter(
        ({ task }) => task.start_date !== null,
      );
      if (rows.length === 0) return insufficient('Nenhuma entrega com data de início no período.');
      const avg =
        rows.reduce(
          (sum, { task, date }) => sum + Math.max(0, daysBetween(task.start_date!, date)),
          0,
        ) / rows.length;
      return { value: round1(avg), display: days(avg), detail: `${rows.length} entrega(s)` };
    },
  },
  {
    id: 'cycle_time',
    name: 'Tempo de ciclo',
    description:
      'Tempo médio entre o início efetivo do trabalho (primeira vez "Em andamento") e a conclusão.',
    formula: 'média(conclusão − primeira transição para em andamento)',
    better: 'lower',
    metric: 'cycle_time',
    compute: (data, period, ctx) => {
      const firstStart = new Map<string, string>();
      for (const row of data.history) {
        if (row.to_status !== 'in_progress') continue;
        const current = firstStart.get(row.task_id);
        if (!current || row.changed_at < current) firstStart.set(row.task_id, row.changed_at);
      }
      const durations = completedIn(data, period, ctx.timeZone)
        .filter(({ task }) => firstStart.has(task.id))
        .map(
          ({ task }) =>
            (Date.parse(task.completed_at!) - Date.parse(firstStart.get(task.id)!)) / 86_400_000,
        )
        .filter((value) => value >= 0);
      if (durations.length === 0) {
        return insufficient('Nenhuma entrega no período passou pelo status "Em andamento".');
      }
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      return { value: round1(avg), display: days(avg), detail: `${durations.length} entrega(s)` };
    },
  },
  {
    id: 'predictability',
    name: 'Previsibilidade',
    description:
      'Esforço registrado em relação ao estimado, nas entregas que têm estimativa e tempo registrado. 100% = estimativa exata.',
    formula: 'Σ tempo registrado ÷ Σ estimativa × 100',
    better: 'neutral',
    metric: 'predictability',
    compute: (data, period, ctx) => {
      const logged = new Map<string, number>();
      for (const entry of data.time) {
        if (entry.task_id)
          logged.set(entry.task_id, (logged.get(entry.task_id) ?? 0) + workedSeconds(entry));
      }
      const rows = completedIn(data, period, ctx.timeZone).filter(
        ({ task }) => (task.estimated_minutes ?? 0) > 0 && (logged.get(task.id) ?? 0) > 0,
      );
      if (rows.length === 0) {
        return insufficient('Nenhuma entrega do período tem estimativa e tempo registrado.');
      }
      const spent = rows.reduce((sum, { task }) => sum + logged.get(task.id)!, 0);
      const estimated = rows.reduce((sum, { task }) => sum + task.estimated_minutes! * 60, 0);
      const value = (spent / estimated) * 100;
      return {
        value,
        display: pct(value),
        detail: `${formatDuration(spent)} registrados para ${formatDuration(estimated)} estimados (${rows.length} entrega(s))`,
      };
    },
  },
  {
    id: 'rework_rate',
    name: 'Taxa de retrabalho',
    description: 'Tarefas concluídas que foram reabertas no período, em relação às concluídas.',
    formula: 'reaberturas após conclusão ÷ concluídas no período × 100',
    better: 'lower',
    metric: 'rework_rate',
    compute: (data, period, ctx) => {
      const completed = completedIn(data, period, ctx.timeZone).length;
      const reopened = reopenedIn(data, period, ctx.timeZone);
      if (completed === 0 && reopened === 0)
        return insufficient('Nenhuma conclusão ou reabertura no período.');
      if (completed === 0) {
        return {
          value: null,
          display: '—',
          detail: `${reopened} reabertura(s)`,
          insufficient: 'Sem conclusões no período para comparar.',
        };
      }
      const value = (reopened / completed) * 100;
      return {
        value,
        display: pct(value),
        detail: `${reopened} reabertura(s) para ${completed} conclusão(ões)`,
      };
    },
  },
  {
    id: 'effort_distribution',
    name: 'Distribuição de esforço',
    description: 'Tempo registrado no período por categoria da tarefa.',
    formula: 'Σ tempo registrado agrupado por categoria',
    better: 'neutral',
    metric: 'time_invested',
    compute: (data, period, ctx) => {
      const entries = timeIn(data, period, ctx.timeZone);
      if (entries.length === 0) return insufficient('Nenhum tempo registrado no período.');
      const totals = new Map<string, number>();
      for (const entry of entries) {
        const label = entry.category_id
          ? (ctx.categoryName(entry.category_id) ?? 'Sem categoria')
          : 'Sem categoria';
        totals.set(label, (totals.get(label) ?? 0) + workedSeconds(entry));
      }
      const total = [...totals.values()].reduce((a, b) => a + b, 0);
      const breakdown = [...totals]
        .sort((a, b) => b[1] - a[1])
        .map(([label, seconds]) => ({
          label,
          value: seconds,
          display: `${formatDuration(seconds)} · ${pct(total ? (seconds / total) * 100 : 0)}`,
        }));
      return { value: round1(total / 3600), display: formatDuration(total), breakdown };
    },
  },
  {
    id: 'productivity_trend',
    name: 'Evolução da produtividade',
    description: 'Variação do volume de entregas em relação ao período anterior equivalente.',
    formula: '(entregas do período ÷ entregas do período anterior − 1) × 100',
    better: 'higher',
    compute: (data, period, ctx) => {
      const current = completedIn(data, period, ctx.timeZone).length;
      const previous = completedIn(data, previousPeriod(period), ctx.timeZone).length;
      if (previous === 0) {
        return {
          ...insufficient('Sem entregas no período anterior para comparar.'),
          detail: `${current} entrega(s) agora`,
        };
      }
      const value = (current / previous - 1) * 100;
      const sign = value > 0 ? '+' : '';
      return {
        value,
        display: `${sign}${pct(value)}`,
        detail: `${current} agora · ${previous} no período anterior`,
      };
    },
  },
  {
    id: 'learning',
    name: 'Desenvolvimento pessoal',
    description: 'Cursos, certificações e habilidades registrados no período.',
    formula: 'count(registros de desenvolvimento no período)',
    better: 'higher',
    metric: 'learning',
    compute: (data, period) => {
      const rows = data.achievements.filter((row) => inPeriod(row.achieved_on, period));
      const labels: Record<string, string> = {
        course: 'Cursos',
        certification: 'Certificações',
        skill: 'Habilidades',
        other: 'Outros',
      };
      const counts = new Map<string, number>();
      for (const row of rows) counts.set(row.kind, (counts.get(row.kind) ?? 0) + 1);
      return {
        value: rows.length,
        display: String(rows.length),
        breakdown: [...counts].map(([kind, count]) => ({
          label: labels[kind] ?? kind,
          value: count,
          display: String(count),
        })),
        insufficient:
          rows.length === 0 && data.achievements.length === 0
            ? 'Nenhum registro de desenvolvimento ainda.'
            : undefined,
      };
    },
  },
];

/** Value used to evaluate goals for `metric` over `period`. */
export function metricValue(
  metric: KpiMetric,
  data: KpiData,
  period: Period,
  ctx: KpiContext,
): number | null {
  if (metric === 'late_rate') {
    // Goals use the historical rate over the goal window (a snapshot has no window).
    const { eligible, late } = lateDeliveries(data, period, ctx.timeZone);
    return eligible === 0 ? null : (late / eligible) * 100;
  }
  if (metric === 'time_invested') {
    const entries = timeIn(data, period, ctx.timeZone);
    return round1(entries.reduce((sum, e) => sum + workedSeconds(e), 0) / 3600);
  }
  const kpi = KPIS.find((k) => k.metric === metric);
  return kpi ? kpi.compute(data, period, ctx).value : null;
}

/** The `count` consecutive periods ending with `period`, oldest first. */
export function periodHistory(period: Period, count: number): Period[] {
  const periods = [period];
  while (periods.length < count) periods.unshift(previousPeriod(periods[0]));
  return periods;
}
