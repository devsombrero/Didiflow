import { summarizeDays } from './daily-hours-card';

describe('summarizeDays', () => {
  it('computes today, the average of worked days and days on target', () => {
    const days = [
      { day: '2026-10-24', seconds: 0 },
      { day: '2026-10-25', seconds: 9 * 3600 },
      { day: '2026-10-26', seconds: 3 * 3600 },
    ];
    expect(summarizeDays(days, '2026-10-26', 8)).toEqual({
      todaySeconds: 3 * 3600,
      averageSeconds: 6 * 3600,
      daysOnTarget: 1,
      workedDays: 2,
    });
  });

  it('handles no tracked time', () => {
    expect(summarizeDays([], '2026-10-26', 8)).toEqual({
      todaySeconds: 0,
      averageSeconds: 0,
      daysOnTarget: 0,
      workedDays: 0,
    });
  });
});
