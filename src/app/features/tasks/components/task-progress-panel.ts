import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { ToastService } from '../../../shared/toast/toast.service';
import { describeError } from '../../../shared/utils/errors';
import { SELECTABLE_STATUSES, STATUS_LABELS, type Task, type TaskStatus } from '../task.model';
import { canChangeStatus, canComplete, canEditProgress } from '../task-rules';
import { TasksService } from '../tasks.service';
import { ProgressBar } from './task-badges';
import { MATERIAL_FORMS } from '../../../shared/material';

/** Status selector, manual progress slider and "complete" shortcut for one task. */
@Component({
  selector: 'app-task-progress-panel',
  imports: [ProgressBar, MATERIAL_FORMS],
  template: `
    <div class="panel">
      <mat-form-field>
        <mat-label>Status</mat-label>
        <mat-select
          id="task-status"
          [value]="task().status"
          [disabled]="!canChangeStatus() || busy()"
          (selectionChange)="changeStatus($event.value)"
        >
          @if (task().status === 'cancelled') {
            <mat-option value="cancelled">{{ labels.cancelled }}</mat-option>
          }
          @for (status of statuses; track status) {
            <mat-option [value]="status">{{ labels[status] }}</mat-option>
          }
        </mat-select>
      </mat-form-field>

      <div class="field">
        <label for="task-progress" class="field__label">Progresso</label>
        @if (canEditProgress()) {
          <div class="slider">
            <input
              id="task-progress"
              type="range"
              min="0"
              max="100"
              step="5"
              [value]="draft()"
              [disabled]="busy()"
              (input)="draft.set(+$any($event.target).value)"
              (change)="commitProgress()"
            />
            <output for="task-progress">{{ draft() }}%</output>
          </div>
          <span class="field-hint">0% volta para "Não iniciado"; 100% conclui a tarefa.</span>
        } @else {
          <app-progress-bar [value]="task().progress_percentage" />
          <span class="field-hint">{{ lockedHint() }}</span>
        }
      </div>

      @if (canComplete()) {
        <button matButton="filled" type="button" [disabled]="busy()" (click)="changeStatus('done')">
          <mat-icon>task_alt</mat-icon> Marcar como concluída
        </button>
      }
    </div>
  `,
  styles: `
    .panel {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding-top: var(--space-2);
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }
    .field__label {
      font: var(--mat-sys-label-large);
      color: var(--mat-sys-on-surface-variant);
    }
    .slider {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }
    .slider input {
      flex: 1;
    }
    .slider output {
      min-width: 4ch;
      text-align: right;
      font: var(--mat-sys-title-small);
    }
  `,
})
export class TaskProgressPanel {
  private readonly tasks = inject(TasksService);
  private readonly toast = inject(ToastService);

  readonly task = input.required<Task>();
  readonly changed = output<Task>();

  protected readonly statuses = SELECTABLE_STATUSES;
  protected readonly labels = STATUS_LABELS;
  protected readonly busy = signal(false);
  protected readonly draft = signal(0);

  protected readonly canChangeStatus = computed(() => canChangeStatus(this.task()));
  protected readonly canEditProgress = computed(() => canEditProgress(this.task()));
  protected readonly canComplete = computed(() => canComplete(this.task()));
  protected readonly lockedHint = computed(() => {
    switch (this.task().status) {
      case 'blocked':
        return 'Tarefa bloqueada: o progresso alcançado é preservado.';
      case 'cancelled':
        return 'Tarefa cancelada: o progresso atingido fica no histórico.';
      default:
        return 'Tarefa concluída.';
    }
  });

  constructor() {
    effect(() => this.draft.set(this.task().progress_percentage));
  }

  protected async changeStatus(status: TaskStatus): Promise<void> {
    if (status === this.task().status) return;
    await this.save(() => this.tasks.setStatus(this.task().id, status));
  }

  protected async commitProgress(): Promise<void> {
    if (this.draft() === this.task().progress_percentage) return;
    await this.save(() => this.tasks.setProgress(this.task().id, this.draft()));
  }

  private async save(action: () => Promise<Task>): Promise<void> {
    this.busy.set(true);
    try {
      const updated = await action();
      this.changed.emit(updated);
      if (updated.status === 'done' && this.task().status !== 'done') {
        this.toast.success('Tarefa concluída.');
      }
    } catch (error) {
      this.draft.set(this.task().progress_percentage);
      this.toast.error(describeError(error, 'Não foi possível atualizar a tarefa.'));
    } finally {
      this.busy.set(false);
    }
  }
}
