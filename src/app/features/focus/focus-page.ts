import { Component, computed, inject, input, type OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { ToastService } from '../../shared/toast/toast.service';
import { describeError } from '../../shared/utils/errors';
import type { Task } from '../tasks/task.model';
import { TasksService } from '../tasks/tasks.service';
import { formatClock } from '../time-tracking/time-calc';
import { type FocusSession, FocusService, FocusStore } from './focus.service';

const PRESETS = [25, 50, 90];

@Component({
  selector: 'app-focus-page',
  imports: [ReactiveFormsModule, RouterLink, AppDatePipe],
  templateUrl: './focus-page.html',
  styleUrl: './focus-page.scss',
})
export class FocusPage implements OnInit {
  private readonly service = inject(FocusService);
  private readonly tasks = inject(TasksService);
  private readonly toast = inject(ToastService);
  protected readonly store = inject(FocusStore);

  /** ?task=<id> preselects the task. */
  readonly task = input<string>();

  protected readonly presets = PRESETS;
  protected readonly taskOptions = signal<Pick<Task, 'id' | 'title'>[]>([]);
  protected readonly history = signal<(FocusSession & { tasks: { title: string } | null })[]>([]);
  protected readonly starting = signal(false);
  protected readonly clock = computed(() => formatClock(this.store.remaining()));
  protected readonly finishedMessage = computed(() => {
    const finished = this.store.finished();
    if (!finished) return '';
    const where = finished.taskTitle ? ` em "${finished.taskTitle}"` : '';
    return finished.completed
      ? `Sessão concluída${where}. Que tal uma pausa curta?`
      : `Sessão interrompida${where}.`;
  });
  protected readonly progress = computed(() => {
    const active = this.store.active();
    if (!active) return 0;
    const total = active.plannedMinutes * 60;
    return Math.round(((total - this.store.remaining()) / total) * 100);
  });

  protected readonly form = inject(NonNullableFormBuilder).group({
    task_id: [''],
    minutes: [25, [Validators.required, Validators.min(1), Validators.max(240)]],
    record: [true],
    log_time: [true],
  });

  async ngOnInit(): Promise<void> {
    const preset = this.task();
    if (preset) this.form.controls.task_id.setValue(preset);
    try {
      const [options, history] = await Promise.all([
        this.tasks.openOptions(),
        this.service.recentSessions(),
      ]);
      this.taskOptions.set(options);
      this.history.set(history);
    } catch {
      // The form still works without suggestions or history.
    }
  }

  protected async start(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { task_id, minutes, record, log_time } = this.form.getRawValue();
    const title = this.taskOptions().find((t) => t.id === task_id)?.title ?? null;
    this.starting.set(true);
    try {
      await this.store.start({
        taskId: task_id || null,
        taskTitle: title,
        minutes,
        record,
        logTime: log_time,
      });
    } catch (error) {
      this.toast.error(
        (error as { code?: string }).code === '23505'
          ? 'Já existe uma sessão de foco em andamento.'
          : describeError(error),
      );
    } finally {
      this.starting.set(false);
    }
  }

  protected async stop(): Promise<void> {
    try {
      await this.store.finish(false);
      this.history.set(await this.service.recentSessions());
    } catch (error) {
      this.toast.error(describeError(error));
    }
  }

  protected durationOf(session: FocusSession): number {
    if (!session.ended_at) return 0;
    return Math.round((Date.parse(session.ended_at) - Date.parse(session.started_at)) / 60_000);
  }
}
