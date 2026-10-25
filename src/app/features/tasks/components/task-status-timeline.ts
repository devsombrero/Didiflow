import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { AppDatePipe } from '../../../shared/pipes/app-date.pipe';
import { STATUS_LABELS, type StatusHistoryEntry } from '../task.model';
import { TasksService } from '../tasks.service';

/** Read-only list of status/progress transitions (newest first). */
@Component({
  selector: 'app-task-status-timeline',
  imports: [AppDatePipe],
  template: `
    @switch (state()) {
      @case ('loading') {
        <p class="muted" role="status">Carregando histórico…</p>
      }
      @case ('error') {
        <p class="field-error">Não foi possível carregar o histórico.</p>
      }
      @default {
        <ol class="timeline">
          @for (entry of entries(); track entry.id) {
            <li>
              <time class="muted">{{ entry.changed_at | appDate: true }}</time>
              <span>
                @if (entry.from_status === null) {
                  Criada como <strong>{{ labels[entry.to_status] }}</strong>
                } @else if (entry.from_status === entry.to_status) {
                  Progresso {{ entry.from_progress }}% → <strong>{{ entry.to_progress }}%</strong>
                } @else {
                  {{ labels[entry.from_status] }} →
                  <strong>{{ labels[entry.to_status] }}</strong>
                }
                <span class="muted">({{ entry.to_progress }}%)</span>
              </span>
            </li>
          }
        </ol>
      }
    }
  `,
  styles: `
    .timeline {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
    .timeline li {
      display: grid;
      grid-template-columns: 130px 1fr;
      gap: var(--space-3);
      padding-left: var(--space-3);
      border-left: 2px solid var(--color-border);
    }
  `,
})
export class TaskStatusTimeline {
  private readonly tasks = inject(TasksService);

  readonly taskId = input.required<string>();
  /** Changes whenever the task is updated, to refresh the history. */
  readonly version = input<string>();

  protected readonly labels = STATUS_LABELS;
  protected readonly entries = signal<StatusHistoryEntry[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');

  constructor() {
    effect(() => {
      const id = this.taskId();
      this.version();
      untracked(() => void this.load(id));
    });
  }

  private async load(id: string): Promise<void> {
    try {
      this.entries.set(await this.tasks.statusHistory(id));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
