import { inject, Injectable } from '@angular/core';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { ToastService } from '../../shared/toast/toast.service';
import { describeError } from '../../shared/utils/errors';
import type { Task } from './task.model';
import { TasksService } from './tasks.service';

/**
 * User-facing task actions: asks for confirmation where needed, calls the
 * service and reports the outcome. Each method resolves to the updated task,
 * `null` for a deletion, or `undefined` when cancelled or failed.
 */
@Injectable({ providedIn: 'root' })
export class TaskActions {
  private readonly tasks = inject(TasksService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  async duplicate(task: Task): Promise<Task | undefined> {
    return this.run(() => this.tasks.duplicate(task), 'Tarefa duplicada.');
  }

  async cancel(task: Task): Promise<Task | undefined> {
    const confirmed = await this.confirm.ask({
      title: 'Cancelar tarefa?',
      message: `"${task.title}" será marcada como cancelada. O progresso atingido é mantido no histórico e você poderá reabri-la depois.`,
      confirmLabel: 'Cancelar tarefa',
      danger: true,
    });
    if (!confirmed) return undefined;
    return this.run(() => this.tasks.cancel(task), 'Tarefa cancelada.');
  }

  async reopen(task: Task): Promise<Task | undefined> {
    return this.run(() => this.tasks.reopen(task), 'Tarefa reaberta.');
  }

  async archive(task: Task): Promise<Task | undefined> {
    return this.run(() => this.tasks.archive(task.id), 'Tarefa arquivada.');
  }

  async unarchive(task: Task): Promise<Task | undefined> {
    return this.run(() => this.tasks.unarchive(task.id), 'Tarefa restaurada do arquivo.');
  }

  async remove(task: Task): Promise<null | undefined> {
    const confirmed = await this.confirm.ask({
      title: 'Excluir tarefa?',
      message: `"${task.title}" será removida das suas listas e indicadores. O registro de auditoria é preservado.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!confirmed) return undefined;
    const done = await this.run(async () => {
      await this.tasks.remove(task.id);
      return true;
    }, 'Tarefa excluída.');
    return done ? null : undefined;
  }

  private async run<T>(action: () => Promise<T>, success: string): Promise<T | undefined> {
    try {
      const result = await action();
      this.toast.success(success);
      return result;
    } catch (error) {
      this.toast.error(describeError(error));
      return undefined;
    }
  }
}
