import { formatDateValue } from './format-date';

describe('formatDateValue', () => {
  it('formats date-only values without time zone shifts', () => {
    expect(formatDateValue('2026-10-05', 'dd/MM/yyyy', 'Pacific/Kiritimati')).toBe('05/10/2026');
    expect(formatDateValue('2026-10-05', 'MM/dd/yyyy', 'UTC')).toBe('10/05/2026');
    expect(formatDateValue('2026-10-05', 'yyyy-MM-dd', 'UTC')).toBe('2026-10-05');
  });

  it('converts timestamps to the user time zone', () => {
    const value = '2026-10-26T01:30:00Z';
    expect(formatDateValue(value, 'dd/MM/yyyy', 'America/Sao_Paulo')).toBe('25/10/2026');
    expect(formatDateValue(value, 'dd/MM/yyyy', 'America/Sao_Paulo', true)).toBe(
      '25/10/2026 22:30',
    );
  });

  it('returns unparseable values unchanged', () => {
    expect(formatDateValue('not a date', 'dd/MM/yyyy', 'UTC')).toBe('not a date');
  });
});
