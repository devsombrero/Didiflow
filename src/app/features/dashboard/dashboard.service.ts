import { inject, Injectable } from '@angular/core';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { startOfDayIn, addDays } from '../../shared/utils/dates';
import type { TimeEntryTiming } from '../time-tracking/time-calc';
import type { MetricTask, Period } from './metrics';

export type MetricTimeEntry = TimeEntryTiming & {
  task_id: string | null;
  tasks: {
    category_id: string | null;
    project_id: string | null;
    priority: string;
    status: string;
  } | null;
};

const COLUMNS =
  'id,status,priority,progress_percentage,start_date,due_date,completed_at,archived_at,category_id,project_id';
const PAGE_SIZE = 1000; // PostgREST max_rows

/** Loads the (non-deleted) task fields needed for metrics. RLS limits rows to the user. */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly supabase = inject(SUPABASE_CLIENT);

  /** Time entries started within the period (user's zone). */
  async timeEntries(period: Period, timeZone: string): Promise<MetricTimeEntry[]> {
    const { data, error } = await this.supabase
      .from('time_entries')
      .select(
        'started_at,ended_at,paused_at,paused_seconds,duration_seconds,task_id,tasks(category_id,project_id,priority,status)',
      )
      .gte('started_at', startOfDayIn(period.from, timeZone).toISOString())
      .lt('started_at', startOfDayIn(addDays(period.to, 1), timeZone).toISOString())
      .limit(5000);
    if (error) throw error;
    return data as unknown as MetricTimeEntry[];
  }

  async metricTasks(): Promise<MetricTask[]> {
    const rows: MetricTask[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await this.supabase
        .from('tasks')
        .select(COLUMNS)
        .is('deleted_at', null)
        .order('id')
        .range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      rows.push(...(data as MetricTask[]));
      if (data.length < PAGE_SIZE) return rows;
    }
  }
}
