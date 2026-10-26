import type { TaskRollup } from '../tasks/task-hierarchy';
import {
  hoursLabel,
  markdownExcerpt,
  type ReportContext,
  type ReportTask,
  reportTone,
  sortForEmail,
  toEmailCard,
} from './email-report';

const base: ReportTask = {
  id: 't1',
  title: 'Gráfico de consumo',
  kind: 'task',
  parent_id: 'p1',
  status: 'in_progress',
  priority: 'medium',
  progress_percentage: 50,
  due_date: '2026-10-27',
  estimated_minutes: 240,
  requester_name: 'Marina Lopes',
  jira_url: 'https://empresa.atlassian.net/browse/PORT-1',
  description: '## Objetivo\n- [x] Saldo\n- [ ] **Faturas** em [aberto](https://x)',
  project_id: 'proj',
  category_id: null,
};

const rollup: TaskRollup = {
  own_seconds: 3600,
  tree_seconds: 7200,
  today_seconds: 0,
  own_estimate_minutes: 240,
  tree_estimate_minutes: 240,
  children_total: 3,
  children_done: 1,
};

const ctx: ReportContext = {
  today: '2026-10-26',
  dueSoonDays: 2,
  dateFormat: 'dd/MM/yyyy',
  timeZone: 'America/Sao_Paulo',
  names: new Map([['proj', 'Portal do Cliente']]),
  tagsByTask: new Map([['t1', ['frontend']]]),
  ancestors: new Map([
    ['p1', { title: 'Painel do cliente', kind: 'task', parent_id: 'e1' }],
    ['e1', { title: 'Lançamento do Portal 2.0', kind: 'epic', parent_id: null }],
  ]),
  rollups: new Map([['t1', rollup]]),
};

describe('email report', () => {
  it('builds a task card with epic chain, deadline, hours and links', () => {
    expect(toEmailCard(base, ctx)).toEqual({
      title: 'Gráfico de consumo',
      kind: 'subtask',
      status: 'Em andamento',
      priority: 'medium',
      progress: 50,
      due: '27/10/2026',
      deadline: 'Vence amanhã',
      overdue: false,
      project: 'Portal do Cliente',
      category: undefined,
      hierarchy: ['Lançamento do Portal 2.0', 'Painel do cliente'],
      tags: ['frontend'],
      requester: 'Marina Lopes',
      hours: '2h 00min de 4h estimadas (50%)',
      children: '1 de 3 concluídas',
      excerpt: 'Objetivo\n☑ Saldo\n☐ Faturas em aberto',
      jiraUrl: 'https://empresa.atlassian.net/browse/PORT-1',
    });
  });

  it('marks direct children of an epic as tasks and flags overdue items', () => {
    const card = toEmailCard({ ...base, parent_id: 'e1', due_date: '2026-10-20' }, ctx);
    expect(card.kind).toBe('task');
    expect(card.hierarchy).toEqual(['Lançamento do Portal 2.0']);
    expect(card.overdue).toBe(true);
    expect(card.deadline).toBe('Atrasada há 6 dias');
    expect(reportTone([card])).toBe('danger');
  });

  it('formats hours with or without an estimate', () => {
    expect(hoursLabel(undefined, null)).toBeUndefined();
    expect(
      hoursLabel({ ...rollup, tree_estimate_minutes: null, own_estimate_minutes: null }, null),
    ).toBe('2h 00min registradas');
  });

  it('sorts by urgency, then due date', () => {
    const sorted = sortForEmail([
      { ...base, id: 'a', priority: 'low', due_date: '2026-10-26' },
      { ...base, id: 'b', priority: 'urgent', due_date: '2026-10-30' },
      { ...base, id: 'c', priority: 'urgent', due_date: '2026-10-27' },
    ]);
    expect(sorted.map((task) => task.id)).toEqual(['c', 'b', 'a']);
  });

  it('truncates long excerpts', () => {
    expect(markdownExcerpt(null)).toBeUndefined();
    expect(markdownExcerpt('a'.repeat(400), 50)).toHaveLength(50);
  });
});
