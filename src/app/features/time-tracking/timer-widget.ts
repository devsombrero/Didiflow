import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ToastService } from '../../shared/toast/toast.service';
import { describeTimeError } from './time-errors';
import { formatClock } from './time-calc';
import { TimerStore } from './time.service';

/** Compact running-timer control shown in the sidebar. */
@Component({
  selector: 'app-timer-widget',
  imports: [RouterLink],
  template: `
    @if (timer.running()) {
      <div
        class="timer"
        [class.timer--paused]="timer.paused()"
        role="group"
        aria-label="Cronômetro"
      >
        <a class="timer__label" [routerLink]="link()">{{ label() }}</a>
        <span class="timer__clock" aria-live="off">{{ clock() }}</span>
        <div class="timer__actions">
          @if (timer.paused()) {
            <button
              type="button"
              class="btn btn--sm"
              [disabled]="timer.busy()"
              (click)="run('resume')"
            >
              Retomar
            </button>
          } @else {
            <button
              type="button"
              class="btn btn--sm"
              [disabled]="timer.busy()"
              (click)="run('pause')"
            >
              Pausar
            </button>
          }
          <button
            type="button"
            class="btn btn--sm btn--primary"
            [disabled]="timer.busy()"
            (click)="run('stop')"
          >
            Finalizar
          </button>
        </div>
      </div>
    }
  `,
  styles: `
    .timer {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      padding: var(--space-3);
      border: 1px solid var(--color-primary);
      border-radius: var(--radius-md);
    }
    .timer--paused {
      border-color: var(--color-warning);
    }
    .timer__label {
      overflow: hidden;
      color: var(--color-text);
      font-size: 12px;
      text-decoration: none;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .timer__clock {
      font-size: 20px;
      font-weight: 700;
      font-variant-numeric: tabular-nums;
    }
    .timer__actions {
      display: flex;
      gap: var(--space-1);
    }
  `,
})
export class TimerWidget {
  protected readonly timer = inject(TimerStore);
  private readonly toast = inject(ToastService);

  protected readonly clock = computed(() =>
    this.timer.paused()
      ? `${formatClock(this.timer.elapsed())} ⏸`
      : formatClock(this.timer.elapsed()),
  );
  protected readonly label = computed(() => {
    const entry = this.timer.entry();
    return entry?.tasks?.title ?? entry?.description ?? 'Sem tarefa';
  });
  protected readonly link = computed(() => {
    const taskId = this.timer.entry()?.task_id;
    return taskId ? ['/tasks', taskId] : ['/time'];
  });

  protected async run(action: 'pause' | 'resume' | 'stop'): Promise<void> {
    try {
      await this.timer[action]();
      if (action === 'stop') this.toast.success('Tempo registrado.');
    } catch (error) {
      this.toast.error(describeTimeError(error));
    }
  }
}
