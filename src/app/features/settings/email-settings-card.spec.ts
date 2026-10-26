import { FormControl } from '@angular/forms';
import { emailResultMessage } from '../notifications/email-messages';
import { appPasswordValidator } from './email-settings-card';

describe('e-mail settings', () => {
  it('accepts an empty field or a 16-letter app password', () => {
    const check = (value: string) =>
      appPasswordValidator(new FormControl(value, { nonNullable: true }));
    expect(check('')).toBeNull();
    expect(check('abcd efgh ijkl mnop')).toBeNull();
    expect(check('minhaSenha123')).toEqual({ appPassword: true });
  });

  it('explains delivery results', () => {
    expect(emailResultMessage({ status: 'sent' })).toBeNull();
    expect(emailResultMessage({ status: 'error', error: 'auth' })).toContain('senha de app');
    expect(emailResultMessage({ status: 'error', error: 'network' })).toContain('smtp.gmail.com');
    expect(emailResultMessage({ status: 'skipped', reason: 'not-configured' })).toContain('Gmail');
    expect(emailResultMessage({ status: 'skipped', reason: 'rate-limited' })).toContain('hora');
  });
});
