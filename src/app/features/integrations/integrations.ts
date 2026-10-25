/**
 * Integration registry. Version 1 supports manually entered links only;
 * real API integrations plug in here later (see docs/integrations.md).
 * No external API is called from this module.
 */

export type IntegrationId = 'jira' | 'slack' | 'github' | 'gitlab' | 'google-calendar';

export type IntegrationStatus =
  /** Links can be stored on tasks and opened in the browser. */
  | 'manual-links'
  /** Not available yet; documented as a future integration. */
  | 'planned';

export interface IntegrationInfo {
  id: IntegrationId;
  name: string;
  status: IntegrationStatus;
  description: string;
}

export const INTEGRATIONS: readonly IntegrationInfo[] = [
  {
    id: 'jira',
    name: 'Jira',
    status: 'manual-links',
    description: 'Vincule o card de cada demanda e abra-o pelo aplicativo.',
  },
  {
    id: 'slack',
    name: 'Slack',
    status: 'manual-links',
    description: 'Vincule a thread de origem da demanda e abra-a pelo aplicativo.',
  },
  {
    id: 'github',
    name: 'GitHub',
    status: 'planned',
    description: 'Associar pull requests e issues às tarefas.',
  },
  {
    id: 'gitlab',
    name: 'GitLab',
    status: 'planned',
    description: 'Associar merge requests e issues às tarefas.',
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    status: 'planned',
    description: 'Exibir prazos e sessões de foco na agenda.',
  },
];

export interface ParsedLink {
  provider: 'jira' | 'slack';
  /** Short human label, e.g. "DF-123" or "#suporte · thread". */
  label: string;
  host: string;
}

const JIRA_KEY = /\b([A-Z][A-Z0-9_]{1,9}-\d{1,7})\b/;

/** Extracts a short label from a Jira issue URL (browse/, selectedIssue=, issues/...). */
export function parseJiraLink(url: string): ParsedLink | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  const candidates = [parsed.pathname, parsed.searchParams.get('selectedIssue') ?? ''];
  for (const candidate of candidates) {
    const match = JIRA_KEY.exec(decodeURIComponent(candidate));
    if (match) return { provider: 'jira', label: match[1], host: parsed.hostname };
  }
  return { provider: 'jira', label: parsed.hostname, host: parsed.hostname };
}

/** Labels Slack message/thread permalinks (…slack.com/archives/<channel>/p<ts>). */
export function parseSlackLink(url: string): ParsedLink | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  const workspace = parsed.hostname.split('.')[0];
  const match = /^\/archives\/([A-Z0-9]+)(?:\/p(\d+))?/.exec(parsed.pathname);
  if (!match) return { provider: 'slack', label: parsed.hostname, host: parsed.hostname };
  const isThread = !!match[2] || parsed.searchParams.has('thread_ts');
  return {
    provider: 'slack',
    label: `${workspace} · ${match[1]}${isThread ? ' · thread' : ''}`,
    host: parsed.hostname,
  };
}
