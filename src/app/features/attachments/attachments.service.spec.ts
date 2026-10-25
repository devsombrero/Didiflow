import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../core/auth/auth.service';
import { DesktopBridge } from '../../core/platform/desktop-bridge';
import { createSupabaseMock, provideSupabaseMock } from '../../../testing/supabase.mock';
import { AttachmentsService, type TaskAttachment } from './attachments.service';

const USER = 'user-1';
const TASK = 'task-1';
const stored = {
  id: 'att-1',
  name: 'a.pdf',
  size: 2048,
  mimeType: 'application/pdf',
  sha256: 'f'.repeat(64),
};

describe('AttachmentsService', () => {
  function setup(
    options: {
      insertError?: unknown;
      select?: { data: { id: string }[]; count: number | null };
    } = {},
  ) {
    const supabase = createSupabaseMock();
    const insert = vi.fn().mockResolvedValue({ error: options.insertError ?? null });
    const range = vi
      .fn()
      .mockResolvedValue({ ...(options.select ?? { data: [], count: 0 }), error: null });
    supabase.from.mockReturnValue({ insert, select: vi.fn(() => ({ range })) });
    const api = {
      add: vi.fn().mockResolvedValue({ status: 'added', files: [stored] }),
      remove: vi.fn().mockResolvedValue(undefined),
      prune: vi.fn().mockResolvedValue(3),
    };
    TestBed.configureTestingModule({
      providers: [
        provideSupabaseMock(supabase),
        { provide: DesktopBridge, useValue: { attachments: api } },
        { provide: AuthService, useValue: { user: signal({ id: USER }) } },
      ],
    });
    return { service: TestBed.inject(AttachmentsService), supabase, api, insert };
  }

  it('passes the remaining quota and records the copied files', async () => {
    const { service, api, insert } = setup();
    const current = [{ size_bytes: 10 * 1024 * 1024 }] as TaskAttachment[];
    const result = await service.add(TASK, current);
    expect(result.status).toBe('added');
    expect(api.add).toHaveBeenCalledWith(USER, TASK, 40 * 1024 * 1024);
    expect(insert).toHaveBeenCalledWith([
      {
        id: 'att-1',
        task_id: TASK,
        file_name: 'a.pdf',
        mime_type: 'application/pdf',
        size_bytes: 2048,
        sha256: 'f'.repeat(64),
      },
    ]);
  });

  it('removes the copied files when the database refuses them', async () => {
    const error = { code: '23514', hint: 'attachment_quota' };
    const { service, api } = setup({ insertError: error });
    await expect(service.add(TASK, [])).rejects.toBe(error);
    expect(api.remove).toHaveBeenCalledWith(USER, TASK, 'att-1');
  });

  it('does not touch the database when the pick was refused', async () => {
    const { service, api, insert } = setup();
    api.add.mockResolvedValue({ status: 'quota', requestedBytes: 10, remainingBytes: 0 });
    expect((await service.add(TASK, [])).status).toBe('quota');
    expect(insert).not.toHaveBeenCalled();
  });

  it('prunes orphans only when the full id list was read', async () => {
    const full = setup({ select: { data: [{ id: 'a' }, { id: 'b' }], count: 2 } });
    expect(await full.service.pruneOrphans()).toBe(3);
    expect(full.api.prune).toHaveBeenCalledWith(USER, ['a', 'b']);

    TestBed.resetTestingModule();
    const partial = setup({ select: { data: [{ id: 'a' }], count: 5000 } });
    expect(await partial.service.pruneOrphans()).toBe(0);
    expect(partial.api.prune).not.toHaveBeenCalled();
  });
});
