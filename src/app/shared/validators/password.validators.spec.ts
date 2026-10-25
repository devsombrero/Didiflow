import { FormControl, FormGroup } from '@angular/forms';
import { matchFields, passwordStrength } from './password.validators';

describe('passwordStrength', () => {
  const check = (value: string) => passwordStrength(new FormControl(value));

  it('accepts passwords meeting the Supabase policy', () => {
    expect(check('Secret123')).toBeNull();
  });

  it('ignores empty values (required handles them)', () => {
    expect(check('')).toBeNull();
  });

  it('reports each missing requirement', () => {
    expect(check('Ab1')).toEqual({
      passwordStrength: { length: true, lowercase: false, uppercase: false, digit: false },
    });
    expect(check('secret123')?.['passwordStrength']).toMatchObject({ uppercase: true });
    expect(check('SECRET123')?.['passwordStrength']).toMatchObject({ lowercase: true });
    expect(check('SecretPass')?.['passwordStrength']).toMatchObject({ digit: true });
  });
});

describe('matchFields', () => {
  const group = (a: string, b: string) =>
    new FormGroup(
      { password: new FormControl(a), confirmation: new FormControl(b) },
      { validators: matchFields('password', 'confirmation') },
    );

  it('passes when values match or one is empty', () => {
    expect(group('Secret123', 'Secret123').errors).toBeNull();
    expect(group('Secret123', '').errors).toBeNull();
  });

  it('fails when values differ', () => {
    expect(group('Secret123', 'Secret124').errors).toEqual({ fieldsMismatch: true });
  });
});
