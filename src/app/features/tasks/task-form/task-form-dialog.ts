import { Component, inject, Injectable, viewChild } from '@angular/core';
import { MatIconButton } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialog,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatIcon } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ConfirmService } from '../../../shared/confirm/confirm.service';
import { FULL_SCREEN_DIALOG, isCompactScreen } from '../../../shared/dialog/form-dialog';
import type { Task } from '../task.model';
import { TaskFormPage } from './task-form-page';

export interface TaskFormDialogData {
  /** Task to edit; absent when creating. */
  id?: string;
  /** YYYY-MM-DD prefilled as due date (planning from the calendar). */
  due?: string;
}

/** Task form in a floating dialog. Closing with unsaved changes asks first. */
@Component({
  selector: 'app-task-form-dialog',
  imports: [MatDialogTitle, MatDialogContent, MatIconButton, MatIcon, MatTooltip, TaskFormPage],
  template: `
    <div class="dialog-head">
      <h2 mat-dialog-title>{{ data.id ? 'Editar tarefa' : 'Nova tarefa' }}</h2>
      <button
        matIconButton
        type="button"
        matTooltip="Fechar (Esc)"
        aria-label="Fechar"
        (click)="close()"
      >
        <mat-icon>close</mat-icon>
      </button>
    </div>
    <mat-dialog-content>
      <app-task-form-page
        [id]="data.id"
        [due]="data.due"
        [embedded]="true"
        (saved)="ref.close($event)"
        (cancelled)="close()"
      />
    </mat-dialog-content>
  `,
  styles: `
    .dialog-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding-right: var(--space-3);
    }
    mat-dialog-content {
      max-height: calc(92vh - 72px);
      padding-bottom: 0;
    }
  `,
})
export class TaskFormDialog {
  protected readonly data = inject<TaskFormDialogData>(MAT_DIALOG_DATA);
  protected readonly ref = inject<MatDialogRef<TaskFormDialog, Task>>(MatDialogRef);
  private readonly confirm = inject(ConfirmService);
  private readonly form = viewChild(TaskFormPage);
  private closing = false;

  constructor() {
    // Backdrop click and Esc go through the unsaved-changes check.
    this.ref.backdropClick().subscribe(() => void this.close());
    this.ref.keydownEvents().subscribe((event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        void this.close();
      }
    });
  }

  async close(): Promise<void> {
    if (this.closing) return;
    if (this.form()?.hasPendingChanges()) {
      this.closing = true;
      const discard = await this.confirm.ask({
        title: 'Descartar alterações?',
        message: 'As alterações desta tarefa ainda não foram salvas.',
        confirmLabel: 'Descartar',
        danger: true,
      });
      this.closing = false;
      if (!discard) return;
    }
    this.ref.close();
  }
}

/** Opens the task form dialog. Creating a task opens its detail page afterwards. */
@Injectable({ providedIn: 'root' })
export class TaskFormDialogs {
  private readonly dialog = inject(MatDialog);
  private readonly router = inject(Router);

  /** Resolves with the saved task, or undefined when closed without saving. */
  async open(data: TaskFormDialogData = {}): Promise<Task | undefined> {
    const ref = this.dialog.open<TaskFormDialog, TaskFormDialogData, Task>(TaskFormDialog, {
      data,
      width: 'min(960px, 94vw)',
      maxWidth: '94vw',
      maxHeight: '92vh',
      panelClass: 'form-dialog',
      disableClose: true,
      autoFocus: 'dialog',
      ...(isCompactScreen() ? FULL_SCREEN_DIALOG : {}),
    });
    return firstValueFrom(ref.afterClosed());
  }

  /** New task in a dialog; after saving, shows its detail page. */
  async create(due?: string): Promise<Task | undefined> {
    const task = await this.open({ due });
    if (task) await this.router.navigate(['/tasks', task.id]);
    return task;
  }

  edit(id: string): Promise<Task | undefined> {
    return this.open({ id });
  }
}
