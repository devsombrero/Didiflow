import { addDays, timeIn, todayIn, zonedDateTime } from '../../shared/utils/dates';

export type CustomSchedule = 'once' | 'daily' | 'weekdays' | 'weekly' | 'interval';

/** Scheduling fields of a custom notification (database row subset). */
export interface ScheduleRule {
  /** One of CustomSchedule (the database column is plain text). */
  schedule: CustomSchedule | (string & {});
  run_at: string | null;
  time_of_day: string | null;
  weekdays: number[] | null;
  interval_minutes: number | null;
  window_start: string | null;
  window_end: string | null;
  created_at: string;
  last_fired_at: string | null;
}

/** A missed recurring occurrence older than this is skipped, not delivered late. */
export const RECURRING_GRACE_MS = 60 * 60 * 1000;
/** A missed one-off notification is still delivered up to a day late. */
export const ONCE_GRACE_MS = 24 * 60 * 60 * 1000;

const MINUTE = 60 * 1000;
export const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const hhmm = (time: string) => time.slice(0, 5);

/** Day of week (0 = Sunday) of a YYYY-MM-DD calendar date. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function dayMatches(rule: ScheduleRule, date: string): boolean {
  const day = weekdayOf(date);
  switch (rule.schedule) {
    case 'weekdays':
      return day >= 1 && day <= 5;
    case 'weekly':
      return (rule.weekdays ?? []).includes(day);
    default:
      return true;
  }
}

/** Occurrences in the half-open range (from, to], oldest first. */
export function occurrencesBetween(
  rule: ScheduleRule,
  from: Date,
  to: Date,
  timeZone: string,
): Date[] {
  if (to <= from) return [];
  if (rule.schedule === 'once') {
    const at = rule.run_at ? new Date(rule.run_at) : null;
    return at && at > from && at <= to ? [at] : [];
  }

  const result: Date[] = [];
  const firstDay = addDays(todayIn(timeZone, from), -1);
  const lastDay = todayIn(timeZone, to);

  if (rule.schedule === 'interval') {
    const step = (rule.interval_minutes ?? 60) * MINUTE;
    if (rule.window_start && rule.window_end) {
      // Every N minutes from the window start, each day, until the window end.
      for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
        const start = zonedDateTime(day, hhmm(rule.window_start), timeZone).getTime();
        const end = zonedDateTime(day, hhmm(rule.window_end), timeZone).getTime();
        for (let t = start; t <= end; t += step) {
          if (t > from.getTime() && t <= to.getTime()) result.push(new Date(t));
        }
      }
      return result;
    }
    // No window: every N minutes counted from when the rule was created.
    const anchor = new Date(rule.created_at).getTime();
    const first = Math.max(anchor, from.getTime());
    let t = anchor + Math.ceil((first - anchor) / step) * step;
    if (t === from.getTime()) t += step;
    for (; t <= to.getTime(); t += step) result.push(new Date(t));
    return result;
  }

  if (!rule.time_of_day) return [];
  for (let day = firstDay; day <= lastDay; day = addDays(day, 1)) {
    if (!dayMatches(rule, day)) continue;
    const at = zonedDateTime(day, hhmm(rule.time_of_day), timeZone);
    if (at > from && at <= to) result.push(at);
  }
  return result;
}

export interface DueCheck {
  /** Occurrence to deliver now, if any. */
  fire: Date | null;
  /** New last_fired_at (also set when a stale occurrence is skipped). */
  advanceTo: Date | null;
}

/**
 * What to do on a scheduler pass: deliver the latest pending occurrence when
 * it is recent enough; otherwise just move last_fired_at forward so a
 * backlog (app closed for hours) never floods the user.
 */
export function checkDue(rule: ScheduleRule, now: Date, timeZone: string): DueCheck {
  const since = new Date(rule.last_fired_at ?? rule.created_at);
  // A one-off created for a time already past still fires once.
  const from =
    rule.schedule === 'once' && !rule.last_fired_at
      ? new Date(now.getTime() - ONCE_GRACE_MS)
      : since;
  const pending = occurrencesBetween(rule, from, now, timeZone);
  const latest = pending.at(-1);
  if (!latest) return { fire: null, advanceTo: null };
  const grace = rule.schedule === 'once' ? ONCE_GRACE_MS : RECURRING_GRACE_MS;
  const fresh = now.getTime() - latest.getTime() <= grace;
  return { fire: fresh ? latest : null, advanceTo: latest };
}

/** Next occurrence after `now` (looks ahead 8 days), for display. */
export function nextOccurrence(rule: ScheduleRule, now: Date, timeZone: string): Date | null {
  if (rule.schedule === 'once') {
    if (rule.last_fired_at || !rule.run_at) return null;
    const at = new Date(rule.run_at);
    return at > now ? at : null;
  }
  const horizon = new Date(now.getTime() + 8 * 24 * 60 * MINUTE);
  return occurrencesBetween(rule, now, horizon, timeZone)[0] ?? null;
}

/** Short human description, e.g. "Dias úteis às 09:00". */
export function describeSchedule(rule: ScheduleRule, timeZone: string): string {
  const time = rule.time_of_day ? hhmm(rule.time_of_day) : '';
  switch (rule.schedule) {
    case 'once': {
      if (!rule.run_at) return 'Uma vez';
      const at = new Date(rule.run_at);
      const [y, m, d] = todayIn(timeZone, at).split('-');
      return `Uma vez em ${d}/${m}/${y} às ${timeIn(timeZone, at)}`;
    }
    case 'daily':
      return `Todos os dias às ${time}`;
    case 'weekdays':
      return `Dias úteis às ${time}`;
    case 'weekly': {
      const days = [...(rule.weekdays ?? [])].sort().map((d) => WEEKDAY_LABELS[d]);
      return `${days.join(', ')} às ${time}`;
    }
    case 'interval': {
      const minutes = rule.interval_minutes ?? 60;
      const every =
        minutes % 60 === 0
          ? `${minutes / 60} h`
          : minutes > 60
            ? `${Math.floor(minutes / 60)} h ${minutes % 60} min`
            : `${minutes} min`;
      const window =
        rule.window_start && rule.window_end
          ? `, das ${hhmm(rule.window_start)} às ${hhmm(rule.window_end)}`
          : '';
      return `A cada ${every}${window}`;
    }
    default:
      return rule.schedule;
  }
}
