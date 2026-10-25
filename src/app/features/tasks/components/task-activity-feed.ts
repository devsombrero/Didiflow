import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { UserClock } from '../../../core/profile/user-clock';
import { AppDatePipe } from '../../../shared/pipes/app-date.pipe';
import { formatDateValue } from '../../../shared/utils/format-date';
import { type ActivityView, describeActivity } from '../task-activity';
import { TasksService } from '../tasks.service';

interface FeedItem extends ActivityView {
  id: number;
  createdAt: string;
}

/** Read-only audit trail of a task (newest first). */
@Component({
  selector: 'app-task-activity-feed',
  imports: [AppDatePipe],
  template: `
    @switch (state()) {
      @case ('loading') {
        <p class="muted" role="status">Carregando atividade…</p>
      }
      @case ('error') {
        <p class="field-error">Não foi possível carregar a atividade.</p>
      }
      @default {
        <ol class="feed">
          @for (item of items(); track item.id) {
            <li>
              <time class="muted">{{ item.createdAt | appDate: true }}</time>
              <div>
                <strong>{{ item.title }}</strong>
                @for (detail of item.details; track $index) {
                  <div class="feed__detail">{{ detail }}</div>
                }
              </div>
            </li>
          }
        </ol>
      }
    }
  `,
  styles: `
    .feed {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .feed li {
      display: grid;
      grid-template-columns: 130px 1fr;
      gap: var(--space-3);
      padding-left: var(--space-3);
      border-left: 2px solid var(--color-border);
    }
    .feed__detail {
      font-size: 13px;
      color: var(--color-text-muted);
      overflow-wrap: anywhere;
    }
  `,
})
export class TaskActivityFeed {
  private readonly tasks = inject(TasksService);
  private readonly clock = inject(UserClock);

  readonly taskId = input.required<string>();
  /** Changes whenever the task is updated, to refresh the feed. */
  readonly version = input<string>();

  protected readonly items = signal<FeedItem[]>([]);
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
      const formatDate = (value: string) =>
        formatDateValue(value, this.clock.dateFormat(), this.clock.timeZone());
      const entries = await this.tasks.activityLog(id);
      this.items.set(
        entries.map((entry) => ({
          id: entry.id,
          createdAt: entry.created_at,
          ...describeActivity(entry, formatDate),
        })),
      );
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
