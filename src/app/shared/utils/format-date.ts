import { todayIn } from './dates';

export type DateFormat = 'dd/MM/yyyy' | 'MM/dd/yyyy' | 'yyyy-MM-dd';

/**
 * Formats a date-only value (YYYY-MM-DD) or a timestamp following the user's
 * date format preference. Timestamps are converted to the user's time zone.
 */
export function formatDateValue(
  value: string,
  format: string,
  timeZone: string,
  withTime = false,
): string {
  const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const instant = isDateOnly ? null : new Date(value);
  if (instant && Number.isNaN(instant.getTime())) return value;

  const ymd = instant ? todayIn(timeZone, instant) : value;
  const [year, month, day] = ymd.split('-');
  const date =
    format === 'MM/dd/yyyy'
      ? `${month}/${day}/${year}`
      : format === 'yyyy-MM-dd'
        ? ymd
        : `${day}/${month}/${year}`;

  if (!withTime || !instant) return date;
  const time = new Intl.DateTimeFormat('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  }).format(instant);
  return `${date} ${time}`;
}
