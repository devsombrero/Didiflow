import { Component, computed, inject, input, type OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DesktopBridge } from '../../../core/platform/desktop-bridge';
import { UserClock } from '../../../core/profile/user-clock';
import { AppDatePipe } from '../../../shared/pipes/app-date.pipe';
import { ToastService } from '../../../shared/toast/toast.service';
import { PriorityBadge, StatusBadge } from '../components/task-badges';
import { TaskProgressPanel } from '../components/task-progress-panel';
import { TaskActivityFeed } from '../components/task-activity-feed';
import { TaskActions } from '../task-actions.service';
import { deadlineLabel, deadlineState } from '../task-deadline';
import type { Task } from '../task.model';
import { canCancel, canReopen } from '../task-rules';
import { TasksService } from '../tasks.service';

@Component({
  selector: 'app-task-detail-page',
  imports: [
    RouterLink,
    AppDatePipe,
    StatusBadge,
    PriorityBadge,
    TaskProgressPanel,
    TaskActivityFeed,
  ],
  templateUrl: './task-detail-page.html',
  styleUrl: './task-detail-page.scss',
})
export class TaskDetailPage implements OnInit {
  private readonly tasks = inject(TasksService);
  private readonly router = inject(Router);
  private readonly bridge = inject(DesktopBridge);
  private readonly toast = inject(ToastService);
  private readonly clock = inject(UserClock);
  protected readonly actions = inject(TaskActions);

  readonly id = input.required<string>();

  protected readonly task = signal<Task | null>(null);
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

  protected readonly canCancel = canCancel;
  protected readonly canReopen = canReopen;

  async ngOnInit(): Promise<void> {
    try {
      const task = await this.tasks.get(this.id());
      this.task.set(task);
      this.state.set(task ? 'ready' : 'not-found');
    } catch {
      this.state.set('error');
    }
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
