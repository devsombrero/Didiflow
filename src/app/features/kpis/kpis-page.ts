import { Component, computed, inject, type OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UserClock } from '../../core/profile/user-clock';
import { type BarChartData, BarChart } from '../../shared/charts/bar-chart';
import { formatDateValue } from '../../shared/utils/format-date';
import { PERIOD_PRESETS, periodFor, type PeriodPreset, previousPeriod } from '../dashboard/metrics';
import { OrganizationStore } from '../organization/organization.service';
import { evaluateGoal, type Goal, GOAL_STATUS_LABELS } from './goals';
import {
  type KpiContext,
  type KpiData,
  type KpiDefinition,
  type KpiId,
  type KpiResult,
  KPIS,
  periodHistory,
} from './kpis';
import { KpisService } from './kpis.service';

interface KpiCard {
  kpi: KpiDefinition;
  result: KpiResult;
  comparison: { text: string; tone: 'better' | 'worse' | 'neutral' } | null;
  goals: { title: string; status: string }[];
}

@Component({
  selector: 'app-kpis-page',
  imports: [RouterLink, BarChart],
  templateUrl: './kpis-page.html',
  styleUrl: './kpis-page.scss',
})
export class KpisPage implements OnInit {
  private readonly service = inject(KpisService);
  private readonly clock = inject(UserClock);
  private readonly org = inject(OrganizationStore);

  protected readonly presets = PERIOD_PRESETS;
  protected readonly preset = signal<PeriodPreset>('30d');
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly data = signal<KpiData>({ tasks: [], history: [], time: [], achievements: [] });
  protected readonly goals = signal<Goal[]>([]);
  protected readonly expanded = signal<KpiId | null>(null);

  protected readonly period = computed(() => periodFor(this.preset(), this.clock.today()));
  protected readonly periodLabel = computed(() => {
    const fmt = (d: string) => formatDateValue(d, this.clock.dateFormat(), this.clock.timeZone());
    return `${fmt(this.period().from)} – ${fmt(this.period().to)}`;
  });

  private readonly ctx = computed<KpiContext>(() => ({
    today: this.clock.today(),
    timeZone: this.clock.timeZone(),
    categoryName: (id) => this.org.byId().get(id)?.name,
  }));

  protected readonly cards = computed<KpiCard[]>(() => {
    const data = this.data();
    const period = this.period();
    const ctx = this.ctx();
    const previous = previousPeriod(period);

    return KPIS.map((kpi) => {
      const result = kpi.compute(data, period, ctx);
      // Trend already compares periods; the late rate is a snapshot of open tasks.
      const before = NO_COMPARISON.includes(kpi.id) ? null : kpi.compute(data, previous, ctx);
      const goals = this.goals()
        .filter((goal) => kpi.metric && goal.metric === kpi.metric)
        .map((goal) => ({
          title: goal.title,
          status: GOAL_STATUS_LABELS[evaluateGoal(goal, data, ctx).status],
        }));
      return { kpi, result, comparison: compare(kpi, result, before), goals };
    });
  });

  protected readonly history = computed<BarChartData | null>(() => {
    const id = this.expanded();
    const kpi = KPIS.find((k) => k.id === id);
    if (!kpi) return null;
    const fmt = (d: string) =>
      formatDateValue(d, this.clock.dateFormat(), this.clock.timeZone()).slice(0, 5);
    const periods = periodHistory(this.period(), 6);
    return {
      labels: periods.map((p) => `${fmt(p.from)}–${fmt(p.to)}`),
      series: [
        {
          label: kpi.name,
          values: periods.map((p) => round(kpi.compute(this.data(), p, this.ctx()).value ?? 0)),
          colorVar: '--series-1',
        },
      ],
    };
  });

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected toggle(id: KpiId): void {
    this.expanded.update((current) => (current === id ? null : id));
  }

  protected async load(): Promise<void> {
    this.state.set('loading');
    try {
      const [data, goals] = await Promise.all([
        this.service.data(),
        this.service.goals(),
        this.org.ensureLoaded().catch(() => undefined),
      ]);
      this.data.set(data);
      this.goals.set(goals);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}

const round = (value: number) => Math.round(value * 10) / 10;
const NO_COMPARISON: readonly KpiId[] = ['productivity_trend', 'late_rate'];

function compare(
  kpi: KpiDefinition,
  current: KpiResult,
  previous: KpiResult | null,
): KpiCard['comparison'] {
  if (!previous || current.value === null || previous.value === null) return null;
  const delta = round(current.value - previous.value);
  if (delta === 0) return { text: 'Igual ao período anterior', tone: 'neutral' };

  const isPercent = current.display.endsWith('%');
  const amount = `${Math.abs(delta).toLocaleString('pt-BR')}${isPercent ? ' p.p.' : ''}`;
  const arrow = delta > 0 ? '▲' : '▼';
  const better = kpi.better === 'neutral' ? null : delta > 0 === (kpi.better === 'higher');
  const verdict = better === null ? '' : better ? ' (melhor)' : ' (pior)';
  return {
    text: `${arrow} ${amount} vs período anterior${verdict}`,
    tone: better === null ? 'neutral' : better ? 'better' : 'worse',
  };
}
