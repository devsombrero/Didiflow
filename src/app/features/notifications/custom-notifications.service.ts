import { inject, Injectable, signal } from '@angular/core';
import type { Tables, TablesInsert } from '../../core/supabase/database.types';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';

export type CustomNotification = Tables<'custom_notifications'>;
export type CustomNotificationInput = Omit<
  TablesInsert<'custom_notifications'>,
  'id' | 'owner_id' | 'created_at' | 'updated_at' | 'last_fired_at'
>;

/** User-defined notifications (CRUD; RLS scopes every query to the owner). */
@Injectable({ providedIn: 'root' })
export class CustomNotificationsService {
  private readonly supabase = inject(SUPABASE_CLIENT);
  /** Bumped on every change so the scheduler reloads its cached rules. */
  readonly version = signal(0);

  async list(): Promise<CustomNotification[]> {
    const { data, error } = await this.supabase
      .from('custom_notifications')
      .select('*')
      .order('created_at');
    if (error) throw error;
    return data;
  }

  async active(): Promise<CustomNotification[]> {
    const { data, error } = await this.supabase
      .from('custom_notifications')
      .select('*')
      .eq('active', true)
      .limit(100);
    if (error) throw error;
    return data;
  }

  /** Creates or updates a rule. Editing the schedule restarts its counting. */
  async save(input: CustomNotificationInput, id?: string): Promise<CustomNotification> {
    const query = id
      ? this.supabase
          .from('custom_notifications')
          .update({ ...input, last_fired_at: null })
          .eq('id', id)
      : this.supabase.from('custom_notifications').insert(input);
    const { data, error } = await query.select().single();
    if (error) throw error;
    this.version.update((v) => v + 1);
    return data;
  }

  async setActive(id: string, active: boolean): Promise<void> {
    const { error } = await this.supabase
      .from('custom_notifications')
      .update({ active })
      .eq('id', id);
    if (error) throw error;
    this.version.update((v) => v + 1);
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.supabase.from('custom_notifications').delete().eq('id', id);
    if (error) throw error;
    this.version.update((v) => v + 1);
  }

  /** Records the delivered (or skipped) occurrence; one-off rules end there. */
  async markFired(rule: CustomNotification, at: Date): Promise<void> {
    const changes: { last_fired_at: string; active?: boolean } = {
      last_fired_at: at.toISOString(),
    };
    if (rule.schedule === 'once') changes.active = false;
    const { error } = await this.supabase
      .from('custom_notifications')
      .update(changes)
      .eq('id', rule.id);
    if (error) throw error;
  }
}
