import { inject, Injectable } from '@angular/core';
import type { BackupFile, BackupKind } from '../../../../electron/ipc/contract';
import { DesktopBridge } from '../../core/platform/desktop-bridge';
import { ProfileService } from '../../core/profile/profile.service';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { ExportService } from '../export/export.service';
import { OrganizationStore } from '../organization/organization.service';
import { TimerStore } from '../time-tracking/time.service';
import { isBackupDue, parseBackup, type RestoreResult } from './backup-logic';

export type RestoreMode = 'merge' | 'replace';

/** Local backups (desktop) and restore through the restore_backup RPC. */
@Injectable({ providedIn: 'root' })
export class BackupService {
  private readonly bridge = inject(DesktopBridge);
  private readonly exporter = inject(ExportService);
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly profile = inject(ProfileService);
  private readonly org = inject(OrganizationStore);
  private readonly timer = inject(TimerStore);

  get available(): boolean {
    return !!this.bridge.backups;
  }

  async list(): Promise<BackupFile[]> {
    return this.bridge.backups ? this.bridge.backups.list() : [];
  }

  /** Builds a full JSON backup and stores it in the local backups folder. */
  async create(kind: BackupKind): Promise<BackupFile> {
    const backups = this.bridge.backups;
    if (!backups) throw new Error('Backups locais disponíveis apenas no aplicativo desktop.');
    const file = await this.exporter.build('backup', 'json');
    const retention = this.profile.preferences()?.backup_retention ?? 10;
    return backups.write(file.content, kind, retention);
  }

  /** Creates an automatic backup when enabled and the interval has elapsed. */
  async runAutomaticIfDue(): Promise<BackupFile | null> {
    const prefs = this.profile.preferences();
    if (!this.bridge.backups || !prefs?.auto_backup_enabled) return null;
    const lastAuto = (await this.list()).find((file) => file.kind === 'auto');
    if (!isBackupDue(lastAuto?.createdAt ?? null, prefs.auto_backup_interval_hours)) return null;
    return this.create('auto');
  }

  read(name: string): Promise<string> {
    if (!this.bridge.backups) throw new Error('Backups locais indisponíveis.');
    return this.bridge.backups.read(name);
  }

  remove(name: string): Promise<void> {
    if (!this.bridge.backups) throw new Error('Backups locais indisponíveis.');
    return this.bridge.backups.remove(name);
  }

  openFolder(): Promise<void> {
    if (!this.bridge.backups) throw new Error('Backups locais indisponíveis.');
    return this.bridge.backups.openFolder();
  }

  /**
   * Restores a backup. A safety backup of the current data is stored first
   * (desktop), then caches are refreshed.
   */
  async restore(content: string, mode: RestoreMode): Promise<RestoreResult> {
    const { data } = parseBackup(content);
    if (this.bridge.backups) await this.create('prerestore');

    const { data: result, error } = await this.supabase.rpc('restore_backup', {
      p_backup: data as never,
      p_mode: mode,
    });
    if (error) throw error;

    await Promise.all([
      this.profile.load().catch(() => undefined),
      this.org.load().catch(() => undefined),
      this.timer.refresh().catch(() => undefined),
    ]);
    return result as unknown as RestoreResult;
  }
}
