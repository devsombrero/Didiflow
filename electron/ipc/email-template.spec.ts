import { describe, expect, it } from 'vitest';
import type { EmailTaskCard } from './contract';
import { assertEmailReport, MAX_REPORT_TASKS, renderEmail } from './email-template';

const card: EmailTaskCard = {
  title: 'Integração com gateway de pagamento',
  kind: 'subtask',
  status: 'Em andamento',
  priority: 'urgent',
  progress: 60,
  due: '27/10/2026',
  deadline: 'Atrasada há 2 dias',
  overdue: true,
  project: 'Portal do Cliente',
  hierarchy: ['Lançamento do Portal 2.0', 'Checkout'],
  tags: ['backend'],
  hours: '15h 50min de 16h estimadas (99%)',
  children: '1 de 3 concluídas',
  excerpt: 'Fluxo de Pix',
  jiraUrl: 'https://empresa.atlassian.net/browse/PORT-218',
};

describe('assertEmailReport', () => {
  it('accepts a report and clamps values', () => {
    const report = assertEmailReport({
      intro: 'x'.repeat(700),
      tone: 'danger',
      tasks: [{ ...card, progress: 140, title: 't'.repeat(300) }],
      more: 3,
    })!;
    expect(report.intro).toHaveLength(600);
    expect(report.tasks[0].progress).toBe(100);
    expect(report.tasks[0].title).toHaveLength(200);
    expect(report.more).toBe(3);
  });

  it('drops non-https links and caps the number of tasks', () => {
    const report = assertEmailReport({
      tasks: Array.from({ length: 20 }, () => ({ ...card, jiraUrl: 'javascript:alert(1)' })),
    })!;
    expect(report.tasks).toHaveLength(MAX_REPORT_TASKS);
    expect(report.tasks[0].jiraUrl).toBeUndefined();
  });

  it('rejects malformed reports', () => {
    expect(assertEmailReport(undefined)).toBeUndefined();
    expect(() => assertEmailReport({ tasks: 'x' })).toThrow();
    expect(() => assertEmailReport({ tasks: [{ ...card, priority: 'critical' }] })).toThrow();
    expect(() => assertEmailReport({ tasks: [{ ...card, kind: 'story' }] })).toThrow();
    expect(() => assertEmailReport({ tasks: [card], tone: 'red' })).toThrow();
  });
});

describe('renderEmail with a report', () => {
  it('shows urgency, epic chain, deadline, hours and the Jira link', () => {
    const { html, text } = renderEmail('reminder', 'Lembrete', '', new Date(), {
      intro: 'Revisar o Pix',
      tone: 'danger',
      tasks: [card],
    });
    expect(html).toContain('Prioridade urgente');
    expect(html).toContain('Épico: Lançamento do Portal 2.0 › Checkout');
    expect(html).toContain('Atrasada há 2 dias');
    expect(html).toContain('15h 50min de 16h estimadas (99%)');
    expect(html).toContain('href="https://empresa.atlassian.net/browse/PORT-218"');
    expect(html).toContain('60% concluído');
    expect(text).toContain('[URGENTE] ↳ Subtarefa: Integração com gateway de pagamento');
    expect(text).toContain('Épico: Lançamento do Portal 2.0 › Checkout');
  });

  it('summarizes several tasks and escapes their text', () => {
    const { html } = renderEmail('digest', 'Prazos', '', new Date(), {
      tasks: [card, { ...card, title: '<img src=x>', priority: 'low', overdue: false }],
      more: 4,
    });
    expect(html).toContain('Progresso médio');
    expect(html).toContain('e mais <strong>4</strong>');
    expect(html).toContain('&lt;img src=x&gt;');
    expect(html).not.toContain('<img src=x>');
  });
});
