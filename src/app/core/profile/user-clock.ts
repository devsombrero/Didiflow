import { computed, inject, Injectable } from '@angular/core';
import { todayIn } from '../../shared/utils/dates';
import { ProfileService } from './profile.service';

const BROWSER_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;

/** Time zone and date format from the user's preferences, with sensible fallbacks. */
@Injectable({ providedIn: 'root' })
export class UserClock {
  private readonly preferences = inject(ProfileService).preferences;

  readonly timeZone = computed(() => this.preferences()?.timezone ?? BROWSER_TIME_ZONE);
  readonly dateFormat = computed(() => this.preferences()?.date_format ?? 'dd/MM/yyyy');
  readonly dueSoonDays = computed(() => this.preferences()?.due_soon_days ?? 2);

  /** Today's calendar date (YYYY-MM-DD) in the user's time zone. */
  today(): string {
    return todayIn(this.timeZone());
  }
}
