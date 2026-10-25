import { TestBed } from '@angular/core/testing';
import type { Task } from '../task.model';
import { TasksService } from '../tasks.service';
import { TaskProgressPanel } from './task-progress-panel';

describe('TaskProgressPanel', () => {
  async function setup(task: Partial<Task>) {
    const tasks = {
      setStatus: vi.fn().mockResolvedValue({ ...task, status: 'done', progress_percentage: 100 }),
      setProgress: vi
        .fn()
        .mockResolvedValue({ ...task, status: 'in_progress', progress_percentage: 30 }),
    };
    await TestBed.configureTestingModule({
      imports: [TaskProgressPanel],
      providers: [{ provide: TasksService, useValue: tasks }],
    }).compileComponents();

    const fixture = TestBed.createComponent(TaskProgressPanel);
    fixture.componentRef.setInput('task', { id: 't1', ...task } as Task);
    const changed = vi.fn();
    fixture.componentInstance.changed.subscribe(changed);
    await fixture.whenStable();
    return { fixture, element: fixture.nativeElement as HTMLElement, tasks, changed };
  }

  it('commits slider changes as progress updates', async () => {
    const { fixture, element, tasks, changed } = await setup({
      status: 'not_started',
      progress_percentage: 0,
    });
    const slider = element.querySelector<HTMLInputElement>('input[type=range]')!;
    slider.value = '30';
    slider.dispatchEvent(new Event('input'));
    slider.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(tasks.setProgress).toHaveBeenCalledWith('t1', 30);
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ status: 'in_progress' }));
  });

  it('completes the task from the shortcut button', async () => {
    const { fixture, element, tasks } = await setup({
      status: 'in_progress',
      progress_percentage: 40,
    });
    Array.from(element.querySelectorAll<HTMLButtonElement>('button'))
      .find((b) => b.textContent?.includes('Marcar como concluída'))!
      .click();
    await fixture.whenStable();

    expect(tasks.setStatus).toHaveBeenCalledWith('t1', 'done');
  });

  it('locks progress on blocked tasks and explains why', async () => {
    const { element } = await setup({ status: 'blocked', progress_percentage: 60 });
    expect(element.querySelector('input[type=range]')).toBeNull();
    expect(element.textContent).toContain('o progresso alcançado é preservado');
  });

  it('locks the status selector on cancelled tasks', async () => {
    const { element } = await setup({ status: 'cancelled', progress_percentage: 20 });
    expect(element.querySelector('#task-status')!.getAttribute('aria-disabled')).toBe('true');
    expect(element.textContent).not.toContain('Marcar como concluída');
  });
});
