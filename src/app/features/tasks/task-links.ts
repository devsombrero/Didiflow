/** External resources (links) of a task: validation, labels and icons. */

export const MAX_LINK_LENGTH = 2048;

export type LinkCheck = { ok: true; url: string } | { ok: false; error: string };

/**
 * Accepts "https://…" or a bare address ("docs.google.com/…", which gets
 * https://). Plain http, other schemes, credentials in the URL and hosts
 * without a dot are refused: the desktop app only opens https links.
 */
export function normalizeLink(input: string): LinkCheck {
  const raw = input.trim();
  if (!raw) return { ok: false, error: 'Informe o endereço do link.' };
  if (/\s/.test(raw)) return { ok: false, error: 'O endereço não pode ter espaços.' };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, error: 'Endereço inválido.' };
  }
  if (url.protocol !== 'https:') return { ok: false, error: 'Use um link começando com https://.' };
  if (url.username || url.password)
    return { ok: false, error: 'O link não pode conter usuário ou senha.' };
  if (!url.hostname.includes('.')) return { ok: false, error: 'Endereço inválido.' };
  const normalized = url.toString();
  if (normalized.length > MAX_LINK_LENGTH) return { ok: false, error: 'Link longo demais.' };
  return { ok: true, url: normalized };
}

/** "docs.google.com/document/…" — host plus a short path, without "www.". */
export function linkLabel(link: { url: string; title: string | null }): string {
  if (link.title?.trim()) return link.title.trim();
  return shortUrl(link.url);
}

export function shortUrl(value: string): string {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '');
    const path = url.pathname === '/' ? '' : url.pathname;
    const text = host + path;
    return text.length > 60 ? `${text.slice(0, 57)}…` : text;
  } catch {
    return value;
  }
}

const ICONS: [RegExp, string][] = [
  [/(^|\.)figma\.com$/, 'design_services'],
  [/(^|\.)(github\.com|gitlab\.com|bitbucket\.org)$/, 'code'],
  [/(^|\.)(docs|drive|sheets|slides)\.google\.com$/, 'description'],
  [/(^|\.)(atlassian\.net|jira\.com)$/, 'view_kanban'],
  [/(^|\.)slack\.com$/, 'forum'],
  [/(^|\.)(youtube\.com|youtu\.be|vimeo\.com|loom\.com)$/, 'smart_display'],
  [/(^|\.)(notion\.so|notion\.site|confluence\.com)$/, 'article'],
  [/(^|\.)(sharepoint\.com|onedrive\.live\.com|dropbox\.com)$/, 'cloud'],
];

export function linkIcon(value: string): string {
  try {
    const host = new URL(value).hostname;
    return ICONS.find(([pattern]) => pattern.test(host))?.[1] ?? 'link';
  } catch {
    return 'link';
  }
}
