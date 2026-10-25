import {
  formatClock,
  formatDuration,
  sumBy,
  type TimeEntryTiming,
  totalsByDay,
  totalSeconds,
  workedSeconds,
} from './time-calc';

const entry = (overrides: Partial<TimeEntryTiming>): TimeEntryTiming => ({
  started_at: '2026-10-25T12:00:00Z',
  ended_at: null,
  paused_at: null,
  paused_seconds: 0,
  duration_seconds: null,
  ...overrides,
});

const at = (iso: string) => Date.parse(iso);

describe('workedSeconds', () => {
  it('uses the stored duration of finished entries', () => {
    expect(
      workedSeconds(entry({ ended_at: '2026-10-25T13:00:00Z', duration_seconds: 3000 }), 0),
    ).toBe(3000);
  });

  it('measures running entries against now, minus accumulated pauses', () => {
    expect(workedSeconds(entry({ paused_seconds: 120 }), at('2026-10-25T12:10:00Z'))).toBe(480);
  });

  it('excludes the current pause of a paused timer', () => {
    const paused = entry({ paused_at: '2026-10-25T12:06:00Z', paused_seconds: 60 });
    expect(workedSeconds(paused, at('2026-10-25T12:10:00Z'))).toBe(300);
  });

  it('never returns negative values (clock skew)', () => {
    expect(workedSeconds(entry({}), at('2026-10-25T11:59:00Z'))).toBe(0);
  });
});

describe('formatting', () => {
  it('formats durations', () => {
    expect(formatDuration(0)).toBe('0min');
    expect(formatDuration(45 * 60)).toBe('45min');
    expect(formatDuration(2 * 3600 + 5 * 60 + 59)).toBe('2h 05min');
  });

  it('formats a running clock', () => {
    expect(formatClock(3723)).toBe('01:02:03');
  });
});

describe('aggregation', () => {
  const entries = [
    entry({
      started_at: '2026-10-25T01:00:00Z',
      ended_at: '2026-10-25T02:00:00Z',
      duration_seconds: 3600,
    }),
    entry({
      started_at: '2026-10-25T15:00:00Z',
      ended_at: '2026-10-25T15:30:00Z',
      duration_seconds: 1800,
    }),
  ];

  it('groups by calendar day in the user zone', () => {
    // 01:00 UTC on the 25th is still the 24th in São Paulo.
    expect([...totalsByDay(entries, 'America/Sao_Paulo', 0)]).toEqual([
      ['2026-10-24', 3600],
      ['2026-10-25', 1800],
    ]);
  });

  it('sums by arbitrary keys and in total', () => {
    const tagged = entries.map((e, i) => ({ ...e, category: i === 0 ? 'dev' : null }));
    expect([...sumBy(tagged, (e) => e.category, 0)]).toEqual([
      ['dev', 3600],
      ['', 1800],
    ]);
    expect(totalSeconds(entries, 0)).toBe(5400);
  });
});
