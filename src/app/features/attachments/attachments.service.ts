import { inject, Injectable } from '@angular/core';
import type { AttachmentAddResult, AttachmentUsage } from '../../../../electron/ipc/contract';
import { AuthService } from '../../core/auth/auth.service';
import { DesktopBridge } from '../../core/platform/desktop-bridge';
import type { Tables } from '../../core/supabase/database.types';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { remainingBytes } from './attachment-logic';

export type TaskAttachment = Tables<'task_attachments'>;

const PRUNE_PAGE = 10000;

/**
 * Task attachments: files stay on this computer (main process store) and the
 * metadata goes to the database, which also enforces the 50 MB quota.
 */
@Injectable({ providedIn: 'root' })
export class AttachmentsService {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly bridge = inject(DesktopBridge);
  private readonly auth = inject(AuthService);

  /** Files can be added and opened only in the desktop app. */
  get available(): boolean {
    return !!this.bridge.attachments;
  }

  private context(): { api: NonNullable<DesktopBridge['attachments']>; userId: string } {
    const api = this.bridge.attachments;
    const userId = this.auth.user()?.id;
    if (!api || !userId) throw new Error('Anexos disponíveis apenas no aplicativo desktop.');
    return { api, userId };
  }

  async list(taskId: string): Promise<TaskAttachment[]> {
    const { data, error } = await this.supabase
      .from('task_attachments')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at');
    if (error) throw error;
    return data;
  }

  /**
   * Picks files and records them. If the database refuses (quota reached in
   * another window, network error...), the copied files are removed again.
   */
  async add(taskId: string, current: readonly TaskAttachment[]): Promise<AttachmentAddResult> {
    const { api, userId } = this.context();
    const result = await api.add(userId, taskId, remainingBytes(current));
    if (result.status !== 'added') return result;

    const { error } = await this.supabase.from('task_attachments').insert(
      result.files.map((file) => ({
        id: file.id,
        task_id: taskId,
        file_name: file.name,
        mime_type: file.mimeType,
        size_bytes: file.size,
        sha256: file.sha256,
      })),
    );
    if (error) {
      await Promise.all(
        result.files.map((file) => api.remove(userId, taskId, file.id).catch(() => undefined)),
      );
      throw error;
    }
    return result;
  }

  /** Removes the record first, then the local file. */
  async remove(attachment: TaskAttachment): Promise<void> {
    const { error } = await this.supabase.from('task_attachments').delete().eq('id', attachment.id);
    if (error) throw error;
    const api = this.bridge.attachments;
    const userId = this.auth.user()?.id;
    if (api && userId) {
      await api.remove(userId, attachment.task_id, attachment.id).catch(() => undefined);
    }
  }

  open(attachment: TaskAttachment): Promise<'opened' | 'revealed' | 'missing'> {
    const { api, userId } = this.context();
    return api.open(userId, attachment.task_id, attachment.id);
  }

  reveal(attachment: TaskAttachment): Promise<boolean> {
    const { api, userId } = this.context();
    return api.reveal(userId, attachment.task_id, attachment.id);
  }

  async saveAs(attachment: TaskAttachment): Promise<boolean> {
    const { api, userId } = this.context();
    return (await api.saveAs(userId, attachment.task_id, attachment.id)).saved;
  }

  /** Which attachments have their file on this computer (all true outside desktop is unknown). */
  async presence(
    taskId: string,
    rows: readonly TaskAttachment[],
  ): Promise<Record<string, boolean>> {
    const api = this.bridge.attachments;
    const userId = this.auth.user()?.id;
    if (!api || !userId || rows.length === 0) return {};
    return api.exists(
      userId,
      taskId,
      rows.map((row) => row.id),
    );
  }

  async usage(): Promise<AttachmentUsage | null> {
    const api = this.bridge.attachments;
    const userId = this.auth.user()?.id;
    return api && userId ? api.usage(userId) : null;
  }

  /**
   * Deletes local files whose record no longer exists (task removed by a
   * replace restore, account data cleared...). Skipped unless the full id
   * list was read, so a partial page never deletes valid files.
   */
  async pruneOrphans(): Promise<number> {
    const api = this.bridge.attachments;
    const userId = this.auth.user()?.id;
    if (!api || !userId) return 0;
    const { data, count, error } = await this.supabase
      .from('task_attachments')
      .select('id', { count: 'exact' })
      .range(0, PRUNE_PAGE - 1);
    if (error || count === null || count !== data.length) return 0;
    return api.prune(
      userId,
      data.map((row) => row.id),
    );
  }
}
