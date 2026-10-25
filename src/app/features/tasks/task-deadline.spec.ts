import { deadlineLabel, deadlineState } from './task-deadline';

describe('deadlineState', () => {
  const today = '2026-10-25';

  it('ignores tasks without due date or not open', () => {
    expect(deadlineState({ status: 'in_progress', due_date: null }, today, 2).kind).toBe('none');
    expect(deadlineState({ status: 'done', due_date: '2026-10-01' }, today, 2).kind).toBe('none');
    expect(deadlineState({ status: 'cancelled', due_date: '2026-10-01' }, today, 2).kind).toBe(
      'none',
    );
  });

  it('detects overdue open tasks, including blocked ones', () => {
    expect(deadlineState({ status: 'blocked', due_date: '2026-10-22' }, today, 2)).toEqual({
      kind: 'overdue',
      days: 3,
    });
  });

  it('detects tasks due within the warning window', () => {
    expect(deadlineState({ status: 'not_started', due_date: today }, today, 2)).toEqual({
      kind: 'due-soon',
      days: 0,
    });
    expect(deadlineState({ status: 'in_progress', due_date: '2026-10-27' }, today, 2)).toEqual({
      kind: 'due-soon',
      days: 2,
    });
    expect(deadlineState({ status: 'in_progress', due_date: '2026-10-28' }, today, 2).kind).toBe(
      'on-track',
    );
  });

  it('builds pt-BR labels', () => {
    expect(deadlineLabel({ kind: 'overdue', days: 1 })).toBe('Atrasada há 1 dia');
    expect(deadlineLabel({ kind: 'overdue', days: 4 })).toBe('Atrasada há 4 dias');
    expect(deadlineLabel({ kind: 'due-soon', days: 0 })).toBe('Vence hoje');
    expect(deadlineLabel({ kind: 'due-soon', days: 1 })).toBe('Vence amanhã');
    expect(deadlineLabel({ kind: 'on-track' })).toBe('');
  });
});
