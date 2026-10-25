import { BOM, type CsvColumn, toCsv } from './csv';

interface Row {
  title: string;
  tags?: string[];
  n?: number | null;
}

describe('toCsv', () => {
  const columns: CsvColumn<Row>[] = [
    { label: 'Título', value: (r) => r.title },
    { label: 'Tags', value: (r) => r.tags },
    { label: 'Número', value: (r) => r.n },
  ];

  it('writes a BOM, header and CRLF rows with ; separator', () => {
    expect(toCsv([{ title: 'Relatório', tags: ['a', 'b'], n: 3 }], columns)).toBe(
      `${BOM}Título;Tags;Número\r\nRelatório;a, b;3\r\n`,
    );
  });

  it('quotes separators, quotes and line breaks', () => {
    const csv = toCsv([{ title: 'a;b "c"\nd', n: null }], columns);
    expect(csv.split('\r\n')[1]).toBe('"a;b ""c""\nd";;');
  });

  it('neutralizes spreadsheet formulas', () => {
    for (const title of ['=HYPERLINK("x")', '+1', '-1+2', '@SUM(A1)', '\tx']) {
      const line = toCsv([{ title }], columns).split('\r\n')[1];
      expect(line.startsWith("'") || line.startsWith(`"'`)).toBe(true);
    }
  });

  it('supports a custom separator', () => {
    expect(toCsv([{ title: 'a,b' }], columns.slice(0, 1), ',')).toBe(`${BOM}Título\r\n"a,b"\r\n`);
  });
});
