import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

const HTTPS_URL = /^https:\/\/[^\s]+$/;

export function isHttpsUrl(value: unknown): boolean {
  if (typeof value !== 'string' || !HTTPS_URL.test(value) || value.length > 2048) return false;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Group validator for an optional link: when `flag` is on, `url` must be an
 * https URL (mirrors tasks_jira_link_check / tasks_slack_link_check).
 */
export function linkRequiredWhen(flag: string, url: string, errorKey: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    if (!group.get(flag)?.value) return null;
    const value = String(group.get(url)?.value ?? '').trim();
    if (!value) return { [errorKey]: 'required' };
    return isHttpsUrl(value) ? null : { [errorKey]: 'invalid' };
  };
}

/** Due date may not precede the start date (mirrors tasks_dates_check). */
export const dueAfterStart: ValidatorFn = (group) => {
  const start = group.get('start_date')?.value;
  const due = group.get('due_date')?.value;
  return start && due && due < start ? { dueBeforeStart: true } : null;
};
