import { type CdkDragDrop, DragDropModule } from '@angular/cdk/drag-drop';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { UserClock } from '../../../core/profile/user-clock';
import { MATERIAL_FORMS, MATERIAL_UI } from '../../../shared/material';
import { AppDatePipe } from '../../../shared/pipes/app-date.pipe';
import { ToastService } from '../../../shared/toast/toast.service';
import { addDays } from '../../../shared/utils/dates';
import { describeError } from '../../../shared/utils/errors';
import { OrganizationStore } from '../../organization/organization.service';
import { PriorityBadge, ProgressBar } from '../components/task-badges';
import { TaskActions } from '../task-actions.service';
import { deadlineLabel, deadlineState } from '../task-deadline';
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TASK_PRIORITIES,
  type TaskPriority,
  type TaskStatus,
  type TaskWithTags,
} from '../task.model';
import { TasksService } from '../tasks.service';
import { BOARD_COLUMNS, boardMove, groupByStatus } from './kanban';
import { TaskFormDialogs } from '../task-form/task-form-dialog';

const COLUMN_ICONS: Record<TaskStatus, string> = {
  not_started: 'radio_button_unchecked',
  in_progress: 'pending',
  blocked: 'block',
  done: 'check_circle',
  cancelled: 'cancel',
};

/** Days of completed (and cancelled) work kept visible on the board. */
const RECENT_DAYS = 14;

@Component({
  selector: 'app-kanban-page',
  imports: [
    RouterLink,
    DragDropModule,
    AppDatePipe,
    PriorityBadge,
    ProgressBar,
    MATERIAL_FORMS,
    MATERIAL_UI,
  ],
  templateUrl: './kanban-page.html',
  styleUrl: './kanban-page.scss',
})
export class KanbanPage {
  protected readonly taskDialogs = inject(TaskFormDialogs);
  private readonly tasksService = inject(TasksService);
  private readonly actions = inject(TaskActions);
  private readonly toast = inject(ToastService);
  private readonly clock = inject(UserClock);
  private readonly router = inject(Router);
  protected readonly org = inject(OrganizationStore);

  protected readonly statusLabels = STATUS_LABELS;
  protected readonly priorityLabels = PRIORITY_LABELS;
  protected readonly priorities = TASK_PRIORITIES;
  protected readonly icons = COLUMN_ICONS;
  protected readonly recentDays = RECENT_DAYS;

  protected readonly includeCancelled = signal(false);
  protected readonly projectId = signal<string>('');
  protected readonly priority = signal<TaskPriority | ''>('');
  protected readonly tasks = signal<TaskWithTags[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly moving = signal<string | null>(null);

  protected readonly columns = computed<TaskStatus[]>(() =>
    this.includeCancelled() ? [...BOARD_COLUMNS, 'cancelled'] : [...BOARD_COLUMNS],
  );
  protected readonly groups = computed(() => groupByStatus(this.tasks(), this.columns()));

  private requestId = 0;

  constructor() {
    void this.org.ensureLoaded().catch(() => undefined);
    effect(() => {
      const filters = {
        includeCancelled: this.includeCancelled(),
        projectId: this.projectId() || null,
        priority: (this.priority() || null) as TaskPriority | null,
      };
      untracked(() => void this.load(filters));
    });
  }

  protected deadlineOf(task: TaskWithTags): { kind: string; label: string } {
    const state = deadlineState(task, this.clock.today(), this.clock.dueSoonDays());
    return { kind: state.kind, label: deadlineLabel(state) };
  }

  protected nameOf(id: string | null): string | null {
    return id ? (this.org.byId().get(id)?.name ?? null) : null;
  }

  protected openList(): void {
    void this.router.navigate(['/tasks']);
  }

  /** Drag & drop handler: the target column id is the status. */
  protected async drop(event: CdkDragDrop<TaskStatus, TaskStatus, TaskWithTags>): Promise<void> {
    if (event.previousContainer === event.container) return;
    await this.moveTo(event.item.data, event.container.data);
  }

  /** Moves a card (drag & drop or the keyboard-accessible "Mover para" menu). */
  protected async moveTo(task: TaskWithTags, target: TaskStatus): Promise<void> {
    const move = boardMove(task, target);
    if (move.kind === 'none') return;

    this.moving.set(task.id);
    const previous = this.tasks();
    try {
      let updated: TaskWithTags | undefined;
      if (move.kind === 'cancel') {
        const result = await this.actions.cancel(task);
        if (!result) return; // dismissed or failed (already reported)
        updated = { ...task, ...result };
      } else {
        // Optimistic: show the card in the target column while saving.
        this.replace({ ...task, status: target });
        let result = move.kind === 'reopen' ? await this.tasksService.reopen(task) : null;
        if (!result || result.status !== target) {
          result = await this.tasksService.setStatus(task.id, target);
        }
        updated = { ...task, ...result };
        this.toast.success(`"${task.title}" movida para ${STATUS_LABELS[target]}.`);
      }
      this.replace(updated);
    } catch (error) {
      this.tasks.set(previous);
      this.toast.error(describeError(error, 'Não foi possível mover a tarefa.'));
    } finally {
      this.moving.set(null);
    }
  }

  private replace(task: TaskWithTags): void {
    this.tasks.update((tasks) => tasks.map((t) => (t.id === task.id ? task : t)));
  }

  private async load(filters: {
    includeCancelled: boolean;
    projectId: string | null;
    priority: TaskPriority | null;
  }): Promise<void> {
    const id = ++this.requestId;
    this.state.set('loading');
    try {
      const tasks = await this.tasksService.boardTasks({
        ...filters,
        recentSince: addDays(this.clock.today(), -RECENT_DAYS),
      });
      if (id !== this.requestId) return;
      this.tasks.set(tasks);
      this.state.set('ready');
    } catch {
      if (id === this.requestId) this.state.set('error');
    }
  }
}
