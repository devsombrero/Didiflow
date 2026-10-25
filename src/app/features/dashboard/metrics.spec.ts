import {
  applyFilters,
  deliveryBuckets,
  NO_FILTERS,
  type MetricTask,
  openByPriority,
  periodFor,
  previousPeriod,
  statusDistribution,
  summarize,
  weekStart,
} from './metrics';

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
  ...overrides,
});

const ctx = {
  period: { from: '2026-10-01', to: '2026-10-31' },
  today: '2026-10-25',
  timeZone: 'America/Sao_Paulo',
  dueSoonDays: 2,
};

describe('periods', () => {
  it('builds presets ending today', () => {
    expect(periodFor('7d', '2026-10-25')).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    expect(periodFor('month', '2026-10-25')).toEqual({ from: '2026-10-01', to: '2026-10-25' });
    expect(periodFor('year', '2026-10-25')).toEqual({ from: '2026-01-01', to: '2026-10-25' });
  });

  it('computes the previous equivalent period', () => {
    expect(previousPeriod({ from: '2026-10-19', to: '2026-10-25' })).toEqual({
      from: '2026-10-12',
      to: '2026-10-18',
    });
  });

  it('finds the Monday of a week', () => {
    expect(weekStart('2026-10-25')).toBe('2026-10-19'); // Sunday
    expect(weekStart('2026-10-19')).toBe('2026-10-19'); // Monday
  });
});

describe('summarize', () => {
  it('returns empty-state values for a new account', () => {
    expect(summarize([], ctx)).toEqual({
      open: 0,
      inProgress: 0,
      blocked: 0,
      overdue: 0,
      dueSoon: 0,
      completedInPeriod: 0,
      completionRate: null,
      averageProgress: null,
      onTimeRate: null,
      onTimeEligible: 0,
    });
  });

  it('counts open work, excluding archived tasks', () => {
    const summary = summarize(
      [
        task({ status: 'in_progress', progress_percentage: 40, due_date: '2026-10-20' }),
        task({ status: 'blocked', progress_percentage: 60, due_date: '2026-10-26' }),
        task({ status: 'not_started', due_date: '2026-10-25' }),
        task({
          status: 'in_progress',
          progress_percentage: 50,
          archived_at: '2026-10-01T00:00:00Z',
        }),
        task({ status: 'cancelled', due_date: '2026-10-01' }),
      ],
      ctx,
    );
    expect(summary).toMatchObject({
      open: 3,
      inProgress: 1,
      blocked: 1,
      overdue: 1,
      dueSoon: 2,
      averageProgress: 33,
    });
  });

  it('uses the user time zone to decide the completion day', () => {
    // 02:00 UTC on Nov 1st is still Oct 31st in São Paulo.
    const late = task({
      status: 'done',
      completed_at: '2026-11-01T02:00:00Z',
      due_date: '2026-10-31',
    });
    const summary = summarize([late], ctx);
    expect(summary.completedInPeriod).toBe(1);
    expect(summary.onTimeRate).toBe(100);
  });

  it('computes on-time rate only over completed tasks with a due date', () => {
    const summary = summarize(
      [
        task({ status: 'done', completed_at: '2026-10-10T15:00:00Z', due_date: '2026-10-10' }),
        task({ status: 'done', completed_at: '2026-10-12T15:00:00Z', due_date: '2026-10-11' }),
        task({ status: 'done', completed_at: '2026-10-12T15:00:00Z', due_date: null }),
        task({ status: 'done', completed_at: '2026-09-12T15:00:00Z', due_date: '2026-09-30' }),
      ],
      ctx,
    );
    expect(summary.completedInPeriod).toBe(3);
    expect(summary.onTimeEligible).toBe(2);
    expect(summary.onTimeRate).toBe(50);
  });

  it('computes completion rate over non-cancelled tasks due in the period', () => {
    const summary = summarize(
      [
        task({ status: 'done', completed_at: '2026-10-05T12:00:00Z', due_date: '2026-10-05' }),
        task({ status: 'in_progress', progress_percentage: 10, due_date: '2026-10-28' }),
        task({ status: 'cancelled', due_date: '2026-10-15' }),
        task({ status: 'not_started', due_date: '2026-11-15' }),
      ],
      ctx,
    );
    expect(summary.completionRate).toBe(50);
  });
});

describe('deliveryBuckets', () => {
  it('splits weekly deliveries by deadline outcome', () => {
    const buckets = deliveryBuckets(
      [
        task({ status: 'done', completed_at: '2026-10-20T15:00:00Z', due_date: '2026-10-21' }),
        task({ status: 'done', completed_at: '2026-10-21T15:00:00Z', due_date: '2026-10-20' }),
        task({ status: 'done', completed_at: '2026-10-22T15:00:00Z' }),
      ],
      { from: '2026-10-12', to: '2026-10-25' },
      'UTC',
      'week',
    );
    expect(buckets).toEqual([
      { label: '12/10', start: '2026-10-12', onTime: 0, late: 0, noDueDate: 0 },
      { label: '19/10', start: '2026-10-19', onTime: 1, late: 1, noDueDate: 1 },
    ]);
  });

  it('groups by month', () => {
    const buckets = deliveryBuckets(
      [task({ status: 'done', completed_at: '2026-12-02T15:00:00Z' })],
      { from: '2026-11-15', to: '2027-01-10' },
      'UTC',
      'month',
    );
    expect(buckets.map((b) => [b.label, b.noDueDate])).toEqual([
      ['nov/26', 0],
      ['dez/26', 1],
      ['jan/27', 0],
    ]);
  });
});

describe('distributions and filters', () => {
  const tasks = [
    task({ status: 'in_progress', priority: 'high', progress_percentage: 10, category_id: 'c1' }),
    task({ status: 'done', priority: 'high', completed_at: '2026-10-01T00:00:00Z' }),
    task({ status: 'blocked', priority: 'urgent', archived_at: '2026-10-01T00:00:00Z' }),
  ];

  it('counts statuses of non-archived tasks', () => {
    expect(statusDistribution(tasks)).toEqual({
      not_started: 0,
      in_progress: 1,
      blocked: 0,
      done: 1,
      cancelled: 0,
    });
  });

  it('counts open tasks by priority', () => {
    expect(openByPriority(tasks)).toEqual({ low: 0, medium: 0, high: 1, urgent: 0 });
  });

  it('filters by status, priority and category', () => {
    expect(applyFilters(tasks, { ...NO_FILTERS, statuses: ['done'] })).toHaveLength(1);
    expect(
      applyFilters(tasks, { ...NO_FILTERS, priorities: ['high'], categoryId: 'c1' }),
    ).toHaveLength(1);
  });
});

describe('project filter', () => {
  it('keeps only tasks of the selected project', () => {
    const tasks = [task({ project_id: 'p1' }), task({ project_id: 'p2' }), task({})];
    expect(applyFilters(tasks, { ...NO_FILTERS, projectId: 'p1' })).toHaveLength(1);
  });
});
