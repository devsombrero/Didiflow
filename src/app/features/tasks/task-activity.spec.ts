import { describeActivity, formatFieldValue } from './task-activity';

const fmt = (value: string) => value.split('-').reverse().join('/');

describe('describeActivity', () => {
  it('describes creation', () => {
    expect(describeActivity({ action: 'created', changes: { title: 'Contrato' } }, fmt)).toEqual({
      title: 'Tarefa criada',
      details: [],
    });
  });

  it('lists field edits with previous and new values', () => {
    const view = describeActivity(
      {
        action: 'updated',
        changes: {
          title: { old: 'Contrato', new: 'Contrato revisado' },
          priority: { old: 'medium', new: 'urgent' },
          due_date: { old: null, new: '2026-11-03' },
          has_jira_card: { old: false, new: true },
          estimated_minutes: { old: 90, new: 120 },
        },
      },
      fmt,
    );
    expect(view.title).toBe('Dados alterados');
    expect(view.details).toEqual([
      'Título: “Contrato” → “Contrato revisado”',
      'Prioridade: Média → Urgente',
      'Entrega prevista: — → 03/11/2026',
      'Card no Jira: Não → Sim',
      'Estimativa: 1h 30min → 2h',
    ]);
  });

  it('describes status transitions and hides unchanged progress', () => {
    const view = describeActivity(
      {
        action: 'cancelled',
        changes: {
          status: { old: 'in_progress', new: 'cancelled' },
          progress_percentage: { old: 40, new: 40 },
        },
      },
      fmt,
    );
    expect(view).toEqual({
      title: 'Tarefa cancelada',
      details: ['Status: Em andamento → Cancelado'],
    });
  });

  it('flags hard deletes and tolerates missing changes', () => {
    expect(
      describeActivity({ action: 'deleted', changes: { title: 'x', hard_delete: true } }, fmt)
        .details,
    ).toEqual(['Exclusão definitiva']);
    expect(describeActivity({ action: 'archived', changes: null }, fmt)).toEqual({
      title: 'Tarefa arquivada',
      details: [],
    });
  });

  it('truncates long text values', () => {
    expect(formatFieldValue('description', 'a'.repeat(100), fmt)).toHaveLength(80);
  });
});
