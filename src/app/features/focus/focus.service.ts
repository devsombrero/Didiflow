import { computed, inject, Injectable, signal } from '@angular/core';
import { DesktopBridge } from '../../core/platform/desktop-bridge';
import type { Tables } from '../../core/supabase/database.types';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import type { SuggestionTask } from './focus-logic';
import { remainingSeconds } from './focus-logic';
import { AppNotifier } from '../notifications/notification-center';

export type PriorityRow = Tables<'daily_priorities'> & { tasks: SuggestionTask | null };
export type FocusSession = Tables<'focus_sessions'>;

const TASK_FIELDS = 'id,title,status,priority,due_date,progress_percentage';

@Injectable({ providedIn: 'root' })
export class FocusService {
  private readonly supabase = inject(SUPABASE_CLIENT);

  async priorities(date: string): Promise<PriorityRow[]> {
    const { data, error } = await this.supabase
      .from('daily_priorities')
      .select(`*, tasks(${TASK_FIELDS})`)
      .eq('priority_date', date)
      .order('position');
    if (error) throw error;
    return data as unknown as PriorityRow[];
  }

  async openTasks(): Promise<SuggestionTask[]> {
    const { data, error } = await this.supabase
      .from('tasks')
      .select(TASK_FIELDS)
      .is('deleted_at', null)
      .is('archived_at', null)
      .in('status', ['not_started', 'in_progress', 'blocked'])
      .limit(500);
    if (error) throw error;
    return data;
  }

  async addPriority(date: string, taskId: string, position: number): Promise<void> {
    const { error } = await this.supabase
      .from('daily_priorities')
      .insert({ priority_date: date, task_id: taskId, position });
    if (error) throw error;
  }

  async removePriority(id: string): Promise<void> {
    const { error } = await this.supabase.from('daily_priorities').delete().eq('id', id);
    if (error) throw error;
  }

  async reorder(ids: readonly string[]): Promise<void> {
    const results = await Promise.all(
      ids.map((id, position) =>
        this.supabase.from('daily_priorities').update({ position }).eq('id', id),
      ),
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) throw failed.error;
  }

  async activeSession(): Promise<(FocusSession & { tasks: { title: string } | null }) | null> {
    const { data, error } = await this.supabase
      .from('focus_sessions')
      .select('*, tasks(title)')
      .is('ended_at', null)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async startSession(taskId: string | null, minutes: number): Promise<FocusSession> {
    const { data, error } = await this.supabase
      .from('focus_sessions')
      .insert({ task_id: taskId, planned_minutes: minutes })
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async endSession(id: string, completed: boolean, endedAt: string): Promise<void> {
    const { error } = await this.supabase
      .from('focus_sessions')
      .update({ ended_at: endedAt, completed })
      .eq('id', id);
    if (error) throw error;
  }

  async recentSessions(
    limit = 10,
  ): Promise<(FocusSession & { tasks: { title: string } | null })[]> {
    const { data, error } = await this.supabase
      .from('focus_sessions')
      .select('*, tasks(title)')
      .not('ended_at', 'is', null)
      .order('started_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  }

  /** Records the focused span as a manual time entry on the task. */
  async logTime(taskId: string | null, startedAt: string, endedAt: string): Promise<void> {
    const { error } = await this.supabase.from('time_entries').insert({
      task_id: taskId,
      started_at: startedAt,
      ended_at: endedAt,
      description: 'Sessão de foco',
      source: 'manual',
    });
    if (error) throw error;
  }
}

export interface ActiveFocus {
  /** Database id when the session is being recorded; null for local-only sessions. */
  id: string | null;
  taskId: string | null;
  taskTitle: string | null;
  startedAt: string;
  plannedMinutes: number;
  logTime: boolean;
}

/** The current focus countdown, shared by the focus page and the shell. */
@Injectable({ providedIn: 'root' })
export class FocusStore {
  private readonly service = inject(FocusService);
  private readonly bridge = inject(DesktopBridge);
  private readonly notifier = inject(AppNotifier);
  private readonly now = signal(Date.now());
  private timer: ReturnType<typeof setInterval> | null = null;

  readonly active = signal<ActiveFocus | null>(null);
  /** Last finished session, for the completion message. */
  readonly finished = signal<{ taskTitle: string | null; completed: boolean } | null>(null);
  readonly remaining = computed(() => {
    const active = this.active();
    return active
      ? remainingSeconds(
          { started_at: active.startedAt, planned_minutes: active.plannedMinutes },
          this.now(),
        )
      : 0;
  });

  async restore(): Promise<void> {
    const session = await this.service.activeSession();
    if (!session) return;
    this.active.set({
      id: session.id,
      taskId: session.task_id,
      taskTitle: session.tasks?.title ?? null,
      startedAt: session.started_at,
      plannedMinutes: session.planned_minutes,
      logTime: false,
    });
    this.startTicker();
  }

  async start(options: {
    taskId: string | null;
    taskTitle: string | null;
    minutes: number;
    record: boolean;
    logTime: boolean;
  }): Promise<void> {
    const session = options.record
      ? await this.service.startSession(options.taskId, options.minutes)
      : null;
    this.finished.set(null);
    this.active.set({
      id: session?.id ?? null,
      taskId: options.taskId,
      taskTitle: options.taskTitle,
      startedAt: session?.started_at ?? new Date().toISOString(),
      plannedMinutes: options.minutes,
      logTime: options.logTime,
    });
    this.startTicker();
  }

  /** Ends the session early (interrupted) or on time (completed). */
  async finish(completed: boolean): Promise<void> {
    const active = this.active();
    if (!active) return;
    this.stopTicker();
    this.active.set(null);

    const plannedEnd = Date.parse(active.startedAt) + active.plannedMinutes * 60_000;
    const endedAt = new Date(
      completed ? plannedEnd : Math.min(Date.now(), plannedEnd),
    ).toISOString();
    if (active.id) await this.service.endSession(active.id, completed, endedAt);
    if (active.logTime && Date.parse(endedAt) - Date.parse(active.startedAt) >= 60_000) {
      await this.service.logTime(active.taskId, active.startedAt, endedAt);
    }
    this.finished.set({ taskTitle: active.taskTitle, completed });
    if (completed) {
      await this.notifier.notify({
        kind: 'focus',
        title: 'Sessão de foco concluída',
        body: active.taskTitle ? `Bom trabalho em "${active.taskTitle}".` : 'Hora de uma pausa.',
        route: '/focus',
        sound: 'chime',
      });
    }
  }

  clear(): void {
    this.stopTicker();
    this.active.set(null);
    this.finished.set(null);
  }

  private startTicker(): void {
    this.stopTicker();
    this.now.set(Date.now());
    this.timer = setInterval(() => {
      this.now.set(Date.now());
      if (this.remaining() === 0) void this.finish(true);
    }, 1000);
  }

  private stopTicker(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
