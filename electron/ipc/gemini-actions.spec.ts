import { describe, expect, it } from 'vitest';
import { extractActions, MAX_ACTIONS, toAction } from './gemini-actions';

describe('DidiBot actions', () => {
  it('normalizes a task proposal', () => {
    expect(
      toAction('create_task', {
        title: '  Implementar   Pix ',
        kind: 'epic',
        priority: 'urgent',
        due_date: '2026-11-07',
        start_date: 'amanhã',
        estimated_hours: 3.3,
        tags: ['backend', '', 42, 'cliente'],
        subtasks: ['Mapear fluxo', 'Testar'],
        parent: 'Lançamento',
      }),
    ).toEqual({
      type: 'create_task',
      title: 'Implementar Pix',
      kind: 'epic',
      priority: 'urgent',
      dueDate: '2026-11-07',
      estimatedHours: 3.25,
      tags: ['backend', 'cliente'],
      subtasks: ['Mapear fluxo', 'Testar'],
      parent: 'Lançamento',
    });
  });

  it('drops invalid values and empty proposals', () => {
    expect(toAction('create_task', { title: '  ' })).toBeNull();
    expect(toAction('create_project', {})).toBeNull();
    expect(
      toAction('create_task', { title: 'X', priority: 'max', due_date: '2026-13-45' }),
    ).toEqual({
      type: 'create_task',
      title: 'X',
    });
    expect(toAction('update_task', { task: 'Gateway' })).toBeNull();
    expect(toAction('update_task', { task: 'Gateway', progress: 140, status: 'archived' })).toEqual(
      {
        type: 'update_task',
        task: 'Gateway',
        progress: 100,
      },
    );
    expect(toAction('drop_table', { title: 'x' })).toBeNull();
  });

  it('keeps the order of function calls and caps their number', () => {
    const parts = Array.from({ length: 40 }, (_, i) => ({
      functionCall: { name: 'create_task', args: { title: `T${i}` } },
    }));
    const actions = extractActions([{ text: 'oi' } as never, ...parts]);
    expect(actions).toHaveLength(MAX_ACTIONS);
    expect(actions[0]).toEqual({ type: 'create_task', title: 'T0' });
  });
});
