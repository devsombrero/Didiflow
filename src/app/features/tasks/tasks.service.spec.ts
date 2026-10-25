import { TestBed } from '@angular/core/testing';
import { queryMock, type QueryResult } from '../../../testing/query.mock';
import { createSupabaseMock, provideSupabaseMock } from '../../../testing/supabase.mock';
import { DEFAULT_TASK_QUERY, type Task } from './task.model';
import { TasksService } from './tasks.service';

describe('TasksService', () => {
  function setup(result: QueryResult = { data: [], error: null, count: 0 }) {
    const supabase = createSupabaseMock();
    const query = queryMock(result);
    supabase.from.mockReturnValue(query);
    TestBed.configureTestingModule({ providers: [provideSupabaseMock(supabase)] });
    return { service: TestBed.inject(TasksService), supabase, query };
  }

  it('lists active, non-deleted tasks with paging and default sort', async () => {
    const { service, supabase, query } = setup({ data: [{ id: 't1' }], error: null, count: 41 });
    const page = await service.list({ ...DEFAULT_TASK_QUERY, page: 3 });

    expect(supabase.from).toHaveBeenCalledWith('tasks');
    expect(page).toEqual({ items: [{ id: 't1' }], total: 41 });
    expect(query.calls).toContainEqual(['is', ['deleted_at', null]]);
    expect(query.calls).toContainEqual(['is', ['archived_at', null]]);
    expect(query.argsOf('order')).toEqual(['updated_at', { ascending: false, nullsFirst: false }]);
    expect(query.argsOf('range')).toEqual([40, 59]);
  });

  it('applies filters and a sanitized search', async () => {
    const { service, query } = setup();
    await service.list({
      ...DEFAULT_TASK_QUERY,
      search: 'relatório, (q4)',
      statuses: ['blocked'],
      priorities: ['high', 'urgent'],
      archive: 'archived',
    });

    expect(query.calls).toContainEqual(['not', ['archived_at', 'is', null]]);
    expect(query.calls).toContainEqual(['in', ['status', ['blocked']]]);
    expect(query.calls).toContainEqual(['in', ['priority', ['high', 'urgent']]]);
    expect(query.argsOf('or')).toEqual([
      'title.ilike.%relatório q4%,description.ilike.%relatório q4%,' +
        'requester_name.ilike.%relatório q4%,notes.ilike.%relatório q4%',
    ]);
  });

  it('throws Supabase errors', async () => {
    const { service } = setup({ data: null, error: { code: '42501' }, count: null } );
    await expect(service.list(DEFAULT_TASK_QUERY)).rejects.toEqual({ code: '42501' });
  });

  it('cancels by clearing completed_at', async () => {
    const { service, query } = setup({ data: { id: 't1' }, error: null } );
    await service.cancel({ id: 't1', status: 'done' } as Task);

    expect(query.argsOf('update')).toEqual([{ status: 'cancelled', completed_at: null }]);
    expect(query.argsOf('eq')).toEqual(['id', 't1']);
  });

  it('deletes logically', async () => {
    const { service, query } = setup({ data: { id: 't1' }, error: null } );
    await service.remove('t1');

    const [changes] = query.argsOf('update') as [{ deleted_at: string }];
    expect(new Date(changes.deleted_at).getTime()).not.toBeNaN();
    expect(query.calls.some(([method]) => method === 'delete')).toBe(false);
  });
});
