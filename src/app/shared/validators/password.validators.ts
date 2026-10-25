import type { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Mirrors the Supabase Auth policy in supabase/config.toml. */
export const PASSWORD_MIN_LENGTH = 8;

export const passwordStrength: ValidatorFn = (control) => {
  const value: unknown = control.value;
  if (typeof value !== 'string' || value === '') return null;

  const missing = {
    length: value.length < PASSWORD_MIN_LENGTH,
    lowercase: !/[a-z]/.test(value),
    uppercase: !/[A-Z]/.test(value),
    digit: !/\d/.test(value),
  };
  return Object.values(missing).some(Boolean) ? { passwordStrength: missing } : null;
};

/** Group validator: the two controls must hold the same value. */
export function matchFields(field: string, confirmation: string): ValidatorFn {
  return (group: AbstractControl): ValidationErrors | null => {
    const a = group.get(field)?.value;
    const b = group.get(confirmation)?.value;
    return a && b && a !== b ? { fieldsMismatch: true } : null;
  };
}
