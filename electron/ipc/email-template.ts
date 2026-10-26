import type { EmailKind, EmailReport, EmailTaskCard, EmailTaskPriority } from './contract';
import { IpcValidationError } from './validation';

export const MAX_REPORT_TASKS = 15;

const KIND_LABELS: Record<EmailKind | 'test', string> = {
  reminder: 'Lembrete de tarefa',
  digest: 'Resumo de prazos',
  custom: 'Notificação personalizada',
  focus: 'Modo foco',
  test: 'E-mail de teste',
};

const PRIORITY: Record<EmailTaskPriority, { label: string; color: string; bg: string }> = {
  urgent: { label: 'Urgente', color: '#dc2626', bg: '#fee2e2' },
  high: { label: 'Alta', color: '#ea580c', bg: '#ffedd5' },
  medium: { label: 'Média', color: '#0284c7', bg: '#e0f2fe' },
  low: { label: 'Baixa', color: '#64748b', bg: '#f1f5f9' },
};
const PRIORITY_ORDER: EmailTaskPriority[] = ['urgent', 'high', 'medium', 'low'];

const TONE = {
  danger: { color: '#b91c1c', bg: '#fef2f2', border: '#fecaca' },
  warning: { color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  info: { color: '#0369a1', bg: '#f0f9ff', border: '#bae6fd' },
} as const;

const KIND_TAG: Record<EmailTaskCard['kind'], string> = {
  epic: '⚡ Épico',
  task: 'Tarefa',
  subtask: '↳ Subtarefa',
};

// ---------------------------------------------------------------------------
// Validation: the report comes from the renderer, so every field is checked
// and long strings are cut before rendering.
// ---------------------------------------------------------------------------

function text(value: unknown, max: number): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new IpcValidationError('Invalid e-mail report field');
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed.slice(0, max);
}

function httpsUrl(value: unknown): string | undefined {
  const raw = text(value, 2048);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function list(value: unknown, maxItems: number, maxLength: number): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new IpcValidationError('Invalid e-mail report list');
  const items = value
    .slice(0, maxItems)
    .map((item) => text(item, maxLength))
    .filter((item): item is string => item !== undefined);
  return items.length ? items : undefined;
}

function assertCard(value: unknown): EmailTaskCard {
  if (typeof value !== 'object' || value === null) {
    throw new IpcValidationError('Invalid e-mail task');
  }
  const card = value as Record<string, unknown>;
  const title = text(card['title'], 200);
  if (!title) throw new IpcValidationError('Invalid e-mail task title');
  const kind = card['kind'];
  if (kind !== 'epic' && kind !== 'task' && kind !== 'subtask') {
    throw new IpcValidationError('Invalid e-mail task kind');
  }
  const priority = card['priority'];
  if (!PRIORITY_ORDER.includes(priority as EmailTaskPriority)) {
    throw new IpcValidationError('Invalid e-mail task priority');
  }
  const progress = Number(card['progress']);
  return {
    title,
    kind,
    status: text(card['status'], 40) ?? '',
    priority: priority as EmailTaskPriority,
    progress: Number.isFinite(progress) ? Math.min(100, Math.max(0, Math.round(progress))) : 0,
    due: text(card['due'], 40),
    deadline: text(card['deadline'], 60),
    overdue: card['overdue'] === true,
    project: text(card['project'], 120),
    category: text(card['category'], 120),
    hierarchy: list(card['hierarchy'], 3, 200),
    tags: list(card['tags'], 10, 40),
    requester: text(card['requester'], 120),
    hours: text(card['hours'], 120),
    children: text(card['children'], 120),
    excerpt: text(card['excerpt'], 400),
    jiraUrl: httpsUrl(card['jiraUrl']),
  };
}

export function assertEmailReport(value: unknown): EmailReport | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object') throw new IpcValidationError('Invalid e-mail report');
  const report = value as Record<string, unknown>;
  if (!Array.isArray(report['tasks'])) throw new IpcValidationError('Invalid e-mail report tasks');
  const tone = report['tone'];
  if (tone !== undefined && tone !== 'info' && tone !== 'warning' && tone !== 'danger') {
    throw new IpcValidationError('Invalid e-mail report tone');
  }
  const more = Number(report['more'] ?? 0);
  return {
    intro: text(report['intro'], 600),
    tone,
    tasks: report['tasks'].slice(0, MAX_REPORT_TASKS).map(assertCard),
    more: Number.isInteger(more) && more > 0 ? Math.min(more, 10_000) : undefined,
  };
}

// ---------------------------------------------------------------------------
// Rendering (table layout and inline styles for e-mail clients).
// ---------------------------------------------------------------------------

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const FONT = "font-family:'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function pill(label: string, color: string, bg: string): string {
  return `<span style="display:inline-block;margin:0 6px 6px 0;padding:3px 10px;border-radius:999px;background:${bg};color:${color};font-size:12px;font-weight:700;line-height:18px">${escapeHtml(label)}</span>`;
}

function progressBar(percent: number, color: string): string {
  const bar =
    percent <= 0
      ? `<td style="height:8px;background:#e2e8f0;border-radius:4px;font-size:0;line-height:0">&nbsp;</td>`
      : percent >= 100
        ? `<td style="height:8px;background:${color};border-radius:4px;font-size:0;line-height:0">&nbsp;</td>`
        : `<td width="${percent}%" style="height:8px;background:${color};border-radius:4px 0 0 4px;font-size:0;line-height:0">&nbsp;</td><td style="height:8px;background:#e2e8f0;border-radius:0 4px 4px 0;font-size:0;line-height:0">&nbsp;</td>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding-right:10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${bar}</tr></table></td><td width="90" style="font-size:12px;font-weight:700;color:#334155;white-space:nowrap">${percent}% concluído</td></tr></table>`;
}

function metaRows(card: EmailTaskCard): [string, string][] {
  const rows: [string, string | undefined][] = [
    [
      'Entrega',
      card.due ? (card.deadline ? `${card.due} · ${card.deadline}` : card.due) : undefined,
    ],
    ['Projeto', card.project],
    ['Categoria', card.category],
    ['Solicitante', card.requester],
    ['Horas', card.hours],
    [card.kind === 'epic' ? 'Tarefas do épico' : 'Subtarefas', card.children],
  ];
  return rows.filter((row): row is [string, string] => row[1] !== undefined);
}

function renderCard(card: EmailTaskCard): string {
  const priority = PRIORITY[card.priority];
  const pills = [
    pill(`Prioridade ${priority.label.toLowerCase()}`, priority.color, priority.bg),
    card.status ? pill(card.status, '#334155', '#f1f5f9') : '',
    card.deadline
      ? card.overdue
        ? pill(card.deadline, '#b91c1c', '#fee2e2')
        : pill(card.deadline, '#b45309', '#fef3c7')
      : '',
  ].join('');
  const breadcrumb = card.hierarchy?.length
    ? `<div style="margin:2px 0 4px;font-size:12px;color:#6d28d9;font-weight:600">⚡ Épico: ${card.hierarchy.map(escapeHtml).join(' › ')}</div>`
    : '';
  const kindTag =
    card.kind === 'task'
      ? ''
      : `<span style="font-size:11px;font-weight:700;color:#6d28d9;text-transform:uppercase;letter-spacing:0.4px">${escapeHtml(KIND_TAG[card.kind])}</span><br>`;
  const meta = metaRows(card)
    .map(
      ([label, value]) =>
        `<tr><td width="120" style="padding:4px 0;font-size:12px;color:#64748b;vertical-align:top">${escapeHtml(label)}</td><td style="padding:4px 0;font-size:13px;color:#0f172a;font-weight:600">${escapeHtml(value)}</td></tr>`,
    )
    .join('');
  const tags = card.tags?.length
    ? `<div style="margin-top:8px">${card.tags.map((tag) => pill(`#${tag}`, '#0369a1', '#e0f2fe')).join('')}</div>`
    : '';
  const excerpt = card.excerpt
    ? `<div style="margin-top:10px;padding:10px 12px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;font-size:13px;line-height:1.5;color:#334155;white-space:pre-line">${escapeHtml(card.excerpt)}</div>`
    : '';
  const jira = card.jiraUrl
    ? `<div style="margin-top:12px"><a href="${escapeHtml(card.jiraUrl)}" style="display:inline-block;padding:8px 14px;border-radius:8px;background:#0284c7;color:#ffffff;font-size:13px;font-weight:700;text-decoration:none">Abrir card no Jira ↗</a></div>`
    : '';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 14px;background:#ffffff;border:1px solid #e2e8f0;border-left:5px solid ${priority.color};border-radius:12px">
<tr><td style="padding:14px 16px">
<div>${pills}</div>
${breadcrumb}
<div style="margin:4px 0 10px;font-size:17px;line-height:1.35;font-weight:700;color:#0f172a">${kindTag}${escapeHtml(card.title)}</div>
${progressBar(card.progress, priority.color)}
${meta ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:10px;border-top:1px solid #f1f5f9">${meta}</table>` : ''}
${tags}${excerpt}${jira}
</td></tr></table>`;
}

function stat(value: string, label: string, color: string): string {
  return `<td align="center" style="padding:10px 4px;background:#ffffff;border:1px solid #e2e8f0;border-radius:10px"><div style="font-size:22px;font-weight:800;color:${color}">${escapeHtml(value)}</div><div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.4px">${escapeHtml(label)}</div></td>`;
}

function renderSummary(tasks: EmailTaskCard[], more: number): string {
  if (tasks.length < 2) return '';
  const total = tasks.length + more;
  const overdue = tasks.filter((task) => task.overdue).length;
  const critical = tasks.filter(
    (task) => task.priority === 'urgent' || task.priority === 'high',
  ).length;
  const average = Math.round(tasks.reduce((sum, task) => sum + task.progress, 0) / tasks.length);
  const gap = '<td width="8" style="font-size:0">&nbsp;</td>';
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr>${[
    stat(String(total), 'Tarefas', '#0f172a'),
    stat(String(overdue), 'Atrasadas', overdue ? '#dc2626' : '#0f172a'),
    stat(String(critical), 'Urgentes/altas', critical ? '#ea580c' : '#0f172a'),
    stat(`${average}%`, 'Progresso médio', '#0284c7'),
  ].join(gap)}</tr></table>`;
}

function cardText(card: EmailTaskCard): string {
  const lines = [
    `[${PRIORITY[card.priority].label.toUpperCase()}] ${card.kind === 'task' ? '' : `${KIND_TAG[card.kind]}: `}${card.title}`,
    `  ${[card.status, `${card.progress}% concluído`, card.deadline].filter(Boolean).join(' · ')}`,
  ];
  if (card.hierarchy?.length) lines.push(`  Épico: ${card.hierarchy.join(' › ')}`);
  for (const [label, value] of metaRows(card)) lines.push(`  ${label}: ${value}`);
  if (card.tags?.length) lines.push(`  Tags: ${card.tags.map((tag) => `#${tag}`).join(' ')}`);
  if (card.excerpt) lines.push(`  ${card.excerpt.replace(/\n/g, '\n  ')}`);
  if (card.jiraUrl) lines.push(`  Jira: ${card.jiraUrl}`);
  return lines.join('\n');
}

/** Plain-text and HTML versions of a notification e-mail (all user text escaped). */
export function renderEmail(
  kind: EmailKind | 'test',
  title: string,
  body: string,
  sentAt: Date,
  report?: EmailReport,
): { subject: string; text: string; html: string } {
  const when = sentAt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  const footer = 'Enviado pelo DidiFlow. Para parar, desative em Configurações → E-mail (Gmail).';
  const intro = report?.intro ?? body;
  const tasks = report?.tasks ?? [];
  const more = report?.more ?? 0;
  const tone = TONE[report?.tone ?? 'info'];

  const text = [
    `DidiFlow · ${KIND_LABELS[kind]}`,
    title,
    intro,
    ...tasks.map(cardText),
    more ? `… e mais ${more} tarefa(s) no DidiFlow.` : '',
    `${when} · ${footer}`,
  ]
    .filter((line) => line !== '')
    .join('\n\n');

  const introHtml = intro
    ? `<div style="margin:0 0 18px;padding:12px 14px;border-radius:10px;background:${tone.bg};border:1px solid ${tone.border};color:${tone.color};font-size:14px;line-height:1.5;white-space:pre-line">${escapeHtml(intro)}</div>`
    : '';
  const moreHtml = more
    ? `<p style="margin:0 0 6px;font-size:13px;color:#475569;text-align:center">… e mais <strong>${more}</strong> tarefa(s). Veja todas no DidiFlow.</p>`
    : '';

  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#eef5fb;${FONT};color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef5fb;padding:24px 10px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px">
<tr><td style="padding:20px 24px;border-radius:16px 16px 0 0;background:#0284c7;background-image:linear-gradient(135deg,#0369a1,#0284c7 45%,#0ea5e9)">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
<td style="font-size:24px;font-weight:800;letter-spacing:-0.5px;color:#ffffff">Didi<span style="color:#bae6fd">Flow</span></td>
<td align="right"><span style="display:inline-block;padding:5px 12px;border-radius:999px;background:rgba(255,255,255,0.18);color:#ffffff;font-size:12px;font-weight:700">${escapeHtml(KIND_LABELS[kind])}</span></td>
</tr></table></td></tr>
<tr><td style="padding:22px 24px 8px;background:#f8fbfe;border-left:1px solid #d7e3ee;border-right:1px solid #d7e3ee">
<h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#0f172a">${escapeHtml(title)}</h1>
${introHtml}${renderSummary(tasks, more)}${tasks.map(renderCard).join('')}${moreHtml}
</td></tr>
<tr><td style="padding:16px 24px;border-radius:0 0 16px 16px;background:#ffffff;border:1px solid #d7e3ee;font-size:12px;line-height:1.6;color:#64748b">
<strong style="color:#0f172a">Abra o DidiFlow</strong> para ver os detalhes e atualizar as tarefas.<br>${escapeHtml(when)} · ${escapeHtml(footer)}
</td></tr>
</table></td></tr></table></body></html>`;

  return { subject: `DidiFlow · ${title}`, text, html };
}
