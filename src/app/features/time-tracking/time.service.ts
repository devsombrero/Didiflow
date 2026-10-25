import { computed, inject, Injectable, signal } from '@angular/core';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { isRunning, type TimeEntry, workedSeconds } from './time-calc';

export interface ManualEntryInput {
  task_id: string | null;
  description: string | null;
  started_at: string;
  ended_at: string;
}

/** Entry with the title of its task (embedded). */
export type TimeEntryWithTask = TimeEntry & {
  tasks: { title: string; category_id: string | null; project_id: string | null } | null;
};

const SELECT = '*, tasks(title, category_id, project_id)';

@Injectable({ providedIn: 'root' })
export class TimeService {
  private readonly supabase = inject(SUPABASE_CLIENT);

  async running(): Promise<TimeEntryWithTask | null> {
    const { data, error } = await this.supabase
      .from('time_entries')
      .select(SELECT)
      .is('ended_at', null)
      .maybeSingle();
    if (error) throw error;
    return data as TimeEntryWithTask | null;
  }

  async start(taskId: string | null, description: string | null): Promise<void> {
    const { error } = await this.supabase.rpc('start_timer', {
      p_task_id: taskId ?? undefined,
      p_description: description ?? undefined,
    });
    if (error) throw error;
  }

  async pause(): Promise<void> {
    const { error } = await this.supabase.rpc('pause_timer');
    if (error) throw error;
  }

  async resume(): Promise<void> {
    const { error } = await this.supabase.rpc('resume_timer');
    if (error) throw error;
  }

  async stop(): Promise<void> {
    const { error } = await this.supabase.rpc('stop_timer');
    if (error) throw error;
  }

  /** Entries started in [from, to). */
  async list(from: Date, to: Date): Promise<TimeEntryWithTask[]> {
    const { data, error } = await this.supabase
      .from('time_entries')
      .select(SELECT)
      .gte('started_at', from.toISOString())
      .lt('started_at', to.toISOString())
      .order('started_at', { ascending: false });
    if (error) throw error;
    return data as TimeEntryWithTask[];
  }

  async forTask(taskId: string): Promise<TimeEntry[]> {
    const { data, error } = await this.supabase
      .from('time_entries')
      .select('*')
      .eq('task_id', taskId)
      .order('started_at', { ascending: false });
    if (error) throw error;
    return data;
  }

  async createManual(input: ManualEntryInput): Promise<void> {
    const { error } = await this.supabase
      .from('time_entries')
      .insert({ ...input, source: 'manual' });
    if (error) throw error;
  }

  async update(id: string, input: ManualEntryInput): Promise<void> {
    const { error } = await this.supabase.from('time_entries').update(input).eq('id', id);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.supabase.from('time_entries').delete().eq('id', id);
    if (error) throw error;
  }
}

/**
 * The running timer, shared by the sidebar widget, the time page and task
 * pages. `elapsed` ticks every second while a timer runs.
 */
@Injectable({ providedIn: 'root' })
export class TimerStore {
  private readonly time = inject(TimeService);
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly now = signal(Date.now());

  readonly entry = signal<TimeEntryWithTask | null>(null);
  readonly busy = signal(false);
  readonly running = computed(() => isRunning(this.entry()));
  readonly paused = computed(() => !!this.entry()?.paused_at);
  readonly elapsed = computed(() => {
    const entry = this.entry();
    return entry ? workedSeconds(entry, this.now()) : 0;
  });
  /** Incremented after every stop, so lists can refresh. */
  readonly version = signal(0);

  async refresh(): Promise<void> {
    this.entry.set(await this.time.running());
    this.syncTicker();
  }

  async start(taskId: string | null, description: string | null = null): Promise<void> {
    await this.act(() => this.time.start(taskId, description));
  }

  async pause(): Promise<void> {
    await this.act(() => this.time.pause());
  }

  async resume(): Promise<void> {
    await this.act(() => this.time.resume());
  }

  async stop(): Promise<void> {
    await this.act(() => this.time.stop());
    this.version.update((v) => v + 1);
  }

  clear(): void {
    this.entry.set(null);
    this.syncTicker();
  }

  private async act(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
      await this.refresh();
    } finally {
      this.busy.set(false);
    }
  }

  private syncTicker(): void {
    const active = this.running() && !this.paused();
    if (active && !this.timer) {
      this.timer = setInterval(() => this.now.set(Date.now()), 1000);
    } else if (!active && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.now.set(Date.now());
  }
}
