import { Component, computed, inject, type OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UserClock } from '../../core/profile/user-clock';
import { ToastService } from '../../shared/toast/toast.service';
import { describeError } from '../../shared/utils/errors';
import { PriorityBadge, ProgressBar } from '../tasks/components/task-badges';
import { STATUS_LABELS } from '../tasks/task.model';
import { TasksService } from '../tasks/tasks.service';
import { move, type SuggestionTask, suggestPriorities } from './focus-logic';
import { FocusService, type PriorityRow } from './focus.service';

@Component({
  selector: 'app-today-page',
  imports: [RouterLink, PriorityBadge, ProgressBar],
  templateUrl: './today-page.html',
  styleUrl: './today-page.scss',
})
export class TodayPage implements OnInit {
  private readonly focus = inject(FocusService);
  private readonly tasks = inject(TasksService);
  private readonly clock = inject(UserClock);
  private readonly toast = inject(ToastService);

  protected readonly statusLabels = STATUS_LABELS;
  protected readonly today = this.clock.today();
  protected readonly priorities = signal<PriorityRow[]>([]);
  protected readonly openTasks = signal<SuggestionTask[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly busy = signal(false);

  protected readonly suggestions = computed(() =>
    suggestPriorities(
      this.openTasks(),
      this.today,
      this.clock.dueSoonDays(),
      new Set(this.priorities().map((p) => p.task_id)),
    ),
  );
  protected readonly others = computed(() => {
    const taken = new Set([
      ...this.priorities().map((p) => p.task_id),
      ...this.suggestions().map((s) => s.task.id),
    ]);
    return this.openTasks()
      .filter((task) => !taken.has(task.id))
      .sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  });

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected async add(taskId: string): Promise<void> {
    if (!taskId) return;
    await this.run(() => this.focus.addPriority(this.today, taskId, this.priorities().length));
  }

  protected async remove(row: PriorityRow): Promise<void> {
    await this.run(() => this.focus.removePriority(row.id));
  }

  protected async shift(index: number, direction: -1 | 1): Promise<void> {
    const reordered = move(this.priorities(), index, direction);
    this.priorities.set(reordered);
    await this.run(() => this.focus.reorder(reordered.map((row) => row.id)));
  }

  protected async complete(row: PriorityRow): Promise<void> {
    await this.run(async () => {
      await this.tasks.setStatus(row.task_id, 'done');
      this.toast.success('Tarefa concluída.');
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
      await this.load();
    } catch (error) {
      this.toast.error(describeError(error));
    } finally {
      this.busy.set(false);
    }
  }

  private async load(): Promise<void> {
    try {
      const [priorities, open] = await Promise.all([
        this.focus.priorities(this.today),
        this.focus.openTasks(),
      ]);
      this.priorities.set(priorities);
      this.openTasks.set(open);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
