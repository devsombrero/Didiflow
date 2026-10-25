import type { Tables } from '../../core/supabase/database.types';
import type { Period } from '../dashboard/metrics';
import { type KpiContext, type KpiData, type KpiMetric, metricValue } from './kpis';

export type Goal = Tables<'personal_goals'>;

export const METRIC_OPTIONS: readonly { metric: KpiMetric; label: string; unit: string }[] = [
  { metric: 'deliveries', label: 'Volume de entregas', unit: 'entregas' },
  { metric: 'on_time_rate', label: 'Cumprimento de prazos', unit: '%' },
  { metric: 'late_rate', label: 'Entregas com atraso', unit: '%' },
  { metric: 'lead_time', label: 'Lead time médio', unit: 'dias' },
  { metric: 'cycle_time', label: 'Tempo de ciclo médio', unit: 'dias' },
  { metric: 'predictability', label: 'Previsibilidade (registrado ÷ estimado)', unit: '%' },
  { metric: 'rework_rate', label: 'Taxa de retrabalho', unit: '%' },
  { metric: 'time_invested', label: 'Tempo investido', unit: 'horas' },
  { metric: 'learning', label: 'Desenvolvimento (cursos, certificações…)', unit: 'registros' },
];

export function metricLabel(metric: KpiMetric): string {
  return METRIC_OPTIONS.find((option) => option.metric === metric)?.label ?? metric;
}

export function metricUnit(metric: KpiMetric): string {
  return METRIC_OPTIONS.find((option) => option.metric === metric)?.unit ?? '';
}

export type GoalStatus = 'upcoming' | 'in_progress' | 'achieved' | 'missed' | 'no_data';

export const GOAL_STATUS_LABELS: Record<GoalStatus, string> = {
  upcoming: 'Ainda não começou',
  in_progress: 'Em andamento',
  achieved: 'Atingida',
  missed: 'Não atingida',
  no_data: 'Sem dados suficientes',
};

export interface GoalEvaluation {
  status: GoalStatus;
  current: number | null;
  /** 0–100 progress towards the target. */
  progress: number;
  met: boolean;
  window: Period;
}

export function evaluateGoal(
  goal: Pick<Goal, 'metric' | 'comparison' | 'target_value' | 'start_date' | 'end_date'>,
  data: KpiData,
  ctx: KpiContext,
): GoalEvaluation {
  const window: Period = {
    from: goal.start_date,
    to: goal.end_date < ctx.today ? goal.end_date : ctx.today,
  };
  if (ctx.today < goal.start_date) {
    return { status: 'upcoming', current: null, progress: 0, met: false, window };
  }

  const current = metricValue(goal.metric, data, window, ctx);
  const finished = goal.end_date < ctx.today;
  const target = Number(goal.target_value);

  if (current === null) {
    return {
      status: finished ? 'no_data' : 'in_progress',
      current,
      progress: 0,
      met: false,
      window,
    };
  }

  const atLeast = goal.comparison === 'at_least';
  const met = atLeast ? current >= target : current <= target;
  let progress: number;
  if (met) progress = 100;
  else if (atLeast) progress = target === 0 ? 100 : (current / target) * 100;
  else progress = current === 0 ? 100 : (target / current) * 100;

  return {
    status: finished ? (met ? 'achieved' : 'missed') : 'in_progress',
    current,
    progress: Math.max(0, Math.min(100, Math.round(progress))),
    met,
    window,
  };
}
