import { TestBed } from '@angular/core/testing';
import { AuthApiError, type AuthChangeEvent, type Session } from '@supabase/supabase-js';
import {
  createSupabaseMock,
  fakeSession,
  provideSupabaseMock,
  type SupabaseMock,
} from '../../../testing/supabase.mock';
import { AuthFailure } from './auth-errors';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let supabase: SupabaseMock;

  function setup(session: Session | null = null): AuthService {
    supabase = createSupabaseMock(session);
    TestBed.configureTestingModule({ providers: [provideSupabaseMock(supabase)] });
    return TestBed.inject(AuthService);
  }

  it('restores the persisted session', async () => {
    const auth = setup(fakeSession('user-1'));
    expect(auth.isAuthenticated()).toBe(false);

    await auth.ready;
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.user()?.id).toBe('user-1');
  });

  it('follows auth state changes', async () => {
    const auth = setup(fakeSession());
    await auth.ready;
    const listener = supabase.auth.onAuthStateChange.mock.calls[0] as unknown as [
      (event: AuthChangeEvent, session: Session | null) => void,
    ];

    listener[0]('SIGNED_OUT', null);
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('signs in and surfaces mapped errors', async () => {
    const auth = setup();
    await auth.signIn('alice@test.local', 'Secret123');
    expect(supabase.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'alice@test.local',
      password: 'Secret123',
    });

    supabase.auth.signInWithPassword.mockResolvedValueOnce({
      data: {},
      error: new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
    });
    await expect(auth.signIn('alice@test.local', 'wrong')).rejects.toMatchObject({
      code: 'invalid_credentials',
    });
  });

  it('reports when sign-up needs e-mail confirmation', async () => {
    const auth = setup();
    await expect(auth.signUp('a@test.local', 'Secret123', 'Alice')).resolves.toEqual({
      needsConfirmation: true,
    });
    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'a@test.local',
      password: 'Secret123',
      options: { data: { display_name: 'Alice' } },
    });

    supabase.auth.signUp.mockResolvedValueOnce({
      data: { user: {}, session: fakeSession() },
      error: null,
    });
    await expect(auth.signUp('a@test.local', 'Secret123', 'Alice')).resolves.toEqual({
      needsConfirmation: false,
    });
  });

  it('confirms sign-up with an e-mail OTP', async () => {
    const auth = setup();
    await auth.confirmSignUp('a@test.local', '123456');
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      email: 'a@test.local',
      token: '123456',
      type: 'email',
    });
  });

  it('resets the password only after the recovery code is verified', async () => {
    const auth = setup();
    await auth.resetPassword('a@test.local', '654321', 'NewSecret1');

    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({
      email: 'a@test.local',
      token: '654321',
      type: 'recovery',
    });
    expect(supabase.auth.updateUser).toHaveBeenCalledWith({ password: 'NewSecret1' });

    supabase.auth.updateUser.mockClear();
    supabase.auth.verifyOtp.mockResolvedValueOnce({
      data: {},
      error: new AuthApiError('Token has expired', 403, 'otp_expired'),
    });
    await expect(auth.resetPassword('a@test.local', '000000', 'NewSecret1')).rejects.toBeInstanceOf(
      AuthFailure,
    );
    expect(supabase.auth.updateUser).not.toHaveBeenCalled();
  });
});
