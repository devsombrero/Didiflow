import { Component, computed, inject, input, type OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { HasPendingChanges } from '../../../shared/guards/pending-changes.guard';
import { ToastService } from '../../../shared/toast/toast.service';
import { isValidDate } from '../../../shared/utils/dates';
import { describeError } from '../../../shared/utils/errors';
import {
  PRIORITY_LABELS,
  type TaskInsert,
  type TaskWithTags,
  TASK_PRIORITIES,
  type TaskPriority,
} from '../task.model';
import { OrganizationStore } from '../../organization/organization.service';
import { TasksService } from '../tasks.service';
import { dueAfterStart, linkRequiredWhen } from './task-form.validators';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MATERIAL_FORMS, MATERIAL_UI } from '../../../shared/material';
import { MarkdownEditor } from '../../../shared/markdown/markdown-editor';

const blankToNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());

@Component({
  selector: 'app-task-form-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MATERIAL_FORMS,
    MATERIAL_UI,
    MatAutocompleteModule,
    MarkdownEditor,
  ],
  styleUrl: './task-form-page.scss',
  templateUrl: './task-form-page.html',
})
export class TaskFormPage implements OnInit, HasPendingChanges {
  private readonly tasks = inject(TasksService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly org = inject(OrganizationStore);

  /** Route parameter; absent when creating. */
  readonly id = input<string>();
  /** ?due=YYYY-MM-DD prefills the due date when planning from the calendar. */
  readonly due = input<string>();

  protected readonly priorities = TASK_PRIORITIES;
  protected readonly priorityLabels = PRIORITY_LABELS;
  protected readonly state = signal<'loading' | 'ready' | 'not-found' | 'error'>('ready');
  protected readonly saving = signal(false);
  private saved = false;
  /** Project of the task being edited, kept selectable even when archived. */
  private readonly currentProjectId = signal<string | null>(null);
  protected readonly selectedTags = signal<readonly string[]>([]);
  protected readonly projectOptions = computed(() =>
    this.org.items().projects.filter((p) => !p.archived_at || p.id === this.currentProjectId()),
  );

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
      project_id: [''],
      category_id: [''],
      context_id: [''],
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
    void this.org.ensureLoaded().catch(() => undefined);
    const id = this.id();
    if (!id) {
      const due = this.due();
      if (due && isValidDate(due)) this.form.controls.due_date.setValue(due);
      return;
    }

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
      await this.tasks.setTags(task.id, this.selectedTags());
      void this.org.loadRequesters().catch(() => undefined);
      this.saved = true;
      this.toast.success(id ? 'Tarefa atualizada.' : 'Tarefa criada.');
      await this.router.navigate(['/tasks', task.id]);
    } catch (error) {
      this.toast.error(describeError(error, 'Não foi possível salvar a tarefa.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected toggleTag(tagId: string): void {
    this.selectedTags.update((tags) =>
      tags.includes(tagId) ? tags.filter((id) => id !== tagId) : [...tags, tagId],
    );
    this.form.markAsDirty();
  }

  private fill(task: TaskWithTags): void {
    this.currentProjectId.set(task.project_id);
    this.selectedTags.set(task.task_tags.map((t) => t.tag_id));
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
      project_id: task.project_id ?? '',
      category_id: task.category_id ?? '',
      context_id: task.context_id ?? '',
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
      project_id: v.project_id || null,
      category_id: v.category_id || null,
      context_id: v.context_id || null,
    };
  }
}
