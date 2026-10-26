import { computed, inject, Injectable, signal } from '@angular/core';
import type { AiChatMessage, AiStatus } from '../../../../electron/ipc/contract';
import { DesktopBridge } from '../../core/platform/desktop-bridge';
import { ProfileService } from '../../core/profile/profile.service';
import { UserClock } from '../../core/profile/user-clock';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { addDays } from '../../shared/utils/dates';
import { OrganizationStore } from '../organization/organization.service';
import { OPEN_STATUSES, type Task } from '../tasks/task.model';
import { aiErrorMessage } from './ai-messages';
import { buildContext, type ContextTask } from './didibot-context';

export interface ChatEntry {
  id: number;
  role: 'user' | 'model' | 'error';
  text: string;
}

const CONTEXT_PREF_KEY = 'didiflow:didibot:include-context';
/** Turns sent to Gemini (the main process accepts up to 20 messages). */
const HISTORY_LIMIT = 16;

/** DidiBot conversation (kept only in memory) and the context it sends. */
@Injectable({ providedIn: 'root' })
export class DidiBotService {
  private readonly bridge = inject(DesktopBridge);
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly clock = inject(UserClock);
  private readonly profile = inject(ProfileService);
  private readonly org = inject(OrganizationStore);

  readonly available = this.bridge.ai !== null;
  readonly status = signal<AiStatus | null>(null);
  readonly entries = signal<ChatEntry[]>([]);
  readonly busy = signal(false);
  readonly includeContext = signal(readPreference());
  readonly connected = computed(() => this.status()?.hasKey === true);
  private nextId = 1;

  async refreshStatus(): Promise<AiStatus | null> {
    if (!this.bridge.ai) return null;
    const status = await this.bridge.ai.status();
    this.status.set(status);
    return status;
  }

  setIncludeContext(value: boolean): void {
    this.includeContext.set(value);
    try {
      localStorage.setItem(CONTEXT_PREF_KEY, value ? '1' : '0');
    } catch {
      // Storage unavailable: the choice lasts for this session.
    }
  }

  reset(): void {
    this.entries.set([]);
  }

  async send(text: string): Promise<void> {
    const ai = this.bridge.ai;
    const question = text.trim().slice(0, 4000);
    if (!ai || !question || this.busy()) return;
    this.push('user', question);
    this.busy.set(true);
    try {
      const history: AiChatMessage[] = this.entries()
        .filter((entry): entry is ChatEntry & { role: 'user' | 'model' } => entry.role !== 'error')
        .slice(-HISTORY_LIMIT)
        .reduce<AiChatMessage[]>((turns, { role, text: body }) => {
          // Gemini expects alternating turns: merge consecutive messages of the same role.
          const last = turns[turns.length - 1];
          if (last?.role === role) last.text = `${last.text}\n\n${body}`.slice(-4000);
          else turns.push({ role, text: body });
          return turns;
        }, []);
      // The history must start with the user (Gemini alternates user/model).
      while (history.length > 1 && history[0].role !== 'user') history.shift();
      const context = this.includeContext() ? await this.context() : undefined;
      const result = await ai.chat({ messages: history, context });
      if (result.status === 'ok') this.push('model', result.text);
      else this.push('error', aiErrorMessage(result.error));
    } catch {
      this.push('error', aiErrorMessage('unknown'));
    } finally {
      this.busy.set(false);
    }
  }

  /** Suggested subtasks for a task (nothing is created here). */
  async suggestSubtasks(task: Pick<Task, 'title' | 'description'>, parentTitle?: string) {
    const ai = this.bridge.ai;
    if (!ai) return { status: 'error' as const, error: 'not-configured' as const };
    return ai.suggestSubtasks({
      title: task.title.slice(0, 200),
      description: task.description?.slice(0, 4000) ?? undefined,
      context: parentTitle ? `Faz parte de: ${parentTitle}`.slice(0, 2000) : undefined,
    });
  }

  /** Summary of the user's open work (titles, deadlines, progress; no descriptions). */
  async context(): Promise<string> {
    const today = this.clock.today();
    const [tasksResult, prioritiesResult, hoursResult, doneResult] = await Promise.all([
      this.supabase
        .from('tasks')
        .select('id,title,kind,parent_id,status,priority,progress_percentage,due_date,project_id')
        .is('deleted_at', null)
        .is('archived_at', null)
        .in('status', OPEN_STATUSES as Task['status'][])
        .order('due_date', { ascending: true, nullsFirst: false })
        .limit(200),
      this.supabase.from('daily_priorities').select('task_id').eq('priority_date', today),
      this.supabase.rpc('daily_hours', { p_from: today, p_to: today }),
      this.supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'done')
        .gte('completed_at', addDays(today, -30)),
      this.org.ensureLoaded(),
    ]);
    if (tasksResult.error) throw tasksResult.error;
    const tasks = tasksResult.data as ContextTask[];
    const known = new Map(tasks.map((task) => [task.id, task]));

    const missing = [...new Set(tasks.map((task) => task.parent_id))].filter(
      (id): id is string => !!id && !known.has(id),
    );
    const parents = new Map<string, Pick<Task, 'title' | 'parent_id'>>();
    if (missing.length) {
      const { data } = await this.supabase
        .from('tasks')
        .select('id,title,parent_id')
        .in('id', missing);
      for (const row of data ?? []) parents.set(row.id, row);
    }

    const priorityIds = (prioritiesResult.data ?? []).map((row) => row.task_id);
    const todayPriorities = priorityIds
      .map((id) => known.get(id)?.title)
      .filter((title): title is string => !!title);
    const projects = new Map(
      this.org.items().projects.map((project) => [project.id, project.name] as const),
    );

    return buildContext({
      today,
      dueSoonDays: this.clock.dueSoonDays(),
      dateFormat: this.clock.dateFormat(),
      timeZone: this.clock.timeZone(),
      displayName: this.profile.profile()?.display_name ?? '',
      tasks,
      parents,
      projects,
      todayPriorities,
      secondsToday: (hoursResult.data ?? []).reduce((sum, row) => sum + row.seconds, 0),
      dailyTargetHours: this.profile.preferences()?.daily_hours_target ?? null,
      completedLast30Days: doneResult.count ?? 0,
    });
  }

  private push(role: ChatEntry['role'], text: string): void {
    this.entries.update((entries) => [...entries, { id: this.nextId++, role, text }]);
  }
}

function readPreference(): boolean {
  try {
    return localStorage.getItem(CONTEXT_PREF_KEY) !== '0';
  } catch {
    return true;
  }
}
