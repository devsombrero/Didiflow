import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideOrganizationMock } from '../../../../testing/organization.mock';
import { provideSupabaseMock } from '../../../../testing/supabase.mock';
import { TaskActions } from '../task-actions.service';
import type { TaskWithTags } from '../task.model';
import { TasksService } from '../tasks.service';
import { KanbanPage } from './kanban-page';

const task = (overrides: Partial<TaskWithTags>): TaskWithTags =>
  ({
    id: 't1',
    title: 'Relatório',
    status: 'not_started',
    priority: 'high',
    progress_percentage: 0,
    due_date: null,
    project_id: null,
    task_tags: [],
    ...overrides,
  }) as TaskWithTags;

describe('KanbanPage', () => {
  async function setup(tasks: TaskWithTags[]) {
    const service = {
      boardTasks: vi.fn().mockResolvedValue(tasks),
      setStatus: vi.fn((id: string, status: string) =>
        Promise.resolve(
          task({ id, status: status as TaskWithTags['status'], progress_percentage: 1 }),
        ),
      ),
      reopen: vi.fn(),
    };
    const actions = { cancel: vi.fn().mockResolvedValue(undefined) };
    await TestBed.configureTestingModule({
      imports: [KanbanPage],
      providers: [
        provideRouter([]),
        provideSupabaseMock(),
        provideOrganizationMock(),
        { provide: TasksService, useValue: service },
        { provide: TaskActions, useValue: actions },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(KanbanPage);
    await new Promise((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    const page = fixture.componentInstance as unknown as {
      moveTo(task: TaskWithTags, status: string): Promise<void>;
    };
    return { fixture, element: fixture.nativeElement as HTMLElement, service, actions, page };
  }

  const columnCount = (element: HTMLElement, status: string) =>
    element.querySelector(`.column[data-status="${status}"] .column__count`)?.textContent?.trim();

  it('shows the four board columns with their cards', async () => {
    const { element } = await setup([task({}), task({ id: 't2', status: 'done', title: 'Feita' })]);
    expect(
      Array.from(element.querySelectorAll('.column h2')).map((h) => h.textContent?.trim()),
    ).toEqual(['Não iniciado', 'Em andamento', 'Bloqueado', 'Concluído']);
    expect(columnCount(element, 'not_started')).toBe('1');
    expect(columnCount(element, 'done')).toBe('1');
  });

  it('moves a card to another column', async () => {
    const { fixture, element, service, page } = await setup([task({})]);
    await page.moveTo(task({}), 'in_progress');
    await fixture.whenStable();

    expect(service.setStatus).toHaveBeenCalledWith('t1', 'in_progress');
    expect(columnCount(element, 'in_progress')).toBe('1');
    expect(columnCount(element, 'not_started')).toBe('0');
  });

  it('keeps the card in place when cancellation is dismissed', async () => {
    const { fixture, element, service, actions, page } = await setup([task({})]);
    await page.moveTo(task({}), 'cancelled');
    await fixture.whenStable();

    expect(actions.cancel).toHaveBeenCalled();
    expect(service.setStatus).not.toHaveBeenCalled();
    expect(columnCount(element, 'not_started')).toBe('1');
  });

  it('reverts the optimistic move when saving fails', async () => {
    const { fixture, element, service, page } = await setup([task({})]);
    service.setStatus.mockRejectedValueOnce({ code: '42501' });
    await page.moveTo(task({}), 'blocked');
    await fixture.whenStable();

    expect(columnCount(element, 'blocked')).toBe('0');
    expect(columnCount(element, 'not_started')).toBe('1');
  });
});
