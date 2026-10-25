import { createHash, randomUUID } from 'node:crypto';
import { constants, createReadStream } from 'node:fs';
import { copyFile, mkdir, readdir, rm, stat, statfs } from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { IpcValidationError } from './validation';

/** Total attachment size allowed per task (matches the database quota). */
export const MAX_TASK_ATTACHMENT_BYTES = 50 * 1024 * 1024;
/** Disk headroom kept free after copying attachments. */
export const FREE_SPACE_MARGIN_BYTES = 200 * 1024 * 1024;
const MAX_IDS = 10000;
const MAX_NAME_LENGTH = 120;

export interface StoredAttachment {
  id: string;
  name: string;
  size: number;
  mimeType: string | null;
  sha256: string;
}

export type AttachmentAddResult =
  | { status: 'added'; files: StoredAttachment[] }
  | { status: 'canceled' }
  | { status: 'quota'; requestedBytes: number; remainingBytes: number }
  | { status: 'disk-full'; requestedBytes: number; freeBytes: number }
  | { status: 'empty-file'; name: string };

export interface AttachmentUsage {
  /** Free space on the disk holding the attachments folder. */
  freeBytes: number;
  /** Bytes used by this user's attachments on this computer. */
  usedBytes: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(value: unknown, label = 'id'): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new IpcValidationError(`Invalid ${label}`);
  }
  return value.toLowerCase();
}

export function assertUuidList(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_IDS) {
    throw new IpcValidationError('Invalid id list');
  }
  return value.map((id) => assertUuid(id));
}

export function assertRemainingBytes(value: unknown): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > MAX_TASK_ATTACHMENT_BYTES
  ) {
    throw new IpcValidationError('Invalid remaining quota');
  }
  return value;
}

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** Windows-safe base name that keeps the extension, at most 120 characters. */
export function safeFileName(name: string): string {
  let base = path.basename(name.replace(/\\/g, '/'));
  // eslint-disable-next-line no-control-regex
  base = base.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').replace(/[. ]+$/, '');
  if (!base || /^_*$/.test(base)) base = 'arquivo';
  if (RESERVED.test(base)) base = `_${base}`;
  if (base.length > MAX_NAME_LENGTH) {
    const ext = path.extname(base).slice(0, 16);
    base = base.slice(0, MAX_NAME_LENGTH - ext.length) + ext;
  }
  return base;
}

const MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  zip: 'application/zip',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  mp4: 'video/mp4',
  mp3: 'audio/mpeg',
};

export function mimeTypeFor(name: string): string | null {
  return MIME_TYPES[path.extname(name).slice(1).toLowerCase()] ?? null;
}

const RISKY_EXTENSIONS = new Set([
  'exe',
  'com',
  'bat',
  'cmd',
  'msi',
  'msp',
  'ps1',
  'psm1',
  'vbs',
  'vbe',
  'js',
  'jse',
  'wsf',
  'wsh',
  'scr',
  'lnk',
  'hta',
  'reg',
  'cpl',
  'jar',
  'pif',
  'msc',
  'url',
  'appx',
  'msix',
  'dll',
]);

/** Files that could execute code when opened; they are revealed in the folder instead. */
export function isRiskyToOpen(name: string): boolean {
  return RISKY_EXTENSIONS.has(path.extname(name).slice(1).toLowerCase());
}

async function sha256Of(file: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(file), hash);
  return hash.digest('hex');
}

async function defaultFreeBytes(directory: string): Promise<number> {
  const info = await statfs(directory);
  return Number(info.bavail) * Number(info.bsize);
}

/**
 * Attachment files on this computer, under
 * <root>/<userId>/<taskId>/<attachmentId>/<file name>. Paths are built only
 * from validated UUIDs, so callers cannot reach outside the root.
 */
export class AttachmentStore {
  constructor(
    readonly root: string,
    private readonly freeBytes: (directory: string) => Promise<number> = defaultFreeBytes,
  ) {}

  private userDir(userId: string): string {
    return path.join(this.root, assertUuid(userId, 'user id'));
  }

  private taskDir(userId: string, taskId: string): string {
    return path.join(this.userDir(userId), assertUuid(taskId, 'task id'));
  }

  private attachmentDir(userId: string, taskId: string, id: string): string {
    return path.join(this.taskDir(userId, taskId), assertUuid(id, 'attachment id'));
  }

  /**
   * Copies the chosen files into the store when they fit the task quota and
   * leave enough free disk space. Nothing is kept if any copy fails.
   */
  async add(
    userId: string,
    taskId: string,
    sources: readonly string[],
    remainingBytes: number,
  ): Promise<AttachmentAddResult> {
    const taskDir = this.taskDir(userId, taskId);
    const infos = await Promise.all(
      sources.map(async (source) => ({ source, info: await stat(source) })),
    );
    for (const { source, info } of infos) {
      if (!info.isFile()) throw new IpcValidationError('Not a regular file');
      if (info.size === 0) return { status: 'empty-file', name: path.basename(source) };
    }
    const requestedBytes = infos.reduce((sum, { info }) => sum + info.size, 0);
    if (requestedBytes > remainingBytes) {
      return { status: 'quota', requestedBytes, remainingBytes };
    }

    await mkdir(taskDir, { recursive: true });
    const freeBytes = await this.freeBytes(taskDir);
    if (freeBytes - requestedBytes < FREE_SPACE_MARGIN_BYTES) {
      return { status: 'disk-full', requestedBytes, freeBytes };
    }

    const created: string[] = [];
    try {
      const files: StoredAttachment[] = [];
      for (const { source, info } of infos) {
        const id = randomUUID();
        const dir = path.join(taskDir, id);
        await mkdir(dir);
        created.push(dir);
        const name = safeFileName(path.basename(source));
        const target = path.join(dir, name);
        await copyFile(source, target, constants.COPYFILE_EXCL);
        const copied = await stat(target);
        if (copied.size !== info.size) throw new Error('File changed while copying');
        files.push({
          id,
          name,
          size: copied.size,
          mimeType: mimeTypeFor(name),
          sha256: await sha256Of(target),
        });
      }
      return { status: 'added', files };
    } catch (error) {
      await Promise.all(created.map((dir) => rm(dir, { recursive: true, force: true })));
      throw error;
    }
  }

  /** Absolute path of the stored file, or null when it is not on this computer. */
  async filePath(userId: string, taskId: string, id: string): Promise<string | null> {
    const dir = this.attachmentDir(userId, taskId, id);
    try {
      const [name] = await readdir(dir);
      return name ? path.join(dir, name) : null;
    } catch {
      return null;
    }
  }

  async remove(userId: string, taskId: string, id: string): Promise<void> {
    await rm(this.attachmentDir(userId, taskId, id), { recursive: true, force: true });
  }

  async removeTask(userId: string, taskId: string): Promise<void> {
    await rm(this.taskDir(userId, taskId), { recursive: true, force: true });
  }

  /** Which attachments have their file on this computer. */
  async exists(
    userId: string,
    taskId: string,
    ids: readonly string[],
  ): Promise<Record<string, boolean>> {
    const entries = await Promise.all(
      ids.map(async (id) => [id, (await this.filePath(userId, taskId, id)) !== null] as const),
    );
    return Object.fromEntries(entries);
  }

  /**
   * Deletes files whose attachment no longer exists (task deleted elsewhere,
   * restore in replace mode...). Only this user's folder is touched.
   */
  async prune(userId: string, keepIds: readonly string[]): Promise<number> {
    const keep = new Set(keepIds.map((id) => id.toLowerCase()));
    const userDir = this.userDir(userId);
    let removed = 0;
    for (const taskId of await safeReaddir(userDir)) {
      if (!UUID.test(taskId)) continue;
      const taskDir = path.join(userDir, taskId);
      const ids = await safeReaddir(taskDir);
      for (const id of ids) {
        if (!UUID.test(id) || keep.has(id.toLowerCase())) continue;
        await rm(path.join(taskDir, id), { recursive: true, force: true });
        removed++;
      }
      if ((await safeReaddir(taskDir)).length === 0)
        await rm(taskDir, { recursive: true, force: true });
    }
    return removed;
  }

  async usage(userId: string): Promise<AttachmentUsage> {
    const userDir = this.userDir(userId);
    await mkdir(this.root, { recursive: true });
    return { freeBytes: await this.freeBytes(this.root), usedBytes: await directorySize(userDir) };
  }
}

async function safeReaddir(directory: string): Promise<string[]> {
  try {
    return await readdir(directory);
  } catch {
    return [];
  }
}

async function directorySize(directory: string): Promise<number> {
  let total = 0;
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) total += await directorySize(full);
    else if (entry.isFile()) total += (await stat(full)).size;
  }
  return total;
}
