import { describe, expect, it } from 'vitest';
import {
  assertExternalUrl,
  assertNotification,
  isAppRoute,
  assertStoreKey,
  assertStoreValue,
  IpcValidationError,
  isTrustedOrigin,
  MAX_STORE_VALUE_LENGTH,
} from './validation';

describe('assertStoreKey', () => {
  it('accepts Supabase-style keys', () => {
    expect(assertStoreKey('sb-127-auth-token')).toBe('sb-127-auth-token');
    expect(assertStoreKey('sb-abc.auth:token_v2')).toBe('sb-abc.auth:token_v2');
  });

  it.each([undefined, null, 42, {}, '', 'a/b', '../x', 'a b', 'x'.repeat(129)])(
    'rejects %j',
    (key) => {
      expect(() => assertStoreKey(key)).toThrow(IpcValidationError);
    },
  );
});

describe('assertStoreValue', () => {
  it('accepts strings up to the limit', () => {
    expect(assertStoreValue('')).toBe('');
    expect(assertStoreValue('x'.repeat(MAX_STORE_VALUE_LENGTH))).toHaveLength(
      MAX_STORE_VALUE_LENGTH,
    );
  });

  it('rejects non-strings and oversized values', () => {
    expect(() => assertStoreValue(1)).toThrow(IpcValidationError);
    expect(() => assertStoreValue({ token: 'x' })).toThrow(IpcValidationError);
    expect(() => assertStoreValue('x'.repeat(MAX_STORE_VALUE_LENGTH + 1))).toThrow(
      IpcValidationError,
    );
  });
});

describe('assertExternalUrl', () => {
  it('accepts https URLs and normalizes them', () => {
    expect(assertExternalUrl('https://company.atlassian.net/browse/DF-1')).toBe(
      'https://company.atlassian.net/browse/DF-1',
    );
    expect(assertExternalUrl('https://Slack.com')).toBe('https://slack.com/');
  });

  it.each([
    'http://example.com',
    'file:///C:/Windows/System32/calc.exe',
    'javascript:alert(1)',
    'ms-settings:',
    'https://user:pass@example.com',
    'not a url',
    '',
    42,
    `https://example.com/${'a'.repeat(2048)}`,
  ])('rejects %j', (url) => {
    expect(() => assertExternalUrl(url)).toThrow(IpcValidationError);
  });
});

describe('isTrustedOrigin', () => {
  const trusted = ['app://didiflow', 'http://localhost:4200'];

  it('accepts trusted origins', () => {
    expect(isTrustedOrigin('app://didiflow/tasks', trusted)).toBe(true);
    expect(isTrustedOrigin('http://localhost:4200/', trusted)).toBe(true);
  });

  it('rejects other origins and invalid input', () => {
    expect(isTrustedOrigin('https://evil.example', trusted)).toBe(false);
    expect(isTrustedOrigin('app://didiflow.evil/x', trusted)).toBe(false);
    expect(isTrustedOrigin('http://localhost:4201/', trusted)).toBe(false);
    expect(isTrustedOrigin('app://didiflow@evil/x', trusted)).toBe(false);
    expect(isTrustedOrigin('app:didiflow', trusted)).toBe(false);
    expect(isTrustedOrigin('null', ['null'])).toBe(false);
    expect(isTrustedOrigin(undefined, trusted)).toBe(false);
    expect(isTrustedOrigin('::::', trusted)).toBe(false);
  });
});

describe('assertNotification', () => {
  it('accepts a title with optional body and route', () => {
    expect(
      assertNotification({
        title: ' Lembrete ',
        body: 'Revisar contrato',
        route: '/tasks/abc-123',
      }),
    ).toEqual({
      title: 'Lembrete',
      body: 'Revisar contrato',
      route: '/tasks/abc-123',
    });
    expect(assertNotification({ title: 'Oi' })).toEqual({ title: 'Oi', body: '', route: null });
  });

  it.each([
    null,
    'text',
    { title: '' },
    { title: 'x'.repeat(121) },
    { title: 'ok', body: 42 },
    { title: 'ok', body: 'x'.repeat(501) },
    { title: 'ok', route: 'https://evil.example' },
    { title: 'ok', route: '/tasks/../../etc' },
    { title: 'ok', route: 'javascript:alert(1)' },
  ])('rejects %j', (payload) => {
    expect(() => assertNotification(payload)).toThrow(IpcValidationError);
  });
});

describe('isAppRoute', () => {
  it('accepts in-app paths only', () => {
    expect(isAppRoute('/')).toBe(true);
    expect(isAppRoute('/tasks')).toBe(true);
    expect(isAppRoute('//evil.example')).toBe(false);
    expect(isAppRoute('tasks')).toBe(false);
    expect(isAppRoute('/tasks?x=1')).toBe(false);
  });
});
