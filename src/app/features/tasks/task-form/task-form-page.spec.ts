import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideSupabaseMock } from '../../../../testing/supabase.mock';
import { provideOrganizationMock } from '../../../../testing/organization.mock';
import { TasksService } from '../tasks.service';
import { TaskFormPage } from './task-form-page';

describe('TaskFormPage', () => {
  async function setup() {
    const tasks = {
      create: vi.fn().mockResolvedValue({ id: 'new-id' }),
      update: vi.fn(),
      setTags: vi.fn().mockResolvedValue(undefined),
      get: vi.fn(),
      hierarchyOptions: vi.fn().mockResolvedValue([]),
    };
    await TestBed.configureTestingModule({
      imports: [TaskFormPage],
      providers: [
        provideRouter([]),
        provideSupabaseMock(),
        provideOrganizationMock(),
        { provide: TasksService, useValue: tasks },
      ],
    }).compileComponents();
    vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    const fixture = TestBed.createComponent(TaskFormPage);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    const type = (id: string, value: string) => {
      const input = element.querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = value;
      input.dispatchEvent(new Event('input'));
    };
    const check = async (id: string) => {
      // mat-checkbox renders the native input as <id>-input.
      element.querySelector<HTMLInputElement>(`#${id}-input`)!.click();
      await fixture.whenStable();
    };
    const submit = async () => {
      element.querySelector('form')!.dispatchEvent(new Event('submit'));
      await fixture.whenStable();
    };
    return { element, tasks, type, check, submit };
  }

  it('creates a task mapping blanks to null and hours to minutes', async () => {
    const { tasks, type, submit } = await setup();
    type('title', '  Revisar contrato  ');
    type('start_date', '2026-10-01');
    type('due_date', '2026-10-05');
    type('estimated_hours', '1.5');
    await submit();

    expect(tasks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Revisar contrato',
        description: null,
        requester_name: null,
        has_jira_card: false,
        jira_url: null,
        start_date: '2026-10-01',
        due_date: '2026-10-05',
        estimated_minutes: 90,
        priority: 'medium',
        project_id: null,
        context_id: null,
      }),
    );
    expect(tasks.setTags).toHaveBeenCalledWith('new-id', []);
    expect(TestBed.inject(Router).navigate).toHaveBeenCalledWith(['/tasks', 'new-id']);
  });

  it('blocks submission with a non-https Jira URL', async () => {
    const { element, tasks, type, check, submit } = await setup();
    type('title', 'Tarefa');
    await check('has_jira_card');
    type('jira_url', 'http://jira.local/1');
    await submit();

    expect(tasks.create).not.toHaveBeenCalled();
    expect(element.textContent).toContain('Informe uma URL começando com https://.');
  });

  it('blocks a due date before the start date', async () => {
    const { element, tasks, type, submit } = await setup();
    type('title', 'Tarefa');
    type('start_date', '2026-10-10');
    type('due_date', '2026-10-01');
    await submit();

    expect(tasks.create).not.toHaveBeenCalled();
    expect(element.textContent).toContain('A entrega não pode ser anterior ao início.');
  });
});

describe('TaskFormPage planning prefill', () => {
  it('prefills the due date from the calendar', async () => {
    await TestBed.configureTestingModule({
      imports: [TaskFormPage],
      providers: [
        provideRouter([]),
        provideSupabaseMock(),
        provideOrganizationMock(),
        {
          provide: TasksService,
          useValue: {
            create: vi.fn(),
            setTags: vi.fn(),
            get: vi.fn(),
            hierarchyOptions: vi.fn().mockResolvedValue([]),
          },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(TaskFormPage);
    fixture.componentRef.setInput('due', '2026-11-03');
    await fixture.whenStable();
    expect(
      (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('#due_date')!.value,
    ).toBe('2026-11-03');
  });
});
