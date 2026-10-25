import type { Provider } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../app/core/supabase/supabase-client';

/** Minimal stand-in for the Supabase client used in unit tests. */
export function createSupabaseMock(session: Session | null = null) {
  const ok = { data: {}, error: null };
  return {
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn().mockResolvedValue({ data: { session }, error: null }),
      signInWithPassword: vi.fn().mockResolvedValue(ok),
      signUp: vi.fn().mockResolvedValue({ data: { user: {}, session: null }, error: null }),
      verifyOtp: vi.fn().mockResolvedValue(ok),
      resend: vi.fn().mockResolvedValue(ok),
      resetPasswordForEmail: vi.fn().mockResolvedValue(ok),
      updateUser: vi.fn().mockResolvedValue(ok),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn(),
  };
}

export type SupabaseMock = ReturnType<typeof createSupabaseMock>;

export function provideSupabaseMock(mock: SupabaseMock = createSupabaseMock()): Provider {
  return { provide: SUPABASE_CLIENT, useValue: mock };
}

export function fakeSession(userId = 'user-1'): Session {
  return {
    access_token: 'access',
    refresh_token: 'refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: userId, email: 'alice@test.local' },
  } as Session;
}
