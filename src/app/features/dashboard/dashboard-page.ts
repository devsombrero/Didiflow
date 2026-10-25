import { Component, computed, effect, inject, type OnInit, signal, untracked } from '@angular/core';
import { MATERIAL_FORMS, MATERIAL_UI } from '../../shared/material';
import { RouterLink } from '@angular/router';
import { UserClock } from '../../core/profile/user-clock';
import { ProfileService } from '../../core/profile/profile.service';
import { type BarChartData, BarChart } from '../../shared/charts/bar-chart';
import { describeError } from '../../shared/utils/errors';
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from '../tasks/task.model';
import { OrganizationStore } from '../organization/organization.service';
import { formatDuration, totalSeconds } from '../time-tracking/time-calc';
import { DashboardService, type MetricTimeEntry } from './dashboard.service';
import {
  applyFilters,
  deliveryBuckets,
  type Granularity,
  type MetricTask,
  NO_FILTERS,
  openByPriority,
  PERIOD_PRESETS,
  periodFor,
  type PeriodPreset,
  statusDistribution,
  summarize,
} from './metrics';

@Component({
  selector: 'app-dashboard-page',
  imports: [RouterLink, BarChart, MATERIAL_FORMS, MATERIAL_UI],
  templateUrl: './dashboard-page.html',
  styleUrl: './dashboard-page.scss',
})
export class DashboardPage implements OnInit {
  private readonly dashboard = inject(DashboardService);
  private readonly clock = inject(UserClock);
  private readonly profile = inject(ProfileService).profile;
  protected readonly org = inject(OrganizationStore);

  protected readonly presets = PERIOD_PRESETS;
  protected readonly statuses = TASK_STATUSES;
  protected readonly priorities = TASK_PRIORITIES;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly priorityLabels = PRIORITY_LABELS;

  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly errorMessage = signal('');
  protected readonly tasks = signal<MetricTask[]>([]);
  protected readonly timeEntries = signal<MetricTimeEntry[]>([]);
  protected readonly preset = signal<PeriodPreset>('30d');
  protected readonly granularity = signal<Granularity>('week');
  protected readonly statusFilter = signal<TaskStatus | ''>('');
  protected readonly priorityFilter = signal<TaskPriority | ''>('');
  protected readonly projectFilter = signal('');
  protected readonly categoryFilter = signal('');

  protected readonly greeting = computed(() => {
    const name = this.profile()?.display_name;
    return name ? `Olá, ${name}` : 'Olá';
  });
  protected readonly period = computed(() => periodFor(this.preset(), this.clock.today()));
  protected readonly filtered = computed(() =>
    applyFilters(this.tasks(), {
      ...NO_FILTERS,
      statuses: this.statusFilter() ? [this.statusFilter() as TaskStatus] : [],
      priorities: this.priorityFilter() ? [this.priorityFilter() as TaskPriority] : [],
      projectId: this.projectFilter() || null,
      categoryId: this.categoryFilter() || null,
    }),
  );
  protected readonly summary = computed(() =>
    summarize(this.filtered(), {
      period: this.period(),
      today: this.clock.today(),
      timeZone: this.clock.timeZone(),
      dueSoonDays: this.clock.dueSoonDays(),
    }),
  );
  protected readonly dueSoonDays = this.clock.dueSoonDays;

  protected readonly deliveries = computed<BarChartData>(() => {
    const buckets = deliveryBuckets(
      this.filtered(),
      this.period(),
      this.clock.timeZone(),
      this.granularity(),
    );
    return {
      labels: buckets.map((b) => b.label),
      series: [
        { label: 'No prazo', values: buckets.map((b) => b.onTime), colorVar: '--series-1' },
        { label: 'Com atraso', values: buckets.map((b) => b.late), colorVar: '--series-2' },
        {
          label: 'Sem prazo definido',
          values: buckets.map((b) => b.noDueDate),
          colorVar: '--series-3',
        },
      ],
    };
  });

  protected readonly byStatus = computed<BarChartData>(() => {
    const counts = statusDistribution(this.filtered());
    return {
      labels: TASK_STATUSES.map((s) => STATUS_LABELS[s]),
      series: [
        { label: 'Tarefas', values: TASK_STATUSES.map((s) => counts[s]), colorVar: '--series-1' },
      ],
    };
  });

  protected readonly byPriority = computed<BarChartData>(() => {
    const counts = openByPriority(this.filtered());
    const order = [...TASK_PRIORITIES].reverse();
    return {
      labels: order.map((p) => PRIORITY_LABELS[p]),
      series: [
        { label: 'Tarefas abertas', values: order.map((p) => counts[p]), colorVar: '--series-1' },
      ],
    };
  });

  /** Time in the period for entries whose task matches the filters (or no task when unfiltered). */
  protected readonly timeInvested = computed(() => {
    const filtered = this.hasFilters();
    const status = this.statusFilter();
    const priority = this.priorityFilter();
    const project = this.projectFilter();
    const category = this.categoryFilter();
    const entries = this.timeEntries().filter((entry) => {
      if (!filtered) return true;
      const task = entry.tasks;
      if (!task) return false;
      return (
        (!status || task.status === status) &&
        (!priority || task.priority === priority) &&
        (!project || task.project_id === project) &&
        (!category || task.category_id === category)
      );
    });
    return entries.length ? formatDuration(totalSeconds(entries)) : null;
  });

  protected readonly hasFilters = computed(
    () =>
      !!this.statusFilter() ||
      !!this.priorityFilter() ||
      !!this.projectFilter() ||
      !!this.categoryFilter(),
  );

  constructor() {
    // Reload time entries whenever the period changes.
    effect(() => {
      const period = this.period();
      const timeZone = this.clock.timeZone();
      untracked(() => {
        this.dashboard
          .timeEntries(period, timeZone)
          .then((entries) => this.timeEntries.set(entries))
          .catch(() => this.timeEntries.set([]));
      });
    });
  }

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected formatPercent(value: number | null): string {
    return value === null ? '—' : `${value.toLocaleString('pt-BR')}%`;
  }

  protected clearFilters(): void {
    this.statusFilter.set('');
    this.priorityFilter.set('');
    this.projectFilter.set('');
    this.categoryFilter.set('');
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      const [tasks] = await Promise.all([
        this.dashboard.metricTasks(),
        this.org.ensureLoaded().catch(() => undefined),
      ]);
      this.tasks.set(tasks);
      this.state.set('ready');
    } catch (error) {
      this.errorMessage.set(describeError(error, 'Não foi possível carregar o dashboard.'));
      this.state.set('error');
    }
  }
}
