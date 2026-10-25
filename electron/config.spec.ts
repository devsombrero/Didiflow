import { describe, expect, it } from 'vitest';
import { buildContentSecurityPolicy, supabaseSources } from './config';

const connectSrc = (csp: string) =>
  csp
    .split('; ')
    .find((d) => d.startsWith('connect-src'))!
    .split(' ')
    .slice(1);

describe('content security policy', () => {
  it('limits connect-src to the configured Supabase project in packaged builds', () => {
    const csp = buildContentSecurityPolicy(true, 'https://abc123.supabase.co');
    expect(connectSrc(csp)).toEqual([
      "'self'",
      'https://abc123.supabase.co',
      'wss://abc123.supabase.co',
    ]);
    expect(csp).not.toContain('*');
    expect(csp).not.toContain('127.0.0.1');
  });

  it('also allows the local stack in development builds', () => {
    expect(connectSrc(buildContentSecurityPolicy(false, 'https://abc123.supabase.co'))).toEqual([
      "'self'",
      'https://abc123.supabase.co',
      'wss://abc123.supabase.co',
      'http://127.0.0.1:54321',
      'ws://127.0.0.1:54321',
    ]);
  });

  it('keeps scripts and objects locked down', () => {
    const csp = buildContentSecurityPolicy(true, '');
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(connectSrc(csp)).toEqual(["'self'"]);
  });

  it('derives the WebSocket origin', () => {
    expect(supabaseSources('http://127.0.0.1:54321')).toEqual([
      'http://127.0.0.1:54321',
      'ws://127.0.0.1:54321',
    ]);
    expect(supabaseSources('')).toEqual([]);
  });
});
