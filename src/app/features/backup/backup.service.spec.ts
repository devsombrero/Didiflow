import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DesktopBridge } from '../../core/platform/desktop-bridge';
import { ProfileService, type UserPreferences } from '../../core/profile/profile.service';
import { createSupabaseMock, provideSupabaseMock } from '../../../testing/supabase.mock';
import { ExportService } from '../export/export.service';
import { OrganizationStore } from '../organization/organization.service';
import { TimerStore } from '../time-tracking/time.service';
import { BackupService } from './backup.service';

const backupJson = JSON.stringify({ format: 'didiflow-backup', version: 1, tables: { tasks: [] } });

describe('BackupService', () => {
  function setup(
    prefs: Partial<UserPreferences>,
    files: { kind: string; createdAt: string }[] = [],
  ) {
    const calls: string[] = [];
    const supabase = createSupabaseMock();
    const rpc = vi.fn(async () => {
      calls.push('rpc');
      return { data: { mode: 'merge', tables: {} }, error: null };
    });
    (supabase as unknown as { rpc: typeof rpc }).rpc = rpc;
    const backups = {
      list: vi.fn().mockResolvedValue(files),
      write: vi.fn(async (_content: string, kind: string) => {
        calls.push(`write:${kind}`);
        return { name: 'x', kind, size: 10, createdAt: new Date().toISOString() };
      }),
      read: vi.fn(),
      remove: vi.fn(),
      openFolder: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideSupabaseMock(supabase),
        { provide: DesktopBridge, useValue: { backups } },
        {
          provide: ProfileService,
          useValue: {
            preferences: signal({
              auto_backup_enabled: true,
              auto_backup_interval_hours: 24,
              backup_retention: 7,
              ...prefs,
            }),
            load: vi.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: ExportService,
          useValue: {
            build: vi.fn().mockResolvedValue({ name: 'b.json', kind: 'json', content: backupJson }),
          },
        },
        { provide: OrganizationStore, useValue: { load: vi.fn().mockResolvedValue(undefined) } },
        { provide: TimerStore, useValue: { refresh: vi.fn().mockResolvedValue(undefined) } },
      ],
    });
    return { service: TestBed.inject(BackupService), backups, rpc, calls };
  }

  it('stores a safety backup before restoring', async () => {
    const { service, rpc, calls } = setup({});
    await service.restore(backupJson, 'replace');

    expect(calls).toEqual(['write:prerestore', 'rpc']);
    expect(rpc).toHaveBeenCalledWith('restore_backup', {
      p_backup: JSON.parse(backupJson),
      p_mode: 'replace',
    });
  });

  it('rejects invalid files before touching anything', async () => {
    const { service, backups, rpc } = setup({});
    await expect(service.restore('{"format":"x"}', 'merge')).rejects.toThrow();
    expect(backups.write).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('creates automatic backups with the configured retention when due', async () => {
    const { service, backups } = setup({}, [{ kind: 'auto', createdAt: '2000-01-01T00:00:00Z' }]);
    await service.runAutomaticIfDue();
    expect(backups.write).toHaveBeenCalledWith(backupJson, 'auto', 7);
  });

  it('skips automatic backups when disabled or not due', async () => {
    const disabled = setup({ auto_backup_enabled: false });
    expect(await disabled.service.runAutomaticIfDue()).toBeNull();
    expect(disabled.backups.write).not.toHaveBeenCalled();

    TestBed.resetTestingModule();
    const recent = setup({}, [{ kind: 'auto', createdAt: new Date().toISOString() }]);
    expect(await recent.service.runAutomaticIfDue()).toBeNull();
  });
});
