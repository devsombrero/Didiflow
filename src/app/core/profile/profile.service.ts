import { inject, Injectable, signal } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import type { Tables, TablesUpdate } from '../supabase/database.types';
import { SUPABASE_CLIENT } from '../supabase/supabase-client';

export type Profile = Tables<'profiles'>;
export type UserPreferences = Tables<'user_preferences'>;
export type ProfileChanges = Pick<TablesUpdate<'profiles'>, 'display_name'>;
export type PreferencesChanges = Omit<
  TablesUpdate<'user_preferences'>,
  'user_id' | 'created_at' | 'updated_at'
>;

/** Profile and preferences of the signed-in user. RLS scopes every query. */
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly auth = inject(AuthService);

  readonly profile = signal<Profile | null>(null);
  readonly preferences = signal<UserPreferences | null>(null);

  async load(): Promise<void> {
    const userId = this.requireUserId();
    const [profile, preferences] = await Promise.all([
      this.supabase.from('profiles').select('*').eq('id', userId).single(),
      this.supabase.from('user_preferences').select('*').eq('user_id', userId).single(),
    ]);
    if (profile.error) throw profile.error;
    if (preferences.error) throw preferences.error;

    this.profile.set(profile.data);
    this.preferences.set(preferences.data);
  }

  async updateProfile(changes: ProfileChanges): Promise<void> {
    const { data, error } = await this.supabase
      .from('profiles')
      .update(changes)
      .eq('id', this.requireUserId())
      .select()
      .single();
    if (error) throw error;
    this.profile.set(data);
  }

  async updatePreferences(changes: PreferencesChanges): Promise<void> {
    const { data, error } = await this.supabase
      .from('user_preferences')
      .update(changes)
      .eq('user_id', this.requireUserId())
      .select()
      .single();
    if (error) throw error;
    this.preferences.set(data);
  }

  clear(): void {
    this.profile.set(null);
    this.preferences.set(null);
  }

  private requireUserId(): string {
    const userId = this.auth.user()?.id;
    if (!userId) throw new Error('Not authenticated');
    return userId;
  }
}
