import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ToastService } from '../../shared/toast/toast.service';
import { describeTimeError } from './time-errors';
import { formatClock } from './time-calc';
import { TimerStore } from './time.service';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

/** Compact running-timer control shown in the sidebar. */
@Component({
  selector: 'app-timer-widget',
  imports: [RouterLink, MatIconModule, MatButtonModule, MatTooltipModule],
  template: `
    @if (timer.running()) {
      <div
        class="timer"
        [class.timer--paused]="timer.paused()"
        role="group"
        aria-label="Cronômetro"
      >
        <a class="timer__label" [routerLink]="link()">
          <mat-icon inline>schedule</mat-icon> {{ label() }}
        </a>
        <span class="timer__clock" aria-live="off">{{ clock() }}</span>
        <div class="timer__actions">
          @if (timer.paused()) {
            <button
              matIconButton
              type="button"
              aria-label="Retomar"
              matTooltip="Retomar"
              [disabled]="timer.busy()"
              (click)="run('resume')"
            >
              <mat-icon>play_arrow</mat-icon>
            </button>
          } @else {
            <button
              matIconButton
              type="button"
              aria-label="Pausar"
              matTooltip="Pausar"
              [disabled]="timer.busy()"
              (click)="run('pause')"
            >
              <mat-icon>pause</mat-icon>
            </button>
          }
          <button
            matIconButton
            type="button"
            aria-label="Finalizar"
            matTooltip="Finalizar"
            [disabled]="timer.busy()"
            (click)="run('stop')"
          >
            <mat-icon>stop</mat-icon>
          </button>
        </div>
      </div>
    }
  `,
  styles: `
    .timer {
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      margin: 0 var(--space-2);
      padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
      border-radius: var(--radius-md);
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }
    .timer--paused {
      background: var(--mat-sys-tertiary-container);
      color: var(--mat-sys-on-tertiary-container);
    }
    .timer__label {
      grid-column: 1 / -1;
      overflow: hidden;
      color: inherit;
      font: var(--mat-sys-label-medium);
      text-decoration: none;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .timer__clock {
      font: var(--mat-sys-title-large);
      font-variant-numeric: tabular-nums;
    }
    .timer__actions {
      display: flex;
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
