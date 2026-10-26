import { computed, inject, Injectable, signal } from '@angular/core';
import type { AiAction, AiChatMessage, AiStatus } from '../../../../electron/ipc/contract';
import { DesktopBridge } from '../../core/platform/desktop-bridge';
import { ProfileService } from '../../core/profile/profile.service';
import { UserClock } from '../../core/profile/user-clock';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { addDays } from '../../shared/utils/dates';
import { OrganizationStore } from '../organization/organization.service';
import { OPEN_STATUSES, type Task } from '../tasks/task.model';
import { aiErrorMessage } from './ai-messages';
import { type ActionResult, DidiBotActions } from './didibot-actions';
import {
  buildContext,
  type ContextTask,
  type OrganizationNames,
  organizationLines,
} from './didibot-context';

/** An action proposed by DidiBot, waiting for (or after) the user's decision. */
export interface ProposedAction {
  action: AiAction;
  label: string;
  selected: boolean;
  result?: ActionResult;
}

export interface ChatEntry {
  id: number;
  role: 'user' | 'model' | 'error';
  text: string;
  actions?: ProposedAction[];
  actionsState?: 'pending' | 'applying' | 'applied' | 'dismissed';
}

const CONTEXT_PREF_KEY = 'didiflow:didibot:include-context';
const ACTIONS_PREF_KEY = 'didiflow:didibot:allow-actions';
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
  private readonly actions = inject(DidiBotActions);

  readonly available = this.bridge.ai !== null;
  readonly status = signal<AiStatus | null>(null);
  readonly entries = signal<ChatEntry[]>([]);
  readonly busy = signal(false);
  readonly connecting = signal(false);
  readonly includeContext = signal(readPreference(CONTEXT_PREF_KEY));
  /** DidiBot may propose projects and tasks (applied only after confirmation). */
  readonly allowActions = signal(readPreference(ACTIONS_PREF_KEY));
  readonly connected = computed(() => this.status()?.hasKey === true);
  private nextId = 1;

  async refreshStatus(): Promise<AiStatus | null> {
    if (!this.bridge.ai) return null;
    const status = await this.bridge.ai.status();
    this.status.set(status);
    return status;
  }

  /** Google sign-in in the browser; the main process creates and stores the Gemini key. */
  async connectGoogle() {
    const ai = this.bridge.ai;
    if (!ai) return { status: 'error' as const, error: 'not-configured' as const };
    this.connecting.set(true);
    try {
      const result = await ai.connectGoogle();
      await this.refreshStatus();
      return result;
    } finally {
      this.connecting.set(false);
    }
  }

  setIncludeContext(value: boolean): void {
    this.includeContext.set(value);
    writePreference(CONTEXT_PREF_KEY, value);
  }

  setAllowActions(value: boolean): void {
    this.allowActions.set(value);
    writePreference(ACTIONS_PREF_KEY, value);
  }

  toggleAction(entryId: number, index: number, selected: boolean): void {
    this.updateEntry(entryId, (entry) => ({
      ...entry,
      actions: entry.actions?.map((item, i) => (i === index ? { ...item, selected } : item)),
    }));
  }

  dismissActions(entryId: number): void {
    this.updateEntry(entryId, (entry) => ({ ...entry, actionsState: 'dismissed' }));
  }

  /** Applies the selected proposals and tells DidiBot what happened. */
  async applyActions(entryId: number): Promise<ActionResult[]> {
    const entry = this.entries().find((item) => item.id === entryId);
    const chosen = entry?.actions?.filter((item) => item.selected) ?? [];
    if (!entry || entry.actionsState !== 'pending' || chosen.length === 0) return [];
    this.updateEntry(entryId, (current) => ({ ...current, actionsState: 'applying' }));
    const results = await this.actions.apply(chosen.map((item) => item.action));
    let next = 0;
    this.updateEntry(entryId, (current) => ({
      ...current,
      actionsState: 'applied',
      actions: current.actions?.map((item) =>
        item.selected ? { ...item, result: results[next++] } : item,
      ),
    }));
    // Keeps the conversation aware of what now exists in DidiFlow.
    const summary = results.map((result) => `- ${result.message}`).join('\n');
    this.push('model', `Ações aplicadas no DidiFlow:\n${summary}`);
    return results;
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
      const allowActions = this.allowActions();
      const context = this.includeContext()
        ? await this.context()
        : allowActions
          ? await this.organizationContext()
          : undefined;
      const result = await ai.chat({ messages: history, context, allowActions });
      if (result.status !== 'ok') {
        this.push('error', aiErrorMessage(result.error));
      } else if (result.actions.length) {
        this.entries.update((entries) => [
          ...entries,
          {
            id: this.nextId++,
            role: 'model',
            text: result.text || 'Preparei estas ações para você revisar:',
            actions: result.actions.map((action) => ({
              action,
              label: this.actions.describe(action),
              selected: true,
            })),
            actionsState: 'pending',
          },
        ]);
      } else {
        this.push('model', result.text);
      }
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
      organization: this.organizationNames(),
    });
  }

  /** Only the names of projects, categories and tags (when tasks stay out of the context). */
  private async organizationContext(): Promise<string> {
    await this.org.ensureLoaded();
    const lines = [`Hoje: ${this.clock.today()}`, ...organizationLines(this.organizationNames())];
    return lines.join('\n');
  }

  private organizationNames(): OrganizationNames {
    const items = this.org.items();
    return {
      projects: items.projects.filter((p) => !p.archived_at).map((p) => p.name),
      categories: items.categories.map((c) => c.name),
      tags: items.tags.map((t) => t.name),
    };
  }

  private updateEntry(id: number, change: (entry: ChatEntry) => ChatEntry): void {
    this.entries.update((entries) =>
      entries.map((entry) => (entry.id === id ? change(entry) : entry)),
    );
  }

  private push(role: ChatEntry['role'], text: string): void {
    this.entries.update((entries) => [...entries, { id: this.nextId++, role, text }]);
  }
}

function readPreference(key: string): boolean {
  try {
    return localStorage.getItem(key) !== '0';
  } catch {
    return true;
  }
}

function writePreference(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    // Storage unavailable: the choice lasts for this session.
  }
}
