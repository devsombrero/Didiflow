import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { UserClock } from '../../../core/profile/user-clock';
import { BarChart, type BarChartData } from '../../../shared/charts/bar-chart';
import { addDays } from '../../../shared/utils/dates';
import { dailyPace, formatDecimalHours, formatHours, type TaskRollup } from '../task-hierarchy';
import type { Task } from '../task.model';
import { TasksService } from '../tasks.service';
import { TimerStore } from '../../time-tracking/time.service';
import { MATERIAL_UI } from '../../../shared/material';

const CHART_DAYS = 14;

/**
 * Hours of a task, calculated automatically from the time entries: tracked
 * (own and with subtasks), today, estimate vs. tracked, the daily pace needed
 * to meet the due date, and hours per day over the last two weeks.
 */
@Component({
  selector: 'app-task-hours-panel',
  imports: [BarChart, MATERIAL_UI],
  template: `
    @if (rollup(); as r) {
      <dl class="stats">
        <div>
          <dt>Registrado</dt>
          <dd>{{ hours(hasChildren() ? r.tree_seconds : r.own_seconds) }}</dd>
          @if (hasChildren()) {
            <span class="hint">{{ hours(r.own_seconds) }} nesta tarefa</span>
          }
        </div>
        <div>
          <dt>Hoje</dt>
          <dd>{{ hours(r.today_seconds) }}</dd>
        </div>
        <div>
          <dt>Estimativa</dt>
          <dd>{{ estimateMinutes() ? hours(estimateMinutes()! * 60) : '—' }}</dd>
          @if (estimateSource() === 'children') {
            <span class="hint">soma dos itens</span>
          }
        </div>
        <div>
          <dt>Ritmo necessário</dt>
          @if (pace(); as p) {
            @if (p.overdue) {
              <dd class="warn">Prazo vencido</dd>
              <span class="hint">{{ decimal(p.remainingHours) }} restantes</span>
            } @else if (p.hoursPerDay !== null) {
              <dd>{{ decimal(p.hoursPerDay) }}/dia</dd>
              <span class="hint">
                {{ decimal(p.remainingHours) }} em {{ p.workingDays }} dia{{
                  p.workingDays === 1 ? '' : 's'
                }}
                úte{{ p.workingDays === 1 ? 'l' : 'is' }}
              </span>
            } @else {
              <dd>{{ decimal(p.remainingHours) }}</dd>
              <span class="hint">restantes · defina a entrega</span>
            }
          } @else {
            <dd>—</dd>
            <span class="hint">defina a estimativa</span>
          }
        </div>
      </dl>
      @if (usage() !== null) {
        <div class="usage">
          <mat-progress-bar
            mode="determinate"
            [value]="usage()!"
            [class.usage--over]="usage()! >= 100"
            aria-label="Horas registradas em relação à estimativa"
          />
          <span class="hint">{{ usage() }}% da estimativa</span>
        </div>
      }
      @if (chart(); as data) {
        <app-bar-chart
          [data]="data"
          [height]="160"
          categoryLabel="Dia"
          ariaLabel="Horas registradas por dia nos últimos 14 dias"
        />
      }
    } @else {
      <mat-progress-bar mode="indeterminate" />
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: var(--space-3);
      margin: 0;
    }
    .stats div {
      display: flex;
      flex-direction: column;
    }
    dt {
      font: var(--mat-sys-label-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    dd {
      margin: 0;
      font: var(--mat-sys-title-large);
      font-variant-numeric: tabular-nums;
    }
    .warn {
      color: var(--mat-sys-error);
    }
    .hint {
      font: var(--mat-sys-body-small);
      color: var(--color-text-muted);
    }
    .usage {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }
    .usage--over {
      --mat-progress-bar-active-indicator-color: var(--mat-sys-error);
    }
  `,
})
export class TaskHoursPanel {
  private readonly tasks = inject(TasksService);
  private readonly clock = inject(UserClock);
  private readonly timer = inject(TimerStore);

  readonly task = input.required<Task>();
  /** Bump to reload (e.g. after time entries or subtasks change). */
  readonly version = input<unknown>(0);

  protected readonly rollup = signal<TaskRollup | null>(null);
  protected readonly daily = signal<{ day: string; seconds: number }[]>([]);

  protected readonly hasChildren = computed(() => (this.rollup()?.children_total ?? 0) > 0);
  protected readonly estimateSource = computed<'own' | 'children' | null>(() => {
    const r = this.rollup();
    if (!r) return null;
    if (r.own_estimate_minutes) return 'own';
    return r.tree_estimate_minutes ? 'children' : null;
  });
  protected readonly estimateMinutes = computed(() => {
    const r = this.rollup();
    return r ? r.own_estimate_minutes || r.tree_estimate_minutes || null : null;
  });
  protected readonly tracked = computed(() => {
    const r = this.rollup();
    return r ? (this.hasChildren() ? r.tree_seconds : r.own_seconds) : 0;
  });
  protected readonly pace = computed(() => {
    const task = this.task();
    if (task.status === 'done' || task.status === 'cancelled') return null;
    return dailyPace({
      estimateMinutes: this.estimateMinutes(),
      trackedSeconds: this.tracked(),
      today: this.clock.today(),
      startDate: task.start_date,
      dueDate: task.due_date,
    });
  });
  protected readonly usage = computed(() => {
    const minutes = this.estimateMinutes();
    return minutes ? Math.round((this.tracked() / (minutes * 60)) * 100) : null;
  });
  protected readonly chart = computed<BarChartData | null>(() => {
    const days = this.daily();
    if (!days.some((d) => d.seconds > 0)) return null;
    return {
      labels: days.map((d) => `${d.day.slice(8, 10)}/${d.day.slice(5, 7)}`),
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
      const id = this.task().id;
      void this.task().updated_at;
      this.version();
      this.timer.version();
      this.timer.entry();
      untracked(() => void this.load(id));
    });
  }

  private async load(id: string): Promise<void> {
    const today = this.clock.today();
    try {
      const [rollup, daily] = await Promise.all([
        this.tasks.rollup(id),
        this.tasks.dailyHours(addDays(today, -(CHART_DAYS - 1)), today, id),
      ]);
      this.rollup.set(
        rollup ?? {
          own_seconds: 0,
          tree_seconds: 0,
          today_seconds: 0,
          own_estimate_minutes: null,
          tree_estimate_minutes: null,
          children_total: 0,
          children_done: 0,
        },
      );
      this.daily.set(daily);
    } catch {
      this.daily.set([]);
    }
  }
}
