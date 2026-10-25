import { Component, computed, inject, input, signal, effect, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DesktopBridge } from '../../../core/platform/desktop-bridge';
import { UserClock } from '../../../core/profile/user-clock';
import { AppDatePipe } from '../../../shared/pipes/app-date.pipe';
import { ToastService } from '../../../shared/toast/toast.service';
import { PriorityBadge, StatusBadge } from '../components/task-badges';
import { TaskProgressPanel } from '../components/task-progress-panel';
import { TaskActivityFeed } from '../components/task-activity-feed';
import { TaskTimePanel } from '../../time-tracking/task-time-panel';
import { TaskRemindersPanel } from '../../notifications/task-reminders-panel';
import { TaskActions } from '../task-actions.service';
import { deadlineLabel, deadlineState } from '../task-deadline';
import type { Task, TaskWithTags } from '../task.model';
import { canCancel, canComplete, canReopen } from '../task-rules';
import { OrganizationStore } from '../../organization/organization.service';
import { parseJiraLink, parseSlackLink } from '../../integrations/integrations';
import { TasksService } from '../tasks.service';
import { MATERIAL_UI } from '../../../shared/material';
import { MarkdownView } from '../../../shared/markdown/markdown-view';
import { TaskAttachmentsPanel } from '../../attachments/task-attachments-panel';
import { TaskChildrenPanel } from '../components/task-children-panel';
import { TaskHoursPanel } from '../components/task-hours-panel';
import { TaskLinksPanel } from '../components/task-links-panel';
import { MatTabsModule } from '@angular/material/tabs';
import { TaskFormDialogs } from '../task-form/task-form-dialog';

@Component({
  selector: 'app-task-detail-page',
  imports: [
    RouterLink,
    AppDatePipe,
    StatusBadge,
    PriorityBadge,
    TaskProgressPanel,
    TaskActivityFeed,
    TaskTimePanel,
    TaskRemindersPanel,
    TaskChildrenPanel,
    TaskHoursPanel,
    TaskLinksPanel,
    MatTabsModule,
    TaskAttachmentsPanel,
    MarkdownView,
    MATERIAL_UI,
  ],
  templateUrl: './task-detail-page.html',
  styleUrl: './task-detail-page.scss',
})
export class TaskDetailPage {
  protected readonly taskDialogs = inject(TaskFormDialogs);
  private readonly tasks = inject(TasksService);
  private readonly router = inject(Router);
  private readonly bridge = inject(DesktopBridge);
  private readonly toast = inject(ToastService);
  private readonly clock = inject(UserClock);
  protected readonly actions = inject(TaskActions);
  private readonly org = inject(OrganizationStore);

  readonly id = input.required<string>();

  protected readonly task = signal<Task | null>(null);
  /** Bumped by panels whose changes add activity without touching the task row. */
  protected readonly activityVersion = signal(0);
  /** Parent chain (epic › task) shown in the breadcrumb. */
  protected readonly ancestors = signal<Pick<Task, 'id' | 'title' | 'kind'>[]>([]);
  /** Active children reported by the subtasks panel. */
  protected readonly childrenCount = signal(0);
  protected readonly hoursVersion = signal(0);
  /** Links of the task, for the "Recursos" tab label. */
  protected readonly linkCount = signal(0);
  /** Alias usable inside the template where `task` is shadowed by @if. */
  protected readonly task$ = this.task;
  protected readonly state = signal<'loading' | 'ready' | 'not-found' | 'error'>('loading');
  protected readonly deadline = computed(() => {
    const task = this.task();
    if (!task) return { kind: 'none', label: '' };
    const state = deadlineState(task, this.clock.today(), this.clock.dueSoonDays());
    return { kind: state.kind, label: deadlineLabel(state) };
  });
  protected readonly estimate = computed(() => {
    const minutes = this.task()?.estimated_minutes;
    if (minutes === null || minutes === undefined) return '—';
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}min` : `${hours}h`;
  });

  protected readonly tagNames = signal<string[]>([]);
  protected readonly jiraLabel = computed(() => {
    const url = this.task()?.jira_url;
    return url ? (parseJiraLink(url)?.label ?? 'Abrir card') : '';
  });
  protected readonly slackLabel = computed(() => {
    const url = this.task()?.slack_thread_url;
    return url ? (parseSlackLink(url)?.label ?? 'Abrir thread') : '';
  });

  protected nameOf(id: string | null): string {
    return id ? (this.org.byId().get(id)?.name ?? '—') : '—';
  }

  protected readonly canCancel = canCancel;
  protected readonly canComplete = canComplete;
  protected readonly canReopen = canReopen;

  constructor() {
    // The route reuses this component when moving between tasks (breadcrumb,
    // subtasks): reload whenever the id changes.
    effect(() => {
      this.id();
      untracked(() => void this.load());
    });
  }

  /** Subtasks changed: the database recomputed this task's progress. */
  protected async refresh(): Promise<void> {
    const task = await this.tasks.get(this.id()).catch(() => null);
    if (task) this.task.set(task);
    this.hoursVersion.update((v) => v + 1);
    this.activityVersion.update((v) => v + 1);
  }

  protected async edit(id: string): Promise<void> {
    if (await this.taskDialogs.edit(id)) await this.load();
  }

  private async load(): Promise<void> {
    try {
      const [task] = await Promise.all([
        this.tasks.get(this.id()),
        this.org.ensureLoaded().catch(() => undefined),
      ]);
      this.task.set(task);
      this.setTagNames(task);
      this.ancestors.set(task ? await this.tasks.ancestors(task).catch(() => []) : []);
      this.state.set(task ? 'ready' : 'not-found');
    } catch {
      this.state.set('error');
    }
  }

  private setTagNames(task: TaskWithTags | null): void {
    const names = (task?.task_tags ?? [])
      .map((link) => this.org.byId().get(link.tag_id)?.name)
      .filter((name): name is string => !!name);
    this.tagNames.set(names);
  }

  protected async openLink(url: string | null): Promise<void> {
    if (!url) return;
    try {
      await this.bridge.openExternal(url);
    } catch {
      this.toast.error('Não foi possível abrir o link.');
    }
  }

  protected async act(action: Promise<Task | null | undefined>): Promise<void> {
    const result = await action;
    if (result === null) {
      await this.router.navigate(['/tasks']);
    } else if (result) {
      if (result.id === this.task()?.id) {
        this.task.set(result);
      } else {
        await this.router.navigate(['/tasks', result.id]); // duplicated
      }
    }
  }
}
