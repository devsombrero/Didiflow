import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MATERIAL_FORMS } from '../../../shared/material';
import { ToastService } from '../../../shared/toast/toast.service';
import { describeError } from '../../../shared/utils/errors';
import type { Task } from '../task.model';
import { TasksService } from '../tasks.service';
import { ProgressBar, StatusBadge } from './task-badges';

/**
 * Tasks of an epic / subtasks of a task: list with status and progress,
 * quick add and one-click completion. The parent's progress is rolled up by
 * the database, so every change is reported through `changed`.
 */
@Component({
  selector: 'app-task-children-panel',
  imports: [ReactiveFormsModule, RouterLink, MATERIAL_FORMS, StatusBadge, ProgressBar],
  template: `
    @if (children().length) {
      <div class="summary">
        <span
          >{{ doneCount() }} de {{ activeCount() }} concluída{{
            activeCount() === 1 ? '' : 's'
          }}</span
        >
        <span class="muted"
          >O progresso {{ parent().kind === 'epic' ? 'do épico' : 'da tarefa' }} é calculado a
          partir destes itens.</span
        >
      </div>
    }
    <ul class="children">
      @for (child of children(); track child.id) {
        <li
          class="child"
          [class.child--done]="child.status === 'done'"
          animate.enter="enter-fade-up"
          [style.--stagger]="$index"
        >
          <button
            matIconButton
            type="button"
            class="child__check"
            [disabled]="busy() || child.status === 'cancelled'"
            [attr.aria-label]="(child.status === 'done' ? 'Reabrir ' : 'Concluir ') + child.title"
            (click)="toggle(child)"
          >
            <mat-icon>{{
              child.status === 'done' ? 'check_circle' : 'radio_button_unchecked'
            }}</mat-icon>
          </button>
          <a class="child__title" [routerLink]="['/tasks', child.id]">{{ child.title }}</a>
          <app-status-badge [status]="child.status" />
          <app-progress-bar class="child__progress" [value]="child.progress_percentage" />
        </li>
      } @empty {
        <li class="muted empty">{{ emptyText() }}</li>
      }
    </ul>
    @if (canAdd()) {
      <form class="add" [formGroup]="form" (ngSubmit)="add()">
        <mat-form-field subscriptSizing="dynamic">
          <mat-label>{{
            parent().kind === 'epic' ? 'Nova tarefa do épico' : 'Nova subtarefa'
          }}</mat-label>
          <input
            matInput
            id="child-title"
            formControlName="title"
            maxlength="200"
            autocomplete="off"
          />
        </mat-form-field>
        <button matButton="tonal" type="submit" [disabled]="busy() || form.invalid">
          <mat-icon>add</mat-icon> Adicionar
        </button>
      </form>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .summary {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: var(--space-2);
      font: var(--mat-sys-label-large);
    }
    .muted {
      color: var(--color-text-muted);
      font: var(--mat-sys-body-small);
    }
    .children {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .child {
      display: grid;
      grid-template-columns: auto 1fr auto 120px;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-1) 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .child--done .child__title {
      text-decoration: line-through;
      color: var(--color-text-muted);
    }
    .child__check mat-icon {
      color: var(--mat-sys-primary);
    }
    .child__title {
      color: inherit;
      text-decoration: none;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .child__title:hover {
      text-decoration: underline;
    }
    .empty {
      padding: var(--space-2) 0;
    }
    .add {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-3);
    }
    .add mat-form-field {
      flex: 1 1 260px;
    }
    @media (max-width: 640px) {
      .child {
        grid-template-columns: auto 1fr;
      }
      .child app-status-badge,
      .child__progress {
        display: none;
      }
    }
  `,
})
export class TaskChildrenPanel {
  private readonly tasks = inject(TasksService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly parent = input.required<Task>();
  /** Depth of the parent (0 = top level); subtasks of a subtask are not allowed. */
  readonly depth = input(0);
  /** Emitted with the active children count after loading or any change. */
  readonly changed = output<number>();
  /** Emitted after the user added or completed an item (parent progress changed). */
  readonly updated = output<void>();

  protected readonly children = signal<Task[]>([]);
  protected readonly busy = signal(false);
  protected readonly form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(200), Validators.pattern(/\S/)]],
  });

  protected readonly activeCount = computed(
    () => this.children().filter((c) => c.status !== 'cancelled').length,
  );
  protected readonly doneCount = computed(
    () => this.children().filter((c) => c.status === 'done').length,
  );
  protected readonly canAdd = computed(
    () => this.depth() < 2 && this.parent().status !== 'cancelled',
  );
  protected readonly emptyText = computed(() =>
    !this.canAdd()
      ? 'Subtarefas não podem ter outro nível.'
      : this.parent().kind === 'epic'
        ? 'Nenhuma tarefa neste épico.'
        : 'Nenhuma subtarefa.',
  );

  constructor() {
    effect(() => {
      const id = this.parent().id;
      untracked(() => void this.load(id));
    });
  }

  protected async add(): Promise<void> {
    if (this.form.invalid) return;
    await this.run(async () => {
      await this.tasks.createSubtask(this.parent(), this.form.controls.title.value);
      this.form.reset({ title: '' });
    });
  }

  protected async toggle(child: Task): Promise<void> {
    await this.run(() =>
      child.status === 'done'
        ? this.tasks.setStatus(child.id, 'in_progress')
        : this.tasks.setStatus(child.id, 'done'),
    );
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    this.busy.set(true);
    try {
      await action();
      await this.load(this.parent().id);
      this.updated.emit();
    } catch (error) {
      this.toast.error(describeError(error, 'Não foi possível atualizar as subtarefas.'));
    } finally {
      this.busy.set(false);
    }
  }

  private async load(id: string): Promise<void> {
    try {
      this.children.set(await this.tasks.children(id));
      this.changed.emit(this.activeCount());
    } catch (error) {
      this.toast.error(describeError(error, 'Não foi possível carregar as subtarefas.'));
    }
  }
}
