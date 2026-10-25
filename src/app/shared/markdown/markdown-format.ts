/** Formatting actions offered by the Markdown editor toolbar. */
export type MarkdownAction =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'heading'
  | 'bullets'
  | 'numbers'
  | 'checklist'
  | 'quote'
  | 'code'
  | 'link';

export interface TextEdit {
  value: string;
  selectionStart: number;
  selectionEnd: number;
}

const WRAPPERS: Partial<Record<MarkdownAction, [string, string, string]>> = {
  bold: ['**', '**', 'texto em negrito'],
  italic: ['_', '_', 'texto em itálico'],
  strike: ['~~', '~~', 'texto riscado'],
  code: ['`', '`', 'código'],
};

const LINE_PREFIXES: Partial<Record<MarkdownAction, (index: number) => string>> = {
  heading: () => '## ',
  bullets: () => '- ',
  numbers: (index) => `${index + 1}. `,
  checklist: () => '- [ ] ',
  quote: () => '> ',
};

/**
 * Applies a toolbar action to the textarea value and returns the new value
 * and selection. Inline actions wrap the selection (or a placeholder);
 * block actions prefix every selected line.
 */
export function applyMarkdown(edit: TextEdit, action: MarkdownAction): TextEdit {
  const { value, selectionStart: start, selectionEnd: end } = edit;
  const selected = value.slice(start, end);

  if (action === 'link') {
    const text = selected || 'texto do link';
    const url = 'https://';
    const inserted = `[${text}](${url})`;
    const urlStart = start + text.length + 3;
    return {
      value: value.slice(0, start) + inserted + value.slice(end),
      selectionStart: urlStart,
      selectionEnd: urlStart + url.length,
    };
  }

  const wrapper = WRAPPERS[action];
  if (wrapper) {
    const [before, after, placeholder] = wrapper;
    const text = selected || placeholder;
    return {
      value: value.slice(0, start) + before + text + after + value.slice(end),
      selectionStart: start + before.length,
      selectionEnd: start + before.length + text.length,
    };
  }

  const prefix = LINE_PREFIXES[action];
  if (!prefix) return edit;
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const nextBreak = value.indexOf('\n', end);
  const lineEnd = nextBreak === -1 ? value.length : nextBreak;
  const lines = value.slice(lineStart, lineEnd).split('\n');
  const block = lines.map((line, i) => prefix(i) + line).join('\n');
  return {
    value: value.slice(0, lineStart) + block + value.slice(lineEnd),
    selectionStart: lineStart,
    selectionEnd: lineStart + block.length,
  };
}

/**
 * Plain-text version of Markdown for snippets and previews: keeps the words,
 * drops syntax (headings, emphasis, links, list and checklist markers).
 */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[^\n]*\n?/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*(?:[-*+]|\d+\.)\s+(?:\[[ xX]\]\s+)?/gm, '')
    .replace(/(\*\*|__|~~|`)(.+?)\1/g, '$2')
    .replace(/(^|\W)[*_](\S(?:.*?\S)?)[*_](?=\W|$)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}
