import { inject, Injectable } from '@angular/core';
import type { Tables, TablesInsert } from '../../core/supabase/database.types';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { DashboardService } from '../dashboard/dashboard.service';
import type { Goal } from './goals';
import type { HistoryRow, KpiData, KpiTimeEntry } from './kpis';

export type Achievement = Tables<'skill_achievements'>;
export type GoalInput = Omit<
  TablesInsert<'personal_goals'>,
  'id' | 'owner_id' | 'created_at' | 'updated_at'
>;
export type AchievementInput = Omit<
  TablesInsert<'skill_achievements'>,
  'id' | 'owner_id' | 'created_at' | 'updated_at'
>;

const PAGE = 1000;

/** Loads everything KPIs and goals are computed from. RLS scopes all rows. */
@Injectable({ providedIn: 'root' })
export class KpisService {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly dashboard = inject(DashboardService);

  async data(): Promise<KpiData> {
    const [tasks, history, time, achievements] = await Promise.all([
      this.dashboard.metricTasks(),
      this.paged<HistoryRow>((from) =>
        this.supabase
          .from('task_status_history')
          .select('task_id,from_status,to_status,changed_at')
          .order('id')
          .range(from, from + PAGE - 1),
      ),
      this.paged<KpiTimeEntry & { tasks: { category_id: string | null } | null }>((from) =>
        this.supabase
          .from('time_entries')
          .select(
            'task_id,started_at,ended_at,paused_at,paused_seconds,duration_seconds,tasks(category_id)',
          )
          .order('id')
          .range(from, from + PAGE - 1),
      ),
      this.achievements(),
    ]);
    return {
      tasks,
      history,
      time: time.map(({ tasks: task, ...entry }) => ({
        ...entry,
        category_id: task?.category_id ?? null,
      })),
      achievements,
    };
  }

  async goals(): Promise<Goal[]> {
    const { data, error } = await this.supabase
      .from('personal_goals')
      .select('*')
      .order('end_date', { ascending: false });
    if (error) throw error;
    return data;
  }

  async saveGoal(input: GoalInput, id?: string): Promise<void> {
    const { error } = id
      ? await this.supabase.from('personal_goals').update(input).eq('id', id)
      : await this.supabase.from('personal_goals').insert(input);
    if (error) throw error;
  }

  async removeGoal(id: string): Promise<void> {
    const { error } = await this.supabase.from('personal_goals').delete().eq('id', id);
    if (error) throw error;
  }

  async achievements(): Promise<Achievement[]> {
    const { data, error } = await this.supabase
      .from('skill_achievements')
      .select('*')
      .order('achieved_on', { ascending: false });
    if (error) throw error;
    return data;
  }

  async saveAchievement(input: AchievementInput, id?: string): Promise<void> {
    const { error } = id
      ? await this.supabase.from('skill_achievements').update(input).eq('id', id)
      : await this.supabase.from('skill_achievements').insert(input);
    if (error) throw error;
  }

  async removeAchievement(id: string): Promise<void> {
    const { error } = await this.supabase.from('skill_achievements').delete().eq('id', id);
    if (error) throw error;
  }

  private async paged<T>(
    page: (from: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>,
  ): Promise<T[]> {
    const rows: T[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await page(from);
      if (error) throw error;
      rows.push(...((data ?? []) as T[]));
      if (!data || data.length < PAGE) return rows;
    }
  }
}
