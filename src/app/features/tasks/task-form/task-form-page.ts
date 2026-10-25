import { Component, inject, input, type OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { HasPendingChanges } from '../../../shared/guards/pending-changes.guard';
import { ToastService } from '../../../shared/toast/toast.service';
import { describeError } from '../../../shared/utils/errors';
import {
  PRIORITY_LABELS,
  type Task,
  type TaskInsert,
  TASK_PRIORITIES,
  type TaskPriority,
} from '../task.model';
import { TasksService } from '../tasks.service';
import { dueAfterStart, linkRequiredWhen } from './task-form.validators';

const blankToNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());

@Component({
  selector: 'app-task-form-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './task-form-page.html',
})
export class TaskFormPage implements OnInit, HasPendingChanges {
  private readonly tasks = inject(TasksService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(NonNullableFormBuilder);

  /** Route parameter; absent when creating. */
  readonly id = input<string>();

  protected readonly priorities = TASK_PRIORITIES;
  protected readonly priorityLabels = PRIORITY_LABELS;
  protected readonly state = signal<'loading' | 'ready' | 'not-found' | 'error'>('ready');
  protected readonly saving = signal(false);
  private saved = false;

  protected readonly form = this.fb.group(
    {
      title: ['', [Validators.required, Validators.maxLength(200), Validators.pattern(/\S/)]],
      description: ['', Validators.maxLength(10000)],
      priority: this.fb.control<TaskPriority>('medium'),
      requested_at: [''],
      requester_name: ['', Validators.maxLength(120)],
      has_jira_card: [false],
      jira_url: [''],
      has_slack_thread: [false],
      slack_thread_url: [''],
      start_date: [''],
      due_date: [''],
      estimated_hours: this.fb.control<number | null>(null, [
        Validators.min(0),
        Validators.max(10000),
      ]),
      notes: ['', Validators.maxLength(10000)],
    },
    {
      validators: [
        linkRequiredWhen('has_jira_card', 'jira_url', 'jiraUrl'),
        linkRequiredWhen('has_slack_thread', 'slack_thread_url', 'slackUrl'),
        dueAfterStart,
      ],
    },
  );

  async ngOnInit(): Promise<void> {
    const id = this.id();
    if (!id) return;

    this.state.set('loading');
    try {
      const task = await this.tasks.get(id);
      if (!task) {
        this.state.set('not-found');
        return;
      }
      this.fill(task);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }

  hasPendingChanges(): boolean {
    return this.form.dirty && !this.saved;
  }

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.saving.set(true);
    try {
      const input = this.toInput();
      const id = this.id();
      const task = id ? await this.tasks.update(id, input) : await this.tasks.create(input);
      this.saved = true;
      this.toast.success(id ? 'Tarefa atualizada.' : 'Tarefa criada.');
      await this.router.navigate(['/tasks', task.id]);
    } catch (error) {
      this.toast.error(describeError(error, 'Não foi possível salvar a tarefa.'));
    } finally {
      this.saving.set(false);
    }
  }

  private fill(task: Task): void {
    this.form.reset({
      title: task.title,
      description: task.description ?? '',
      priority: task.priority,
      requested_at: task.requested_at ?? '',
      requester_name: task.requester_name ?? '',
      has_jira_card: task.has_jira_card,
      jira_url: task.jira_url ?? '',
      has_slack_thread: task.has_slack_thread,
      slack_thread_url: task.slack_thread_url ?? '',
      start_date: task.start_date ?? '',
      due_date: task.due_date ?? '',
      estimated_hours:
        task.estimated_minutes === null
          ? null
          : Math.round((task.estimated_minutes / 60) * 100) / 100,
      notes: task.notes ?? '',
    });
  }

  private toInput(): TaskInsert {
    const v = this.form.getRawValue();
    return {
      title: v.title.trim(),
      description: blankToNull(v.description),
      priority: v.priority,
      requested_at: v.requested_at || null,
      requester_name: blankToNull(v.requester_name),
      has_jira_card: v.has_jira_card,
      jira_url: v.has_jira_card ? v.jira_url.trim() : null,
      has_slack_thread: v.has_slack_thread,
      slack_thread_url: v.has_slack_thread ? v.slack_thread_url.trim() : null,
      start_date: v.start_date || null,
      due_date: v.due_date || null,
      estimated_minutes: v.estimated_hours === null ? null : Math.round(v.estimated_hours * 60),
      notes: blankToNull(v.notes),
    };
  }
}
