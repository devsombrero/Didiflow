import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  assertRemainingBytes,
  assertUuid,
  assertUuidList,
  AttachmentStore,
  FREE_SPACE_MARGIN_BYTES,
  isRiskyToOpen,
  MAX_TASK_ATTACHMENT_BYTES,
  mimeTypeFor,
  safeFileName,
} from './attachments';
import { IpcValidationError } from './validation';

const USER = '11111111-1111-4111-8111-111111111111';
const OTHER_USER = '22222222-2222-4222-8222-222222222222';
const TASK = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('attachment validation', () => {
  it('accepts only UUIDs', () => {
    expect(assertUuid(USER.toUpperCase())).toBe(USER);
    for (const value of ['..', '../x', '', 1, null, `${USER}/..`]) {
      expect(() => assertUuid(value)).toThrow(IpcValidationError);
    }
    expect(assertUuidList([USER])).toEqual([USER]);
    expect(() => assertUuidList('x')).toThrow(IpcValidationError);
  });

  it('bounds the remaining quota', () => {
    expect(assertRemainingBytes(0)).toBe(0);
    expect(assertRemainingBytes(MAX_TASK_ATTACHMENT_BYTES)).toBe(MAX_TASK_ATTACHMENT_BYTES);
    for (const value of [-1, 1.5, MAX_TASK_ATTACHMENT_BYTES + 1, '10']) {
      expect(() => assertRemainingBytes(value)).toThrow(IpcValidationError);
    }
  });

  it('makes file names safe for Windows', () => {
    expect(safeFileName('C:\\Users\\x\\relatório final.pdf')).toBe('relatório final.pdf');
    expect(safeFileName('a<b>:c?.txt')).toBe('a_b__c_.txt');
    expect(safeFileName('CON.txt')).toBe('_CON.txt');
    expect(safeFileName('nome. ')).toBe('nome');
    expect(safeFileName('...')).toBe('arquivo');
    const long = safeFileName(`${'x'.repeat(300)}.docx`);
    expect(long).toHaveLength(120);
    expect(long.endsWith('.docx')).toBe(true);
  });

  it('flags executable files and infers MIME types', () => {
    expect(isRiskyToOpen('setup.EXE')).toBe(true);
    expect(isRiskyToOpen('script.ps1')).toBe(true);
    expect(isRiskyToOpen('contrato.pdf')).toBe(false);
    expect(mimeTypeFor('foto.JPG')).toBe('image/jpeg');
    expect(mimeTypeFor('sem-extensao')).toBeNull();
  });
});

describe('AttachmentStore', () => {
  let dir: string;
  let sources: string;
  let free: number;
  let store: AttachmentStore;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'didiflow-attachments-'));
    sources = path.join(dir, 'sources');
    await mkdir(sources);
    free = 10 * 1024 * 1024 * 1024;
    store = new AttachmentStore(path.join(dir, 'store'), async () => free);
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  async function source(name: string, content: string | Buffer): Promise<string> {
    const file = path.join(sources, name);
    await writeFile(file, content);
    return file;
  }

  it('copies files with size and sha256, under the user and task folder', async () => {
    const file = await source('nota.txt', 'conteúdo');
    const result = await store.add(USER, TASK, [file], MAX_TASK_ATTACHMENT_BYTES);
    if (result.status !== 'added') throw new Error(result.status);
    const [stored] = result.files;
    expect(stored).toMatchObject({
      name: 'nota.txt',
      size: Buffer.byteLength('conteúdo'),
      mimeType: 'text/plain',
    });
    expect(stored.sha256).toBe(createHash('sha256').update('conteúdo').digest('hex'));

    const target = await store.filePath(USER, TASK, stored.id);
    expect(target).toBe(path.join(dir, 'store', USER, TASK, stored.id, 'nota.txt'));
    expect(await readFile(target!, 'utf8')).toBe('conteúdo');
    expect(await store.exists(USER, TASK, [stored.id, OTHER_USER])).toEqual({
      [stored.id]: true,
      [OTHER_USER]: false,
    });
  });

  it('refuses files that exceed the remaining task quota', async () => {
    const file = await source('grande.bin', Buffer.alloc(2048));
    expect(await store.add(USER, TASK, [file], 1024)).toEqual({
      status: 'quota',
      requestedBytes: 2048,
      remainingBytes: 1024,
    });
    expect(await readdir(dir)).not.toContain('store');
  });

  it('refuses when the disk would be left without enough free space', async () => {
    free = FREE_SPACE_MARGIN_BYTES + 100;
    const file = await source('a.bin', Buffer.alloc(200));
    const result = await store.add(USER, TASK, [file], MAX_TASK_ATTACHMENT_BYTES);
    expect(result).toEqual({ status: 'disk-full', requestedBytes: 200, freeBytes: free });
  });

  it('refuses empty files and folders', async () => {
    const empty = await source('vazio.txt', '');
    expect(await store.add(USER, TASK, [empty], 100)).toEqual({
      status: 'empty-file',
      name: 'vazio.txt',
    });
    await expect(store.add(USER, TASK, [sources], 100)).rejects.toThrow(IpcValidationError);
  });

  it('removes one attachment or all of a task', async () => {
    const a = await source('a.txt', 'a');
    const b = await source('b.txt', 'b');
    const result = await store.add(USER, TASK, [a, b], 100);
    if (result.status !== 'added') throw new Error(result.status);
    await store.remove(USER, TASK, result.files[0].id);
    expect(await store.filePath(USER, TASK, result.files[0].id)).toBeNull();
    expect(await store.filePath(USER, TASK, result.files[1].id)).not.toBeNull();
    await store.removeTask(USER, TASK);
    expect(await store.filePath(USER, TASK, result.files[1].id)).toBeNull();
  });

  it('prunes orphan files of the user only and reports usage', async () => {
    const a = await source('a.txt', 'aaaa');
    const kept = await store.add(USER, TASK, [a], 100);
    const orphan = await store.add(USER, TASK, [a], 100);
    const other = await store.add(OTHER_USER, TASK, [a], 100);
    if (kept.status !== 'added' || orphan.status !== 'added' || other.status !== 'added') {
      throw new Error('setup');
    }
    expect(await store.usage(USER)).toEqual({ freeBytes: free, usedBytes: 8 });

    expect(await store.prune(USER, [kept.files[0].id])).toBe(1);
    expect(await store.filePath(USER, TASK, kept.files[0].id)).not.toBeNull();
    expect(await store.filePath(USER, TASK, orphan.files[0].id)).toBeNull();
    expect(await store.filePath(OTHER_USER, TASK, other.files[0].id)).not.toBeNull();
    expect((await store.usage(USER)).usedBytes).toBe(4);
  });
});
