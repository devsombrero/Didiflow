import { inject, Pipe, type PipeTransform } from '@angular/core';
import { UserClock } from '../../core/profile/user-clock';
import { formatDateValue } from '../utils/format-date';

/** Formats dates with the user's format and time zone preferences. */
@Pipe({ name: 'appDate', pure: false })
export class AppDatePipe implements PipeTransform {
  private readonly clock = inject(UserClock);

  transform(value: string | null | undefined, withTime = false): string {
    if (!value) return '—';
    return formatDateValue(value, this.clock.dateFormat(), this.clock.timeZone(), withTime);
  }
}
