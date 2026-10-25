import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertBackupContent,
  assertBackupName,
  assertRetention,
  BackupStore,
  backupStamp,
} from './backups';
import { IpcValidationError } from './validation';

const backup = JSON.stringify({ format: 'didiflow-backup', version: 1, tables: {} });

describe('backup validation', () => {
  it('accepts only DidiFlow backup names', () => {
    expect(assertBackupName('didiflow-backup-20261026T091500Z-auto.json')).toBeTruthy();
    for (const name of ['../x.json', 'didiflow-backup-x-auto.json', 'evil.json', 42]) {
      expect(() => assertBackupName(name)).toThrow(IpcValidationError);
    }
  });

  it('accepts only DidiFlow backup content', () => {
    expect(assertBackupContent(backup)).toBe(backup);
    expect(() => assertBackupContent('{not json')).toThrow(IpcValidationError);
    expect(() => assertBackupContent('{"format":"other"}')).toThrow(IpcValidationError);
  });

  it('bounds the retention', () => {
    expect(assertRetention(10)).toBe(10);
    for (const value of [0, 101, 2.5, '10']) {
      expect(() => assertRetention(value)).toThrow(IpcValidationError);
    }
  });

  it('builds sortable filename stamps', () => {
    expect(backupStamp(new Date('2026-10-26T09:15:00.123Z'))).toBe('20261026T091500Z');
  });
});

describe('BackupStore', () => {
  let dir: string;
  let store: BackupStore;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'didiflow-backups-'));
    store = new BackupStore(path.join(dir, 'backups'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes, lists newest first and reads backups', async () => {
    await store.write(backup, 'manual', 10, new Date('2026-10-25T10:00:00Z'));
    const latest = await store.write(backup, 'auto', 10, new Date('2026-10-26T10:00:00Z'));

    const files = await store.list();
    expect(files.map((f) => [f.kind, f.createdAt])).toEqual([
      ['auto', '2026-10-26T10:00:00Z'],
      ['manual', '2026-10-25T10:00:00Z'],
    ]);
    expect(await store.read(latest.name)).toBe(backup);
  });

  it('prunes old automatic backups but keeps manual ones', async () => {
    await store.write(backup, 'manual', 2, new Date('2026-10-20T10:00:00Z'));
    for (const day of [21, 22, 23, 24]) {
      await store.write(backup, 'auto', 2, new Date(`2026-10-${day}T10:00:00Z`));
    }
    const kinds = (await store.list()).map((f) => `${f.kind}:${f.createdAt.slice(8, 10)}`);
    expect(kinds).toEqual(['auto:24', 'auto:23', 'manual:20']);
  });

  it('ignores unrelated files and refuses unsafe names', async () => {
    await store.write(backup, 'manual', 10);
    await writeFile(path.join(store.directory, 'notes.txt'), 'x');
    expect(await store.list()).toHaveLength(1);
    await expect(store.read('../secure-store.json')).rejects.toThrow(IpcValidationError);
    expect((await readdir(store.directory)).sort()).toContain('notes.txt');
  });

  it('returns an empty list when the folder does not exist yet', async () => {
    expect(await new BackupStore(path.join(dir, 'missing')).list()).toEqual([]);
  });
});
