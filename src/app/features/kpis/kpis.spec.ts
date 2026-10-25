import type { MetricTask } from '../dashboard/metrics';
import { evaluateGoal } from './goals';
import { type KpiData, type KpiId, KPIS, metricValue, periodHistory } from './kpis';

let seq = 0;
const task = (overrides: Partial<MetricTask>): MetricTask => ({
  id: `t${++seq}`,
  status: 'not_started',
  priority: 'medium',
  progress_percentage: 0,
  start_date: null,
  due_date: null,
  completed_at: null,
  archived_at: null,
  category_id: null,
  project_id: null,
  estimated_minutes: null,
  ...overrides,
});

const period = { from: '2026-10-01', to: '2026-10-31' };
const ctx = {
  today: '2026-10-25',
  timeZone: 'UTC',
  categoryName: (id: string) => ({ c1: 'Desenvolvimento' })[id],
};
const empty: KpiData = { tasks: [], history: [], time: [], achievements: [] };
const run = (id: KpiId, data: KpiData) => KPIS.find((k) => k.id === id)!.compute(data, period, ctx);

describe('KPI definitions', () => {
  it('documents every indicator', () => {
    expect(KPIS).toHaveLength(10);
    for (const kpi of KPIS) {
      expect(kpi.name && kpi.description && kpi.formula).toBeTruthy();
    }
  });

  it('reports insufficient data instead of inventing values on an empty account', () => {
    for (const id of [
      'on_time_rate',
      'late_rate',
      'lead_time',
      'cycle_time',
      'predictability',
      'rework_rate',
      'effort_distribution',
      'productivity_trend',
      'learning',
    ] as KpiId[]) {
      const result = run(id, empty);
      expect(result.insufficient, id).toBeTruthy();
    }
    const deliveries = run('deliveries', empty);
    expect(deliveries.value).toBe(0);
    expect(deliveries.insufficient).toBeUndefined();
  });
});

describe('delivery KPIs', () => {
  const done = (completed: string, extra: Partial<MetricTask> = {}) =>
    task({ status: 'done', completed_at: `${completed}T12:00:00Z`, ...extra });

  it('ignores cancelled tasks and tasks without completion', () => {
    const data = {
      ...empty,
      tasks: [
        done('2026-10-05'),
        task({ status: 'cancelled', progress_percentage: 50 }),
        task({ status: 'in_progress', progress_percentage: 50 }),
      ],
    };
    expect(run('deliveries', data).value).toBe(1);
  });

  it('computes on-time rate only over tasks with a due date', () => {
    const data = {
      ...empty,
      tasks: [
        done('2026-10-05', { due_date: '2026-10-05' }),
        done('2026-10-08', { due_date: '2026-10-06' }),
        done('2026-10-09'),
      ],
    };
    expect(run('on_time_rate', data)).toMatchObject({ value: 50, detail: '1 de 2 entregas' });
  });

  it('computes the current late rate and the historical count', () => {
    const data = {
      ...empty,
      tasks: [
        task({ status: 'in_progress', progress_percentage: 10, due_date: '2026-10-20' }),
        task({ status: 'blocked', progress_percentage: 10, due_date: '2026-11-20' }),
        task({ status: 'in_progress', progress_percentage: 10 }),
        done('2026-10-08', { due_date: '2026-10-06' }),
      ],
    };
    const result = run('late_rate', data);
    expect(result.value).toBe(50);
    expect(result.detail).toContain('1 entrega(s) atrasada(s)');
  });

  it('computes lead time from start date to completion, skipping tasks without start', () => {
    const data = {
      ...empty,
      tasks: [
        done('2026-10-10', { start_date: '2026-10-06' }),
        done('2026-10-10', { start_date: '2026-10-08' }),
        done('2026-10-10'),
      ],
    };
    expect(run('lead_time', data).value).toBe(3);
  });

  it('computes cycle time from the first in-progress transition', () => {
    const t = done('2026-10-10', { id: 'cy' });
    const data = {
      ...empty,
      tasks: [t],
      history: [
        {
          task_id: 'cy',
          from_status: 'not_started',
          to_status: 'in_progress',
          changed_at: '2026-10-07T12:00:00Z',
        },
        {
          task_id: 'cy',
          from_status: 'blocked',
          to_status: 'in_progress',
          changed_at: '2026-10-09T12:00:00Z',
        },
      ],
    };
    expect(run('cycle_time', data).value).toBe(3);
  });

  it('computes predictability only for tasks with estimate and logged time', () => {
    const data: KpiData = {
      ...empty,
      tasks: [
        done('2026-10-10', { id: 'p1', estimated_minutes: 60 }),
        done('2026-10-10', { id: 'p2', estimated_minutes: null }),
        done('2026-10-10', { id: 'p3', estimated_minutes: 120 }),
      ],
      time: [
        {
          task_id: 'p1',
          category_id: null,
          started_at: '2026-10-09T10:00:00Z',
          ended_at: '2026-10-09T11:30:00Z',
          paused_at: null,
          paused_seconds: 0,
          duration_seconds: 5400,
        },
        {
          task_id: 'p2',
          category_id: null,
          started_at: '2026-10-09T10:00:00Z',
          ended_at: '2026-10-09T11:00:00Z',
          paused_at: null,
          paused_seconds: 0,
          duration_seconds: 3600,
        },
      ],
    };
    expect(run('predictability', data).value).toBe(150);
  });

  it('counts reopenings after completion as rework (not cancel/reopen)', () => {
    const data = {
      ...empty,
      tasks: [done('2026-10-10'), done('2026-10-12')],
      history: [
        {
          task_id: 'x',
          from_status: 'done',
          to_status: 'in_progress',
          changed_at: '2026-10-11T00:00:00Z',
        },
        {
          task_id: 'y',
          from_status: 'cancelled',
          to_status: 'in_progress',
          changed_at: '2026-10-11T00:00:00Z',
        },
        {
          task_id: 'z',
          from_status: 'done',
          to_status: 'cancelled',
          changed_at: '2026-10-11T00:00:00Z',
        },
      ],
    };
    expect(run('rework_rate', data).value).toBe(50);
  });

  it('compares deliveries with the previous equivalent period', () => {
    const data = {
      ...empty,
      tasks: [
        done('2026-10-05'),
        done('2026-10-06'),
        done('2026-10-07'),
        done('2026-09-20'),
        done('2026-09-21'),
      ],
    };
    expect(run('productivity_trend', data)).toMatchObject({ value: 50, display: '+50%' });
  });
});

describe('effort and learning', () => {
  it('distributes logged time by category', () => {
    const entry = (category: string | null, seconds: number) => ({
      task_id: 't',
      category_id: category,
      started_at: '2026-10-09T10:00:00Z',
      ended_at: '2026-10-09T11:00:00Z',
      paused_at: null,
      paused_seconds: 0,
      duration_seconds: seconds,
    });
    const result = run('effort_distribution', {
      ...empty,
      time: [entry('c1', 5400), entry(null, 1800)],
    });
    expect(result.value).toBe(2);
    expect(result.breakdown?.map((b) => b.label)).toEqual(['Desenvolvimento', 'Sem categoria']);
  });

  it('counts achievements by kind', () => {
    const result = run('learning', {
      ...empty,
      achievements: [
        { achieved_on: '2026-10-02', kind: 'course' },
        { achieved_on: '2026-10-03', kind: 'course' },
        { achieved_on: '2026-09-03', kind: 'certification' },
      ],
    });
    expect(result.value).toBe(2);
    expect(result.breakdown).toEqual([{ label: 'Cursos', value: 2, display: '2' }]);
  });
});

describe('goals', () => {
  const data: KpiData = {
    ...empty,
    tasks: [
      task({ status: 'done', completed_at: '2026-10-05T12:00:00Z', due_date: '2026-10-05' }),
      task({ status: 'done', completed_at: '2026-10-07T12:00:00Z', due_date: '2026-10-06' }),
    ],
  };

  it('tracks progress of an active at-least goal', () => {
    const result = evaluateGoal(
      {
        metric: 'deliveries',
        comparison: 'at_least',
        target_value: 4,
        start_date: '2026-10-01',
        end_date: '2026-10-31',
      },
      data,
      ctx,
    );
    expect(result).toMatchObject({ status: 'in_progress', current: 2, progress: 50, met: false });
    expect(result.window).toEqual({ from: '2026-10-01', to: '2026-10-25' });
  });

  it('marks finished goals as achieved or missed', () => {
    const atMost = evaluateGoal(
      {
        metric: 'late_rate',
        comparison: 'at_most',
        target_value: 60,
        start_date: '2026-10-01',
        end_date: '2026-10-20',
      },
      data,
      ctx,
    );
    expect(atMost).toMatchObject({ status: 'achieved', current: 50, met: true });

    const missed = evaluateGoal(
      {
        metric: 'on_time_rate',
        comparison: 'at_least',
        target_value: 90,
        start_date: '2026-10-01',
        end_date: '2026-10-20',
      },
      data,
      ctx,
    );
    expect(missed).toMatchObject({ status: 'missed', current: 50 });
  });

  it('handles upcoming goals and missing data', () => {
    expect(
      evaluateGoal(
        {
          metric: 'deliveries',
          comparison: 'at_least',
          target_value: 1,
          start_date: '2026-11-01',
          end_date: '2026-11-30',
        },
        data,
        ctx,
      ).status,
    ).toBe('upcoming');
    expect(
      evaluateGoal(
        {
          metric: 'lead_time',
          comparison: 'at_most',
          target_value: 3,
          start_date: '2026-09-01',
          end_date: '2026-09-30',
        },
        data,
        ctx,
      ).status,
    ).toBe('no_data');
  });

  it('measures time invested in hours', () => {
    expect(
      metricValue(
        'time_invested',
        {
          ...empty,
          time: [
            {
              task_id: null,
              category_id: null,
              started_at: '2026-10-09T10:00:00Z',
              ended_at: '2026-10-09T11:30:00Z',
              paused_at: null,
              paused_seconds: 0,
              duration_seconds: 5400,
            },
          ],
        },
        period,
        ctx,
      ),
    ).toBe(1.5);
  });

  it('builds consecutive history periods', () => {
    expect(periodHistory({ from: '2026-10-19', to: '2026-10-25' }, 3)).toEqual([
      { from: '2026-10-05', to: '2026-10-11' },
      { from: '2026-10-12', to: '2026-10-18' },
      { from: '2026-10-19', to: '2026-10-25' },
    ]);
  });
});
