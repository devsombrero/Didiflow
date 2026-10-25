import { move, remainingSeconds, suggestPriorities, type SuggestionTask } from './focus-logic';

const task = (id: string, overrides: Partial<SuggestionTask>): SuggestionTask => ({
  id,
  title: id,
  status: 'not_started',
  priority: 'medium',
  due_date: null,
  progress_percentage: 0,
  ...overrides,
});

describe('suggestPriorities', () => {
  const today = '2026-10-25';
  const tasks = [
    task('overdue', { due_date: '2026-10-22' }),
    task('today', { due_date: today }),
    task('tomorrow', { due_date: '2026-10-26' }),
    task('later', { due_date: '2026-11-30' }),
    task('wip-high', { status: 'in_progress', priority: 'high', progress_percentage: 30 }),
    task('done', { status: 'done', due_date: '2026-10-20', progress_percentage: 100 }),
    task('blocked-overdue', { status: 'blocked', due_date: '2026-10-24', progress_percentage: 10 }),
  ];

  it('ranks overdue, due today, due soon and important work in progress', () => {
    const result = suggestPriorities(tasks, today, 2, new Set());
    expect(result.map((s) => [s.task.id, s.reason])).toEqual([
      ['overdue', 'Atrasada há 3 dias'],
      ['today', 'Vence hoje'],
      ['blocked-overdue', 'Atrasada há 1 dia'],
      ['tomorrow', 'Vence amanhã'],
      ['wip-high', 'Em andamento · prioridade alta'],
    ]);
  });

  it('skips tasks already in the list and respects the limit', () => {
    const result = suggestPriorities(tasks, today, 2, new Set(['overdue']), 2);
    expect(result.map((s) => s.task.id)).toEqual(['today', 'blocked-overdue']);
  });
});

describe('remainingSeconds', () => {
  it('counts down from the planned duration and stops at zero', () => {
    const session = { started_at: '2026-10-25T12:00:00Z', planned_minutes: 25 };
    expect(remainingSeconds(session, Date.parse('2026-10-25T12:10:00Z'))).toBe(15 * 60);
    expect(remainingSeconds(session, Date.parse('2026-10-25T13:00:00Z'))).toBe(0);
  });
});

describe('move', () => {
  it('swaps neighbours and ignores moves past the edges', () => {
    expect(move(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(move(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });
});
