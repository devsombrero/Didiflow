import { computed, inject, Injectable, signal } from '@angular/core';
import type { Session } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from '../supabase/supabase-client';
import { toAuthFailure } from './auth-errors';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly sessionState = signal<Session | null>(null);

  readonly session = this.sessionState.asReadonly();
  readonly user = computed(() => this.sessionState()?.user ?? null);
  readonly isAuthenticated = computed(() => this.sessionState() !== null);

  /** Resolves once the persisted session has been restored. */
  readonly ready: Promise<void>;

  constructor() {
    this.supabase.auth.onAuthStateChange((_event, session) => this.sessionState.set(session));
    this.ready = this.supabase.auth
      .getSession()
      .then(({ data }) => this.sessionState.set(data.session))
      .catch(() => this.sessionState.set(null));
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw toAuthFailure(error);
  }

  /** Returns whether the e-mail must be confirmed with a code before signing in. */
  async signUp(
    email: string,
    password: string,
    displayName: string,
  ): Promise<{ needsConfirmation: boolean }> {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: displayName } },
    });
    if (error) throw toAuthFailure(error);
    return { needsConfirmation: data.session === null };
  }

  async confirmSignUp(email: string, code: string): Promise<void> {
    const { error } = await this.supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    if (error) throw toAuthFailure(error);
  }

  async resendSignUpCode(email: string): Promise<void> {
    const { error } = await this.supabase.auth.resend({ type: 'signup', email });
    if (error) throw toAuthFailure(error);
  }

  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email);
    if (error) throw toAuthFailure(error);
  }

  /** Verifies the recovery code (which signs the user in) and sets the new password. */
  async resetPassword(email: string, code: string, newPassword: string): Promise<void> {
    const verified = await this.supabase.auth.verifyOtp({ email, token: code, type: 'recovery' });
    if (verified.error) throw toAuthFailure(verified.error);

    const { error } = await this.supabase.auth.updateUser({ password: newPassword });
    if (error) throw toAuthFailure(error);
  }

  async signOut(): Promise<void> {
    const { error } = await this.supabase.auth.signOut();
    if (error) throw toAuthFailure(error);
  }
}
