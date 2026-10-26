import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { AiAction } from '../../../../electron/ipc/contract';
import { UserClock } from '../../core/profile/user-clock';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { OrganizationStore, type OrgItem } from '../organization/organization.service';
import { TasksService } from '../tasks/tasks.service';
import { DidiBotActions, describeAction, exactTitlePattern } from './didibot-actions';
import { filterPrompts, MyPrompts, PROMPT_CATEGORIES, PROMPT_LIBRARY } from './didibot-prompts';

const format = (date: string) => date.split('-').reverse().join('/');

describe('DidiBot action labels', () => {
  it('describes each kind of proposal', () => {
    expect(describeAction({ type: 'create_project', name: 'Site novo' }, format)).toBe(
      'Criar projeto “Site novo”',
    );
    expect(
      describeAction(
        {
          type: 'create_task',
          title: 'Lançamento',
          kind: 'epic',
          project: 'Site novo',
          priority: 'high',
          dueDate: '2026-11-07',
          estimatedHours: 8,
          tags: ['frontend'],
          subtasks: ['A', 'B'],
        },
        format,
      ),
    ).toBe(
      'Criar épico “Lançamento” — projeto Site novo, prioridade alta, entrega 07/11/2026, 8 h, #frontend, 2 subtarefas',
    );
    expect(
      describeAction(
        { type: 'update_task', task: 'Gateway', status: 'done', progress: 100 },
        format,
      ),
    ).toBe('Atualizar “Gateway”: status Concluído, progresso 100%');
  });

  it('escapes LIKE wildcards in titles', () => {
    expect(exactTitlePattern('100% pronto_v2')).toBe('100\\% pronto\\_v2');
  });
});

describe('DidiBotActions.apply', () => {
  function setup(existingTask: object | null = null) {
    const items = signal<Record<string, OrgItem[]>>({
      projects: [{ id: 'p1', name: 'Portal do Cliente', color: null }],
      categories: [{ id: 'c1', name: 'Desenvolvimento', color: null }],
      tags: [{ id: 't1', name: 'backend', color: null }],
      work_contexts: [],
    });
    const org = {
      items,
      ensureLoaded: vi.fn().mockResolvedValue(undefined),
      create: vi.fn(async (_kind: string, input: { name: string }) => {
        const item = { id: `new-${input.name}`, name: input.name, color: null };
        items.update((all) => ({ ...all, projects: [...all['projects'], item] }));
        return item;
      }),
    };
    let seq = 0;
    const tasks = {
      create: vi.fn(async (input: Record<string, unknown>) => ({
        id: `task-${++seq}`,
        ...input,
      })),
      createSubtask: vi.fn(async (parent: { id: string }, title: string) => ({
        id: `sub-${++seq}`,
        title,
        parent_id: parent.id,
      })),
      setTags: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue({}),
      setStatus: vi.fn().mockResolvedValue({}),
    };
    const query = {
      select: () => query,
      is: () => query,
      ilike: vi.fn(() => query),
      order: () => query,
      limit: async () => ({ data: existingTask ? [existingTask] : [], error: null }),
    };
    TestBed.configureTestingModule({
      providers: [
        { provide: OrganizationStore, useValue: org },
        { provide: TasksService, useValue: tasks },
        { provide: SUPABASE_CLIENT, useValue: { from: () => query } },
        { provide: UserClock, useValue: { dateFormat: () => 'dd/MM/yyyy', timeZone: () => 'UTC' } },
      ],
    });
    return { actions: TestBed.inject(DidiBotActions), org, tasks, query };
  }

  it('creates a project, an epic in it and a child task with subtasks and tags', async () => {
    const { actions, org, tasks } = setup();
    const plan: AiAction[] = [
      { type: 'create_project', name: 'Site novo' },
      { type: 'create_task', title: 'Lançamento', kind: 'epic', project: 'Site novo' },
      {
        type: 'create_task',
        title: 'Criar layout',
        parent: 'Lançamento',
        priority: 'high',
        dueDate: '2026-11-03',
        estimatedHours: 2.5,
        category: 'Desenvolvimento',
        tags: ['backend', 'inexistente'],
        subtasks: ['Wireframe', 'Protótipo'],
      },
    ];
    const results = await actions.apply(plan);

    expect(results.every((result) => result.ok)).toBe(true);
    expect(org.create).toHaveBeenCalledTimes(1);
    expect(tasks.create.mock.calls[0][0]).toMatchObject({
      title: 'Lançamento',
      kind: 'epic',
      project_id: 'new-Site novo',
      parent_id: null,
    });
    expect(tasks.create.mock.calls[1][0]).toMatchObject({
      title: 'Criar layout',
      parent_id: 'task-1',
      project_id: 'new-Site novo',
      priority: 'high',
      due_date: '2026-11-03',
      estimated_minutes: 150,
      category_id: 'c1',
    });
    expect(tasks.setTags).toHaveBeenCalledWith('task-2', ['t1']);
    expect(tasks.createSubtask).toHaveBeenCalledTimes(2);
    expect(results[2].message).toContain('tags ignoradas: inexistente');
    expect(results[2].route).toBe('/tasks/task-2');
  });

  it('reuses an existing project and updates an existing task', async () => {
    const { actions, org, tasks, query } = setup({ id: 'old', title: 'Gateway de pagamento' });
    const results = await actions.apply([
      { type: 'create_project', name: 'portal do cliente' },
      { type: 'update_task', task: 'gateway de pagamento', progress: 80, status: 'in_progress' },
    ]);
    expect(org.create).not.toHaveBeenCalled();
    expect(results[0].message).toContain('já existia');
    expect(query.ilike).toHaveBeenCalledWith('title', 'gateway de pagamento');
    expect(tasks.update).toHaveBeenCalledWith('old', { progress_percentage: 80 });
    expect(tasks.setStatus).toHaveBeenCalledWith('old', 'in_progress');
  });

  it('reports a task that does not exist and keeps going', async () => {
    const { actions } = setup(null);
    const results = await actions.apply([
      { type: 'update_task', task: 'Fantasma', status: 'done' },
      { type: 'create_task', title: 'Nova' },
    ]);
    expect(results.map((result) => result.ok)).toEqual([false, true]);
    expect(results[0].message).toContain('não encontrada');
  });
});

describe('DidiBot prompt library', () => {
  it('covers every category with unique ids', () => {
    expect(new Set(PROMPT_LIBRARY.map((item) => item.id)).size).toBe(PROMPT_LIBRARY.length);
    for (const category of PROMPT_CATEGORIES) {
      expect(PROMPT_LIBRARY.some((item) => item.category === category.id)).toBe(true);
    }
    expect(
      PROMPT_LIBRARY.filter((item) => item.creates).every((item) => item.category === 'criar'),
    ).toBe(true);
  });

  it('filters by category and accent-insensitive text', () => {
    expect(filterPrompts(PROMPT_LIBRARY, 'reuniao', 'todos').map((item) => item.id)).toContain(
      'create-from-notes',
    );
    expect(
      filterPrompts(PROMPT_LIBRARY, '', 'criar').every((item) => item.category === 'criar'),
    ).toBe(true);
    expect(filterPrompts(PROMPT_LIBRARY, 'xyz inexistente', 'todos')).toEqual([]);
  });

  it('saves and removes personal prompts on this device', () => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    const mine = TestBed.inject(MyPrompts);
    const saved = mine.save('Meu relatório', 'Gere meu relatório de sexta');
    expect(mine.items()[0]).toMatchObject({
      title: 'Meu relatório',
      prompt: 'Gere meu relatório de sexta',
    });
    expect(JSON.parse(localStorage.getItem('didiflow:didibot:my-prompts')!)).toHaveLength(1);
    mine.remove(saved.id);
    expect(mine.items()).toEqual([]);
  });
});
