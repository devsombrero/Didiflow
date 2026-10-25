import { excerpt, highlight, searchTerms } from './highlight';

describe('searchTerms', () => {
  it('folds accents and splits on non-alphanumerics', () => {
    expect(searchTerms('  Relatório, ÉTICA & vendas!! ')).toEqual(['relatorio', 'etica', 'vendas']);
    expect(searchTerms(`':*&|!()`)).toEqual([]);
  });
});

describe('highlight', () => {
  it('marks accent-insensitive matches while keeping the original text', () => {
    expect(highlight('Relatório mensal', ['relat'])).toEqual([
      { text: 'Relat', match: true },
      { text: 'ório mensal', match: false },
    ]);
  });

  it('merges overlapping matches and handles several terms', () => {
    const segments = highlight('Ajuste no ETL do relatório', ['etl', 'relatorio']);
    expect(segments.filter((s) => s.match).map((s) => s.text)).toEqual(['ETL', 'relatório']);
  });

  it('treats markup as plain text', () => {
    expect(highlight('<b>x</b>', ['b'])[0]).toEqual({ text: '<', match: false });
  });
});

describe('excerpt', () => {
  const long = `${'a'.repeat(200)} contrato importante ${'b'.repeat(200)}`;

  it('centers on the first match', () => {
    const result = excerpt(long, ['contrato'], 60);
    expect(result.startsWith('…')).toBe(true);
    expect(result).toContain('contrato');
    expect(result.length).toBeLessThanOrEqual(62);
  });

  it('returns short texts unchanged and truncates without matches', () => {
    expect(excerpt('curto', ['x'])).toBe('curto');
    expect(excerpt(long, ['zzz'], 20)).toHaveLength(20);
    expect(excerpt(null, ['x'])).toBe('');
  });
});
