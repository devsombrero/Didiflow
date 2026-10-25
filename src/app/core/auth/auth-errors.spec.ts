import { AuthApiError, AuthRetryableFetchError } from '@supabase/supabase-js';
import { AuthFailure, toAuthFailure } from './auth-errors';

describe('toAuthFailure', () => {
  it('maps known Supabase codes to pt-BR messages', () => {
    const failure = toAuthFailure(new AuthApiError('Invalid login', 400, 'invalid_credentials'));
    expect(failure).toBeInstanceOf(AuthFailure);
    expect(failure.code).toBe('invalid_credentials');
    expect(failure.message).toBe('E-mail ou senha incorretos.');
  });

  it('maps network failures', () => {
    const failure = toAuthFailure(new AuthRetryableFetchError('Failed to fetch', 0));
    expect(failure.code).toBe('network');
    expect(failure.message).toContain('conectar ao servidor');
  });

  it('uses a generic message for unknown codes and non-auth errors', () => {
    expect(toAuthFailure(new AuthApiError('x', 500, 'unexpected_failure')).message).toContain(
      'Tente novamente',
    );
    expect(toAuthFailure(new Error('boom')).code).toBe('unknown');
  });

  it('returns AuthFailure instances unchanged', () => {
    const failure = new AuthFailure('otp_expired', 'msg');
    expect(toAuthFailure(failure)).toBe(failure);
  });
});
