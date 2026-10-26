import { buildDigest, type DigestTask } from './deadline-digest';

const prefs = {
  notifications_enabled: true,
  notify_overdue: true,
  notify_due_soon: true,
  due_soon_days: 2,
};
const today = '2026-10-25';
const task = (
  id: string,
  due: string | null,
  status: DigestTask['status'] = 'in_progress',
): DigestTask => ({
  id,
  title: `Tarefa ${id}`,
  status,
  due_date: due,
});

describe('buildDigest', () => {
  const tasks = [
    task('a', '2026-10-20'),
    task('b', '2026-10-24', 'blocked'),
    task('c', '2026-10-25'),
    task('d', '2026-10-27'),
    task('e', '2026-10-28'),
    task('f', '2026-10-01', 'done'),
    task('g', null),
  ];

  it('summarizes overdue and due-soon open tasks', () => {
    expect(buildDigest(tasks, today, prefs)).toEqual([
      {
        kind: 'overdue',
        title: '2 tarefas atrasadas',
        body: 'Tarefa a, Tarefa b',
        route: '/tasks',
        taskIds: ['a', 'b'],
      },
      {
        kind: 'due-soon',
        title: '2 tarefas vencem em até 2 dia(s)',
        body: 'Tarefa c, Tarefa d',
        route: '/calendar',
        taskIds: ['c', 'd'],
      },
    ]);
  });

  it('links directly to a single task', () => {
    const [overdue] = buildDigest([task('x', '2026-10-01')], today, prefs);
    expect(overdue.route).toBe('/tasks/x');
  });

  it('respects the preferences', () => {
    expect(buildDigest(tasks, today, { ...prefs, notifications_enabled: false })).toEqual([]);
    expect(
      buildDigest(tasks, today, { ...prefs, notify_overdue: false }).map((n) => n.kind),
    ).toEqual(['due-soon']);
    expect(
      buildDigest(tasks, today, { ...prefs, notify_due_soon: false }).map((n) => n.kind),
    ).toEqual(['overdue']);
  });

  it('truncates long title lists', () => {
    const many = ['1', '2', '3', '4', '5'].map((id) => task(id, '2026-10-01'));
    expect(buildDigest(many, today, prefs)[0].body).toBe('Tarefa 1, Tarefa 2, Tarefa 3 e mais 2');
  });
});
