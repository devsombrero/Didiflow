import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ProfileService } from '../../core/profile/profile.service';
import { UserClock } from '../../core/profile/user-clock';
import { BarChart, type BarChartData } from '../../shared/charts/bar-chart';
import { MATERIAL_UI } from '../../shared/material';
import { addDays } from '../../shared/utils/dates';
import { formatDecimalHours, formatHours } from '../tasks/task-hierarchy';
import { TasksService } from '../tasks/tasks.service';
import { TimerStore } from './time.service';

const DAYS = 14;

export interface DailyHoursSummary {
  todaySeconds: number;
  /** Average over working days that have tracked time. */
  averageSeconds: number;
  daysOnTarget: number;
  workedDays: number;
}

/** Totals for the hours-per-day card (pure, tested). */
export function summarizeDays(
  days: readonly { day: string; seconds: number }[],
  today: string,
  targetHours: number,
): DailyHoursSummary {
  const worked = days.filter((d) => d.seconds > 0);
  const total = worked.reduce((sum, d) => sum + d.seconds, 0);
  return {
    todaySeconds: days.find((d) => d.day === today)?.seconds ?? 0,
    averageSeconds: worked.length ? total / worked.length : 0,
    daysOnTarget: worked.filter((d) => d.seconds >= targetHours * 3600).length,
    workedDays: worked.length,
  };
}

/** Hours tracked per day (last 14 days) against the daily target. */
@Component({
  selector: 'app-daily-hours-card',
  imports: [BarChart, MATERIAL_UI],
  template: `
    <mat-card appearance="outlined" class="section">
      <mat-card-header><mat-card-title>Horas por dia</mat-card-title></mat-card-header>
      <mat-card-content class="body">
        @if (summary(); as s) {
          <div class="today">
            <span class="today__value">{{ hours(s.todaySeconds) }}</span>
            <span class="muted">hoje · meta {{ decimal(target()) }}</span>
          </div>
          <mat-progress-bar
            mode="determinate"
            [value]="todayPercent()"
            [class.done]="todayPercent() >= 100"
            aria-label="Horas de hoje em relação à meta diária"
          />
          <dl class="facts">
            <dt>Média por dia trabalhado</dt>
            <dd>{{ hours(s.averageSeconds) }}</dd>
            <dt>Dias na meta (14 dias)</dt>
            <dd>{{ s.daysOnTarget }} de {{ s.workedDays }}</dd>
          </dl>
          @if (chart(); as data) {
            <app-bar-chart
              [data]="data"
              [height]="150"
              categoryLabel="Dia"
              ariaLabel="Horas registradas por dia nos últimos 14 dias"
            />
          }
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .body {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .today {
      display: flex;
      align-items: baseline;
      gap: var(--space-2);
    }
    .today__value {
      font: var(--mat-sys-headline-small);
      font-variant-numeric: tabular-nums;
    }
    .muted {
      color: var(--color-text-muted);
      font: var(--mat-sys-body-small);
    }
    .done {
      --mat-progress-bar-active-indicator-color: light-dark(#1b8a5a, #5fd39b);
    }
    .facts {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: var(--space-1) var(--space-3);
      margin: 0;
      font: var(--mat-sys-body-small);
    }
    .facts dt {
      color: var(--color-text-muted);
    }
    .facts dd {
      margin: 0;
      text-align: right;
    }
  `,
})
export class DailyHoursCard {
  private readonly tasks = inject(TasksService);
  private readonly clock = inject(UserClock);
  private readonly timer = inject(TimerStore);
  private readonly preferences = inject(ProfileService).preferences;

  private readonly days = signal<{ day: string; seconds: number }[]>([]);
  protected readonly target = computed(() => Number(this.preferences()?.daily_hours_target ?? 8));
  protected readonly summary = computed(() =>
    summarizeDays(this.days(), this.clock.today(), this.target()),
  );
  protected readonly todayPercent = computed(() =>
    Math.min(100, Math.round((this.summary().todaySeconds / (this.target() * 3600)) * 100)),
  );
  protected readonly chart = computed<BarChartData | null>(() => {
    const days = this.days();
    if (!days.some((d) => d.seconds > 0)) return null;
    return {
      labels: days.map((d) => d.day.slice(8, 10)),
      series: [
        {
          label: 'Horas',
          values: days.map((d) => Math.round((d.seconds / 3600) * 10) / 10),
          colorVar: '--series-1',
        },
      ],
    };
  });
  protected readonly hours = formatHours;
  protected readonly decimal = formatDecimalHours;

  constructor() {
    effect(() => {
      this.timer.version();
      this.timer.entry();
      const today = this.clock.today();
      untracked(() => void this.load(today));
    });
  }

  /** Reload after manual entries change (called by the time page). */
  reload(): void {
    void this.load(this.clock.today());
  }

  private async load(today: string): Promise<void> {
    try {
      this.days.set(await this.tasks.dailyHours(addDays(today, -(DAYS - 1)), today));
    } catch {
      this.days.set([]);
    }
  }
}
