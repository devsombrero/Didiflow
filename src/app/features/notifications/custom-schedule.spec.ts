import {
  checkDue,
  describeSchedule,
  nextOccurrence,
  occurrencesBetween,
  type ScheduleRule,
  weekdayOf,
} from './custom-schedule';

const TZ = 'America/Sao_Paulo'; // UTC-3, no DST
const at = (iso: string) => new Date(iso);

function rule(partial: Partial<ScheduleRule>): ScheduleRule {
  return {
    schedule: 'daily',
    run_at: null,
    time_of_day: null,
    weekdays: null,
    interval_minutes: null,
    window_start: null,
    window_end: null,
    created_at: '2026-10-01T00:00:00Z',
    last_fired_at: null,
    ...partial,
  };
}

describe('custom notification schedule', () => {
  it('knows the day of week of a calendar date', () => {
    expect(weekdayOf('2026-10-25')).toBe(0); // Sunday
    expect(weekdayOf('2026-10-26')).toBe(1);
  });

  it('lists daily occurrences in the user time zone', () => {
    const daily = rule({ schedule: 'daily', time_of_day: '09:00:00' });
    const list = occurrencesBetween(
      daily,
      at('2026-10-25T00:00:00Z'),
      at('2026-10-27T00:00:00Z'),
      TZ,
    );
    expect(list.map((d) => d.toISOString())).toEqual([
      '2026-10-25T12:00:00.000Z',
      '2026-10-26T12:00:00.000Z',
    ]);
  });

  it('skips weekends for weekday rules and filters weekly days', () => {
    const from = at('2026-10-23T00:00:00Z'); // Friday
    const to = at('2026-10-27T23:00:00Z'); // Tuesday
    const weekdays = rule({ schedule: 'weekdays', time_of_day: '08:30' });
    expect(
      occurrencesBetween(weekdays, from, to, TZ).map((d) =>
        weekdayOf(d.toISOString().slice(0, 10)),
      ),
    ).toEqual([5, 1, 2]);
    const weekly = rule({ schedule: 'weekly', time_of_day: '10:00', weekdays: [0, 2] });
    expect(occurrencesBetween(weekly, from, to, TZ)).toHaveLength(2);
  });

  it('repeats intervals inside the active window only', () => {
    const water = rule({
      schedule: 'interval',
      interval_minutes: 90,
      window_start: '09:00',
      window_end: '12:00',
    });
    const list = occurrencesBetween(
      water,
      at('2026-10-26T11:00:00Z'),
      at('2026-10-26T20:00:00Z'),
      TZ,
    );
    expect(list.map((d) => d.toISOString())).toEqual([
      '2026-10-26T12:00:00.000Z', // 09:00
      '2026-10-26T13:30:00.000Z', // 10:30
      '2026-10-26T15:00:00.000Z', // 12:00
    ]);
  });

  it('counts intervals without a window from the creation time', () => {
    const every = rule({
      schedule: 'interval',
      interval_minutes: 30,
      created_at: '2026-10-26T10:10:00Z',
    });
    const list = occurrencesBetween(
      every,
      at('2026-10-26T10:10:00Z'),
      at('2026-10-26T11:15:00Z'),
      TZ,
    );
    expect(list.map((d) => d.toISOString())).toEqual([
      '2026-10-26T10:40:00.000Z',
      '2026-10-26T11:10:00.000Z',
    ]);
  });

  it('fires the latest pending occurrence once', () => {
    const daily = rule({
      schedule: 'daily',
      time_of_day: '09:00',
      last_fired_at: '2026-10-25T12:00:00Z',
    });
    const now = at('2026-10-26T12:05:00Z');
    const due = checkDue(daily, now, TZ);
    expect(due.fire?.toISOString()).toBe('2026-10-26T12:00:00.000Z');
    expect(due.advanceTo).toEqual(due.fire);
    expect(
      checkDue({ ...daily, last_fired_at: due.advanceTo!.toISOString() }, now, TZ).fire,
    ).toBeNull();
  });

  it('skips stale recurring occurrences instead of delivering them late', () => {
    const daily = rule({
      schedule: 'daily',
      time_of_day: '09:00',
      last_fired_at: '2026-10-20T12:00:00Z',
    });
    const due = checkDue(daily, at('2026-10-26T18:00:00Z'), TZ);
    expect(due.fire).toBeNull();
    expect(due.advanceTo?.toISOString()).toBe('2026-10-26T12:00:00.000Z');
  });

  it('delivers a one-off notification up to a day late, then never again', () => {
    const once = rule({
      schedule: 'once',
      run_at: '2026-10-26T12:00:00Z',
      created_at: '2026-10-26T13:00:00Z',
    });
    expect(checkDue(once, at('2026-10-26T11:59:00Z'), TZ).fire).toBeNull();
    expect(checkDue(once, at('2026-10-26T20:00:00Z'), TZ).fire?.toISOString()).toBe(
      '2026-10-26T12:00:00.000Z',
    );
    expect(
      checkDue({ ...once, last_fired_at: '2026-10-26T12:00:00Z' }, at('2026-10-26T20:00:00Z'), TZ)
        .fire,
    ).toBeNull();
    expect(checkDue(once, at('2026-10-28T20:00:00Z'), TZ).fire).toBeNull();
  });

  it('computes the next occurrence for display', () => {
    const weekly = rule({ schedule: 'weekly', time_of_day: '10:00', weekdays: [3] });
    expect(nextOccurrence(weekly, at('2026-10-26T12:00:00Z'), TZ)?.toISOString()).toBe(
      '2026-10-28T13:00:00.000Z',
    );
    const once = rule({ schedule: 'once', run_at: '2026-10-20T12:00:00Z' });
    expect(nextOccurrence(once, at('2026-10-26T12:00:00Z'), TZ)).toBeNull();
  });

  it('describes schedules in Portuguese', () => {
    expect(describeSchedule(rule({ schedule: 'weekdays', time_of_day: '09:00:00' }), TZ)).toBe(
      'Dias úteis às 09:00',
    );
    expect(
      describeSchedule(rule({ schedule: 'weekly', time_of_day: '10:00', weekdays: [5, 1] }), TZ),
    ).toBe('Seg, Sex às 10:00');
    expect(
      describeSchedule(
        rule({
          schedule: 'interval',
          interval_minutes: 90,
          window_start: '09:00:00',
          window_end: '18:00:00',
        }),
        TZ,
      ),
    ).toBe('A cada 1 h 30 min, das 09:00 às 18:00');
    expect(describeSchedule(rule({ schedule: 'interval', interval_minutes: 120 }), TZ)).toBe(
      'A cada 2 h',
    );
    expect(describeSchedule(rule({ schedule: 'once', run_at: '2026-10-26T12:00:00Z' }), TZ)).toBe(
      'Uma vez em 26/10/2026 às 09:00',
    );
  });
});
