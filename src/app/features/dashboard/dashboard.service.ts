import { inject, Injectable } from '@angular/core';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import type { MetricTask } from './metrics';

const COLUMNS =
  'id,status,priority,progress_percentage,start_date,due_date,completed_at,archived_at,category_id,project_id';
const PAGE_SIZE = 1000; // PostgREST max_rows

/** Loads the (non-deleted) task fields needed for metrics. RLS limits rows to the user. */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly supabase = inject(SUPABASE_CLIENT);

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
