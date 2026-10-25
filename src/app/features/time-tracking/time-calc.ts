import type { Tables } from '../../core/supabase/database.types';
import { todayIn } from '../../shared/utils/dates';

export type TimeEntry = Tables<'time_entries'>;
export type TimeEntryTiming = Pick<
  TimeEntry,
  'started_at' | 'ended_at' | 'paused_at' | 'paused_seconds' | 'duration_seconds'
>;

/** Worked seconds of an entry; running entries are measured against `now`. */
export function workedSeconds(entry: TimeEntryTiming, now: number = Date.now()): number {
  if (entry.ended_at !== null && entry.duration_seconds !== null) return entry.duration_seconds;
  const start = Date.parse(entry.started_at);
  const pausedNow = entry.paused_at ? Math.max(0, now - Date.parse(entry.paused_at)) : 0;
  return Math.max(0, Math.floor((now - start - pausedNow) / 1000) - entry.paused_seconds);
}

export function isRunning(entry: Pick<TimeEntry, 'ended_at'> | null): boolean {
  return !!entry && entry.ended_at === null;
}

/** "2h 05min", "45min", "0min". */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.floor(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}min`;
  return `${hours}h ${String(minutes).padStart(2, '0')}min`;
}

/** "01:02:03" clock display for a running timer. */
export function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((n) => String(n).padStart(2, '0')).join(':');
}

/** Sum of worked seconds grouped by a key; `null` keys are grouped as ''. */
export function sumBy<T extends TimeEntryTiming>(
  entries: readonly T[],
  keyOf: (entry: T) => string | null,
  now: number = Date.now(),
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    const key = keyOf(entry) ?? '';
    totals.set(key, (totals.get(key) ?? 0) + workedSeconds(entry, now));
  }
  return totals;
}

/** Totals per calendar day (YYYY-MM-DD in the user's zone, by start time). */
export function totalsByDay(
  entries: readonly TimeEntryTiming[],
  timeZone: string,
  now: number = Date.now(),
): Map<string, number> {
  return sumBy(entries, (entry) => todayIn(timeZone, new Date(entry.started_at)), now);
}

export function totalSeconds(
  entries: readonly TimeEntryTiming[],
  now: number = Date.now(),
): number {
  return entries.reduce((sum, entry) => sum + workedSeconds(entry, now), 0);
}
