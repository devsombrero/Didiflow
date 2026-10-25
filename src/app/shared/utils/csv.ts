export interface CsvColumn<T> {
  label: string;
  value: (row: T) => unknown;
}

/** UTF-8 byte order mark: makes Excel read the file as UTF-8. */
export const BOM = String.fromCharCode(0xfeff);

/** Characters that make spreadsheets evaluate a cell as a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: unknown, separator: string): string {
  if (value === null || value === undefined) return '';
  let text = Array.isArray(value)
    ? value.join(', ')
    : typeof value === 'object'
      ? JSON.stringify(value)
      : String(value);
  // CSV injection guard: neutralize values a spreadsheet would execute.
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /["\r\n]/.test(text) || text.includes(separator) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * RFC 4180 CSV with a UTF-8 BOM (Excel) and `;` as the default separator,
 * which pt-BR spreadsheets expect because `,` is the decimal mark.
 */
export function toCsv<T>(
  rows: readonly T[],
  columns: readonly CsvColumn<T>[],
  separator = ';',
): string {
  const header = columns.map((column) => cell(column.label, separator)).join(separator);
  const lines = rows.map((row) =>
    columns.map((column) => cell(column.value(row), separator)).join(separator),
  );
  return `${BOM}${[header, ...lines].join('\r\n')}\r\n`;
}
