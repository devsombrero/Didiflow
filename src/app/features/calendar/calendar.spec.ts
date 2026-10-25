import { buildDays, type CalendarTask, monthTitle, shiftAnchor, visibleRange } from './calendar';

const task = (overrides: Partial<CalendarTask>): CalendarTask => ({
  id: 't',
  title: 'Tarefa',
  status: 'in_progress',
  priority: 'medium',
  start_date: null,
  due_date: null,
  progress_percentage: 10,
  ...overrides,
});

describe('calendar ranges', () => {
  it('covers whole weeks for the month view', () => {
    // October 2026 starts on a Thursday and ends on a Saturday.
    expect(visibleRange('month', '2026-10-25')).toEqual({ from: '2026-09-28', to: '2026-11-01' });
  });

  it('starts weeks on Monday', () => {
    expect(visibleRange('week', '2026-10-25')).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    expect(visibleRange('day', '2026-10-25')).toEqual({ from: '2026-10-25', to: '2026-10-25' });
  });

  it('moves the anchor by view length', () => {
    expect(shiftAnchor('month', '2026-12-15', 1)).toBe('2027-01-01');
    expect(shiftAnchor('month', '2026-01-15', -1)).toBe('2025-12-01');
    expect(shiftAnchor('week', '2026-10-25', -1)).toBe('2026-10-18');
    expect(shiftAnchor('day', '2026-10-31', 1)).toBe('2026-11-01');
  });

  it('names months in Portuguese', () => {
    expect(monthTitle('2026-03-01')).toBe('Março de 2026');
  });
});

describe('buildDays', () => {
  const today = '2026-10-25';

  it('places tasks on their start and due dates', () => {
    const days = buildDays(
      'week',
      today,
      [task({ start_date: '2026-10-20', due_date: '2026-10-28' })],
      today,
      2,
    );
    expect(days).toHaveLength(7);
    expect(days.find((d) => d.date === '2026-10-20')!.events.map((e) => e.kind)).toEqual(['start']);
    // Due date falls outside this week.
    expect(days.flatMap((d) => d.events)).toHaveLength(1);
  });

  it('shows a single due event when start and due coincide', () => {
    const days = buildDays('day', today, [task({ start_date: today, due_date: today })], today, 2);
    expect(days[0].events.map((e) => e.kind)).toEqual(['due']);
  });

  it('flags overdue and urgent open tasks only, sorting them first', () => {
    const days = buildDays(
      'week',
      today,
      [
        task({ id: 'a', title: 'A', due_date: '2026-10-21', priority: 'low' }),
        task({
          id: 'b',
          title: 'B',
          due_date: '2026-10-21',
          priority: 'urgent',
          status: 'done',
          progress_percentage: 100,
        }),
      ],
      today,
      2,
    );
    const events = days.find((d) => d.date === '2026-10-21')!.events;
    expect(events.map((e) => [e.task.id, e.overdue, e.urgent])).toEqual([
      ['a', true, true],
      ['b', false, false],
    ]);
  });

  it('marks today and days outside the month', () => {
    const days = buildDays('month', today, [], today, 2);
    expect(days.find((d) => d.isToday)?.date).toBe(today);
    expect(days[0]).toMatchObject({ date: '2026-09-28', inMonth: false });
  });
});
