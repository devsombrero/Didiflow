import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideSupabaseMock } from '../../../../testing/supabase.mock';
import { provideOrganizationMock } from '../../../../testing/organization.mock';
import { DEFAULT_TASK_QUERY, type TaskQuery, type TaskWithTags } from '../task.model';
import { TasksService } from '../tasks.service';
import { TaskListPage, TaskListState } from './task-list-page';

const task = (overrides: Partial<TaskWithTags>): TaskWithTags =>
  ({
    id: 't1',
    title: 'Relatório',
    status: 'in_progress',
    priority: 'high',
    progress_percentage: 30,
    due_date: '2000-01-01',
    requester_name: 'Ana',
    archived_at: null,
    project_id: null,
    task_tags: [],
    ...overrides,
  }) as TaskWithTags;

describe('TaskListPage', () => {
  async function setup(items: TaskWithTags[]) {
    const list = vi.fn((query: TaskQuery) => {
      void query;
      return Promise.resolve({ items, total: items.length });
    });
    await TestBed.configureTestingModule({
      imports: [TaskListPage],
      providers: [
        provideRouter([]),
        provideSupabaseMock(),
        provideOrganizationMock(),
        { provide: TasksService, useValue: { list } },
      ],
    }).compileComponents();
    TestBed.inject(TaskListState).query.set(DEFAULT_TASK_QUERY);

    const fixture = TestBed.createComponent(TaskListPage);
    await fixture.whenStable();
    return { fixture, element: fixture.nativeElement as HTMLElement, list };
  }

  it('shows an onboarding empty state for a new account', async () => {
    const { element } = await setup([]);
    expect(element.textContent).toContain('Você ainda não cadastrou nenhuma demanda.');
  });

  it('renders tasks with status, progress and overdue warning', async () => {
    const { element } = await setup([task({})]);
    const row = element.querySelector('tbody tr');
    expect(row?.textContent).toContain('Relatório');
    expect(row?.textContent).toContain('Em andamento');
    expect(row?.textContent).toContain('30%');
    expect(row?.querySelector('.deadline[data-kind="overdue"]')).not.toBeNull();
  });

  it('reloads with the status filter when a chip is toggled', async () => {
    const { fixture, element, list } = await setup([task({})]);
    const blocked = Array.from(element.querySelectorAll<HTMLButtonElement>('.chip')).find(
      (chip) => chip.textContent?.trim() === 'Bloqueado',
    );
    blocked?.click();
    await fixture.whenStable();

    expect(list).toHaveBeenLastCalledWith(
      expect.objectContaining({ statuses: ['blocked'], page: 1 }),
    );
    expect(blocked?.getAttribute('aria-pressed')).toBe('true');
  });
});
