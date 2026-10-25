import {
  childrenSummary,
  dailyPace,
  depthOf,
  formatDecimalHours,
  formatHours,
  type HierarchyTask,
  parentCandidates,
  workingDaysBetween,
} from './task-hierarchy';

const t = (id: string, parent: string | null, kind: 'epic' | 'task' = 'task'): HierarchyTask => ({
  id,
  title: id,
  kind,
  parent_id: parent,
  status: 'not_started',
});

describe('task hierarchy', () => {
  const tasks = [t('epic', null, 'epic'), t('a', 'epic'), t('a1', 'a'), t('b', null), t('c', 'b')];
  const byId = new Map(tasks.map((x) => [x.id, x]));

  it('measures depth', () => {
    expect(depthOf(byId.get('epic')!, byId)).toBe(0);
    expect(depthOf(byId.get('a1')!, byId)).toBe(2);
  });

  it('offers parents that keep at most three levels', () => {
    const forNew = parentCandidates(tasks, { id: null, kind: 'task', subtreeHeight: 0 });
    expect(forNew.map((x) => x.id)).toEqual(['epic', 'a', 'b', 'c']);

    // "b" has one child: it can only go under a top-level item.
    const forB = parentCandidates(tasks, { id: 'b', kind: 'task', subtreeHeight: 1 });
    expect(forB.map((x) => x.id)).toEqual(['epic']);

    // never itself or its descendants
    const forA = parentCandidates(tasks, { id: 'a', kind: 'task', subtreeHeight: 1 });
    expect(forA.map((x) => x.id)).not.toContain('a1');
    expect(forA.map((x) => x.id)).not.toContain('a');
  });

  it('never offers a parent to an epic', () => {
    expect(parentCandidates(tasks, { id: 'x', kind: 'epic', subtreeHeight: 0 })).toEqual([]);
  });

  it('summarizes children', () => {
    expect(childrenSummary({ children_total: 5, children_done: 3 })).toBe('3 de 5 concluídas');
    expect(childrenSummary({ children_total: 1, children_done: 0 })).toBe('0 de 1 concluída');
  });
});

describe('daily hours', () => {
  it('counts working days inclusively', () => {
    expect(workingDaysBetween('2026-10-23', '2026-10-27')).toBe(3); // Fri, Mon, Tue
    expect(workingDaysBetween('2026-10-25', '2026-10-25')).toBe(0); // Sunday
  });

  it('computes the pace needed to meet the due date', () => {
    const pace = dailyPace({
      estimateMinutes: 600,
      trackedSeconds: 2 * 3600,
      today: '2026-10-26',
      startDate: null,
      dueDate: '2026-10-29',
    });
    expect(pace).toEqual({ remainingHours: 8, workingDays: 4, hoursPerDay: 2, overdue: false });
  });

  it('starts counting at a future start date', () => {
    const pace = dailyPace({
      estimateMinutes: 240,
      trackedSeconds: 0,
      today: '2026-10-26',
      startDate: '2026-10-29',
      dueDate: '2026-10-30',
    });
    expect(pace?.workingDays).toBe(2);
    expect(pace?.hoursPerDay).toBe(2);
  });

  it('handles missing estimate, missing due date and overdue tasks', () => {
    const base = { trackedSeconds: 0, today: '2026-10-26', startDate: null };
    expect(dailyPace({ ...base, estimateMinutes: null, dueDate: '2026-10-30' })).toBeNull();
    expect(dailyPace({ ...base, estimateMinutes: 60, dueDate: null })?.hoursPerDay).toBeNull();
    expect(dailyPace({ ...base, estimateMinutes: 60, dueDate: '2026-10-20' })).toMatchObject({
      overdue: true,
      hoursPerDay: null,
    });
    expect(
      dailyPace({ ...base, trackedSeconds: 7200, estimateMinutes: 60, dueDate: '2026-10-30' })
        ?.remainingHours,
    ).toBe(0);
  });

  it('formats hours', () => {
    expect(formatHours(5400)).toBe('1h 30min');
    expect(formatHours(7200)).toBe('2h');
    expect(formatHours(600)).toBe('10min');
    expect(formatDecimalHours(1.25)).toBe('1,3 h');
  });
});
