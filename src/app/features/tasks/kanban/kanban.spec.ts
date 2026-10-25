import type { TaskWithTags } from '../task.model';
import { BOARD_COLUMNS, boardMove, groupByStatus } from './kanban';

const task = (overrides: Partial<TaskWithTags>): TaskWithTags =>
  ({
    id: Math.random().toString(36).slice(2),
    title: 'Tarefa',
    status: 'not_started',
    priority: 'medium',
    due_date: null,
    task_tags: [],
    ...overrides,
  }) as TaskWithTags;

describe('boardMove', () => {
  it('ignores drops on the same column', () => {
    expect(boardMove({ status: 'blocked' }, 'blocked')).toEqual({ kind: 'none' });
  });

  it('changes status between open columns and to done', () => {
    expect(boardMove({ status: 'not_started' }, 'in_progress')).toEqual({
      kind: 'set-status',
      status: 'in_progress',
    });
    expect(boardMove({ status: 'blocked' }, 'done')).toEqual({
      kind: 'set-status',
      status: 'done',
    });
  });

  it('routes cancellations through the confirmed flow', () => {
    expect(boardMove({ status: 'in_progress' }, 'cancelled')).toEqual({ kind: 'cancel' });
  });

  it('reopens cancelled tasks before moving them', () => {
    expect(boardMove({ status: 'cancelled' }, 'blocked')).toEqual({
      kind: 'reopen',
      status: 'blocked',
    });
  });
});

describe('groupByStatus', () => {
  it('groups by column and sorts by priority, due date and title', () => {
    const groups = groupByStatus(
      [
        task({ title: 'B', priority: 'medium', due_date: '2026-11-02' }),
        task({ title: 'A', priority: 'medium', due_date: '2026-11-01' }),
        task({ title: 'Urgente', priority: 'urgent' }),
        task({ title: 'Feita', status: 'done' }),
        task({ title: 'Cancelada', status: 'cancelled' }),
      ],
      BOARD_COLUMNS,
    );
    expect(groups.not_started.map((t) => t.title)).toEqual(['Urgente', 'A', 'B']);
    expect(groups.done.map((t) => t.title)).toEqual(['Feita']);
    expect(groups).not.toHaveProperty('cancelled');
  });
});
