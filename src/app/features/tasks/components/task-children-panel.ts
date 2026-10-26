import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  FormGroupDirective,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MarkdownEditor } from '../../../shared/markdown/markdown-editor';
import { MarkdownView } from '../../../shared/markdown/markdown-view';
import { MATERIAL_FORMS } from '../../../shared/material';
import { ToastService } from '../../../shared/toast/toast.service';
import { describeError } from '../../../shared/utils/errors';
import type { Task } from '../task.model';
import { TasksService } from '../tasks.service';
import { MatTabsModule } from '@angular/material/tabs';
import { TaskAttachmentsPanel } from '../../attachments/task-attachments-panel';
import { ProgressBar, StatusBadge } from './task-badges';
import { TaskLinksPanel } from './task-links-panel';

/**
 * Tasks of an epic / subtasks of a task: list with status and progress,
 * Markdown descriptions (shown when expanded, editable in place), quick add
 * with an optional description and one-click completion. The parent's
 * progress is rolled up by the database, so every change is reported.
 */
@Component({
  selector: 'app-task-children-panel',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MATERIAL_FORMS,
    StatusBadge,
    ProgressBar,
    MarkdownEditor,
    MarkdownView,
    MatTabsModule,
    TaskAttachmentsPanel,
    TaskLinksPanel,
  ],
  template: `
    @if (children().length) {
      <div class="summary">
        <span>
          {{ doneCount() }} de {{ activeCount() }} concluída{{ activeCount() === 1 ? '' : 's' }}
        </span>
        <span class="muted">
          O progresso {{ parent().kind === 'epic' ? 'do épico' : 'da tarefa' }} é calculado a partir
          destes itens.
        </span>
      </div>
    }
    <ul class="children">
      @for (child of children(); track child.id) {
        @let open = expanded() === child.id;
        <li
          class="child"
          [class.child--done]="child.status === 'done'"
          animate.enter="enter-fade-up"
          [style.--stagger]="$index"
        >
          <div class="child__row">
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
            @if (child.description) {
              <mat-icon class="child__has-notes" inline matTooltip="Tem descrição">notes</mat-icon>
            } @else {
              <span></span>
            }
            <app-status-badge [status]="child.status" />
            <app-progress-bar class="child__progress" [value]="child.progress_percentage" />
            <button
              matIconButton
              type="button"
              [attr.aria-expanded]="open"
              [attr.aria-label]="(open ? 'Recolher ' : 'Expandir ') + child.title"
              (click)="expand(child)"
            >
              <mat-icon>{{ open ? 'expand_less' : 'expand_more' }}</mat-icon>
            </button>
          </div>
          @if (open) {
            <div class="child__details" animate.enter="enter-fade-up">
              <mat-tab-group
                class="child-tabs attach-tabs"
                animationDuration="150ms"
                mat-stretch-tabs="false"
              >
                <mat-tab>
                  <ng-template mat-tab-label>
                    <mat-icon class="tab-icon">notes</mat-icon> Descrição
                  </ng-template>
                  <div class="tab-body">
                    @if (editingId() === child.id) {
                      <app-markdown-editor
                        [control]="editForm.controls.description"
                        label="Descrição da subtarefa"
                        inputId="child-description-edit"
                        [rows]="5"
                      />
                      <div class="details__actions">
                        <button matButton type="button" (click)="editingId.set(null)">
                          Cancelar
                        </button>
                        <button
                          matButton="filled"
                          type="button"
                          [disabled]="busy() || editForm.invalid"
                          (click)="saveDescription(child)"
                        >
                          Salvar descrição
                        </button>
                      </div>
                    } @else {
                      <app-markdown-view [text]="child.description ?? ''" />
                      <div class="details__actions">
                        <button matButton type="button" (click)="startEdit(child)">
                          <mat-icon>edit_note</mat-icon>
                          {{ child.description ? 'Editar descrição' : 'Adicionar descrição' }}
                        </button>
                      </div>
                    }
                  </div>
                </mat-tab>
                <mat-tab>
                  <ng-template mat-tab-label>
                    <mat-icon class="tab-icon">attach_file</mat-icon> Arquivos
                  </ng-template>
                  <div class="tab-body">
                    <app-task-attachments-panel [taskId]="child.id" />
                  </div>
                </mat-tab>
                <mat-tab>
                  <ng-template mat-tab-label>
                    <mat-icon class="tab-icon">link</mat-icon> Recursos
                  </ng-template>
                  <div class="tab-body">
                    <app-task-links-panel [taskId]="child.id" />
                  </div>
                </mat-tab>
              </mat-tab-group>
            </div>
          }
        </li>
      } @empty {
        <li class="muted empty">{{ emptyText() }}</li>
      }
    </ul>
    @if (canAdd()) {
      <form class="add" [formGroup]="form" (ngSubmit)="add()">
        <div class="add__row">
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
          <button
            matButton
            type="button"
            [attr.aria-pressed]="withDescription()"
            (click)="withDescription.set(!withDescription())"
          >
            <mat-icon>notes</mat-icon>
            {{ withDescription() ? 'Sem descrição' : 'Com descrição' }}
          </button>
          <button matButton="tonal" type="submit" [disabled]="busy() || form.invalid">
            <mat-icon>add</mat-icon> Adicionar
          </button>
        </div>
        @if (withDescription()) {
          <app-markdown-editor
            [control]="form.controls.description"
            label="Descrição (Markdown)"
            inputId="child-description"
            [rows]="4"
          />
        }
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
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .child__row {
      display: grid;
      grid-template-columns: auto 1fr auto auto 120px auto;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-1) 0;
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
    .child__has-notes {
      color: var(--color-text-muted);
    }
    .child__details {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin: 0 0 var(--space-3) 52px;
      padding: var(--space-3) var(--space-4);
      border-radius: 12px;
      background: var(--mat-sys-surface-container);
    }
    .tab-icon {
      margin-right: var(--space-2);
    }
    .tab-body {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      padding-top: var(--space-3);
    }
    .details__actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
    }
    .empty {
      padding: var(--space-2) 0;
    }
    .add {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
    .add__row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-3);
    }
    .add__row mat-form-field {
      flex: 1 1 260px;
    }
    @media (max-width: 640px) {
      .child__row {
        grid-template-columns: auto 1fr auto;
      }
      .child__row app-status-badge,
      .child__progress,
      .child__has-notes,
      .child__row > span:empty {
        display: none;
      }
      .child__details {
        margin-left: 0;
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
  private readonly formDirective = viewChild(FormGroupDirective);
  protected readonly busy = signal(false);
  protected readonly expanded = signal<string | null>(null);
  protected readonly editingId = signal<string | null>(null);
  protected readonly withDescription = signal(false);
  protected readonly form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(200), Validators.pattern(/\S/)]],
    description: ['', Validators.maxLength(10000)],
  });
  protected readonly editForm = this.fb.group({
    description: ['', Validators.maxLength(10000)],
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

  protected expand(child: Task): void {
    this.editingId.set(null);
    this.expanded.update((id) => (id === child.id ? null : child.id));
  }

  protected startEdit(child: Task): void {
    this.editForm.reset({ description: child.description ?? '' });
    this.editingId.set(child.id);
  }

  protected async saveDescription(child: Task): Promise<void> {
    const description = this.editForm.controls.description.value.trim() || null;
    this.busy.set(true);
    try {
      await this.tasks.update(child.id, { description });
      this.editingId.set(null);
      await this.load(this.parent().id);
      this.toast.success('Descrição salva.');
    } catch (error) {
      this.toast.error(describeError(error, 'Não foi possível salvar a descrição.'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async add(): Promise<void> {
    if (this.form.invalid) return;
    const { title, description } = this.form.getRawValue();
    await this.run(async () => {
      await this.tasks.createSubtask(this.parent(), title, description);
      // resetForm also clears the submitted state (no error outline).
      this.formDirective()?.resetForm({ title: '', description: '' });
      this.withDescription.set(false);
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
