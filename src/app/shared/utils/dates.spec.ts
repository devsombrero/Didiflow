import { addDays, daysBetween, isValidDate, todayIn } from './dates';

describe('date utils', () => {
  it('computes the calendar date in the user time zone', () => {
    const instant = new Date('2026-10-26T01:30:00Z');
    expect(todayIn('UTC', instant)).toBe('2026-10-26');
    expect(todayIn('America/Sao_Paulo', instant)).toBe('2026-10-25');
    expect(todayIn('Asia/Tokyo', new Date('2026-10-25T16:00:00Z'))).toBe('2026-10-26');
  });

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts whole days between dates', () => {
    expect(daysBetween('2026-10-01', '2026-10-10')).toBe(9);
    expect(daysBetween('2026-10-10', '2026-10-01')).toBe(-9);
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
  });

  it('validates YYYY-MM-DD dates', () => {
    expect(isValidDate('2026-02-28')).toBe(true);
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('26-02-01')).toBe(false);
    expect(isValidDate(null)).toBe(false);
  });
});
