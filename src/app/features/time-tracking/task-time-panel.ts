import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ToastService } from '../../shared/toast/toast.service';
import type { Task } from '../tasks/task.model';
import { formatDuration, type TimeEntry, totalSeconds } from './time-calc';
import { describeTimeError } from './time-errors';
import { TimerStore, TimeService } from './time.service';
import { MATERIAL_FORMS } from '../../shared/material';

/** Time spent on one task, compared with its estimate, plus a timer shortcut. */
@Component({
  selector: 'app-task-time-panel',
  imports: [RouterLink, MATERIAL_FORMS],
  template: `
    @if (!compact()) {
      <dl class="facts">
        <dt>Registrado</dt>
        <dd>{{ spentLabel() }}</dd>
        <dt>Estimado</dt>
        <dd>{{ estimateLabel() }}</dd>
        @if (comparison(); as text) {
          <dt>Comparação</dt>
          <dd>{{ text }}</dd>
        }
      </dl>
    }
    <div class="actions">
      @if (runningHere()) {
        <button matButton="filled" type="button" [disabled]="timer.busy()" (click)="stop()">
          <mat-icon>stop_circle</mat-icon> Finalizar cronômetro
        </button>
      } @else if (!timer.running()) {
        <button matButton="tonal" type="button" [disabled]="timer.busy()" (click)="start()">
          <mat-icon>play_circle</mat-icon> Iniciar cronômetro
        </button>
      } @else {
        <span class="field-hint">Há outro cronômetro em andamento.</span>
      }
      <a matButton routerLink="/time">Registrar manualmente</a>
    </div>
  `,
  styles: `
    .facts {
      display: grid;
      grid-template-columns: max-content 1fr;
      gap: var(--space-2) var(--space-4);
      margin: 0 0 var(--space-3);
    }
    .facts dt {
      color: var(--color-text-muted);
    }
    .facts dd {
      margin: 0;
    }
  `,
})
export class TaskTimePanel {
  private readonly time = inject(TimeService);
  private readonly toast = inject(ToastService);
  protected readonly timer = inject(TimerStore);

  readonly task = input.required<Task>();
  /** Only the timer actions (the hours panel shows the totals). */
  readonly compact = input(false);

  private readonly entries = signal<TimeEntry[]>([]);
  protected readonly runningHere = computed(
    () => this.timer.running() && this.timer.entry()?.task_id === this.task().id,
  );
  private readonly spent = computed(() => {
    this.timer.elapsed();
    return totalSeconds(this.entries());
  });
  protected readonly spentLabel = computed(() =>
    this.entries().length ? formatDuration(this.spent()) : 'Nenhum registro',
  );
  protected readonly estimateLabel = computed(() => {
    const minutes = this.task().estimated_minutes;
    return minutes === null ? 'Sem estimativa' : formatDuration(minutes * 60);
  });
  protected readonly comparison = computed(() => {
    const minutes = this.task().estimated_minutes;
    if (!minutes || this.entries().length === 0) return null;
    const ratio = Math.round((this.spent() / (minutes * 60)) * 100);
    return `${ratio}% da estimativa`;
  });

  constructor() {
    effect(() => {
      const id = this.task().id;
      this.timer.version();
      this.timer.entry();
      untracked(() => void this.load(id));
    });
  }

  protected async start(): Promise<void> {
    try {
      await this.timer.start(this.task().id);
      this.toast.success('Cronômetro iniciado.');
    } catch (error) {
      this.toast.error(describeTimeError(error));
    }
  }

  protected async stop(): Promise<void> {
    try {
      await this.timer.stop();
      this.toast.success('Tempo registrado.');
    } catch (error) {
      this.toast.error(describeTimeError(error));
    }
  }

  private async load(taskId: string): Promise<void> {
    try {
      this.entries.set(await this.time.forTask(taskId));
    } catch {
      this.entries.set([]);
    }
  }
}
