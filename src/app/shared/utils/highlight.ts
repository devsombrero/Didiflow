export interface TextSegment {
  text: string;
  match: boolean;
}

/** Lowercases and strips diacritics while keeping a 1:1 character mapping. */
function fold(text: string): string {
  return [...text]
    .map(
      (char) =>
        char
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '')
          .toLowerCase()
          .charAt(0) || char,
    )
    .join('');
}

/** Search terms from a query: alphanumeric words, accent-folded. */
export function searchTerms(query: string): string[] {
  return fold(query)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length > 0)
    .slice(0, 8);
}

/**
 * Splits `text` into matching and non-matching segments for `terms`
 * (accent- and case-insensitive prefix/substring matches). Rendering the
 * segments with interpolation keeps user content escaped.
 */
export function highlight(text: string, terms: readonly string[]): TextSegment[] {
  if (!text) return [];
  const folded = fold(text);
  const marks = new Array<boolean>(text.length).fill(false);
  for (const term of terms) {
    if (!term) continue;
    for (let index = folded.indexOf(term); index !== -1; index = folded.indexOf(term, index + 1)) {
      for (let i = index; i < index + term.length && i < marks.length; i++) marks[i] = true;
    }
  }

  const segments: TextSegment[] = [];
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const last = segments.at(-1);
    if (last && last.match === marks[i]) last.text += chars[i];
    else segments.push({ text: chars[i], match: marks[i] });
  }
  return segments;
}

/** Excerpt of `text` around the first match (or its start), at most `size` characters. */
export function excerpt(text: string | null, terms: readonly string[], size = 160): string {
  if (!text) return '';
  const folded = fold(text);
  const first = terms
    .map((term) => folded.indexOf(term))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  if (first === undefined || text.length <= size) {
    return text.length <= size ? text : `${text.slice(0, size - 1)}…`;
  }
  const start = Math.max(0, first - Math.floor(size / 3));
  const end = Math.min(text.length, start + size);
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`;
}
