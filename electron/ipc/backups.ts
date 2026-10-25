import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { IpcValidationError, MAX_SAVE_BYTES } from './validation';

export type BackupKind = 'auto' | 'manual' | 'prerestore';

export interface BackupFile {
  name: string;
  kind: BackupKind;
  size: number;
  createdAt: string;
}

const NAME_PATTERN = /^didiflow-backup-(\d{8}T\d{6}Z)-(auto|manual|prerestore)\.json$/;

export function assertBackupName(value: unknown): string {
  if (typeof value !== 'string' || !NAME_PATTERN.test(value)) {
    throw new IpcValidationError('Invalid backup name');
  }
  return value;
}

export function assertBackupKind(value: unknown): BackupKind {
  if (value !== 'auto' && value !== 'manual' && value !== 'prerestore') {
    throw new IpcValidationError('Invalid backup kind');
  }
  return value;
}

export function assertRetention(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 100) {
    throw new IpcValidationError('Invalid retention');
  }
  return value;
}

export function assertBackupContent(value: unknown): string {
  if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > MAX_SAVE_BYTES) {
    throw new IpcValidationError('Invalid backup content');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new IpcValidationError('Backup is not valid JSON');
  }
  const format = (parsed as { format?: unknown } | null)?.format;
  if (format !== 'didiflow-backup') throw new IpcValidationError('Not a DidiFlow backup');
  return value;
}

/** "20261026T091500Z" for the given instant (sortable, filename-safe). */
export function backupStamp(date: Date): string {
  return date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function parseName(name: string): { kind: BackupKind; createdAt: string } | null {
  const match = NAME_PATTERN.exec(name);
  if (!match) return null;
  const [, stamp, kind] = match;
  const iso = `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(9, 11)}:${stamp.slice(11, 13)}:${stamp.slice(13, 15)}Z`;
  return { kind: kind as BackupKind, createdAt: iso };
}

/**
 * Local backup folder managed by the main process. Only files following the
 * DidiFlow naming pattern are listed, read or deleted.
 */
export class BackupStore {
  constructor(readonly directory: string) {}

  async list(): Promise<BackupFile[]> {
    let names: string[];
    try {
      names = await readdir(this.directory);
    } catch {
      return [];
    }
    const files: BackupFile[] = [];
    for (const name of names) {
      const parsed = parseName(name);
      if (!parsed) continue;
      const info = await stat(path.join(this.directory, name));
      files.push({ name, size: info.size, ...parsed });
    }
    return files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async write(
    content: string,
    kind: BackupKind,
    retention: number,
    now = new Date(),
  ): Promise<BackupFile> {
    await mkdir(this.directory, { recursive: true });
    const name = `didiflow-backup-${backupStamp(now)}-${kind}.json`;
    await writeFile(path.join(this.directory, name), content, { encoding: 'utf8', mode: 0o600 });
    if (kind === 'auto') await this.prune(retention);
    const info = await stat(path.join(this.directory, name));
    return { name, kind, size: info.size, createdAt: parseName(name)!.createdAt };
  }

  async read(name: string): Promise<string> {
    return readFile(path.join(this.directory, assertBackupName(name)), 'utf8');
  }

  async remove(name: string): Promise<void> {
    await rm(path.join(this.directory, assertBackupName(name)), { force: true });
  }

  /** Keeps the newest `retention` automatic backups; manual ones are never pruned. */
  private async prune(retention: number): Promise<void> {
    const automatic = (await this.list()).filter((file) => file.kind === 'auto');
    for (const file of automatic.slice(retention)) {
      await rm(path.join(this.directory, file.name), { force: true });
    }
  }
}
