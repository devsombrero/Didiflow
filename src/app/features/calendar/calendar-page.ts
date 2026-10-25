import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UserClock } from '../../core/profile/user-clock';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { describeError } from '../../shared/utils/errors';
import {
  PRIORITY_LABELS,
  STATUS_LABELS,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPriority,
  type TaskStatus,
} from '../tasks/task.model';
import {
  buildDays,
  type CalendarTask,
  type CalendarView,
  monthTitle,
  shiftAnchor,
  visibleRange,
  WEEKDAYS,
} from './calendar';

const COLUMNS = 'id,title,status,priority,start_date,due_date,progress_percentage';

@Component({
  selector: 'app-calendar-page',
  imports: [RouterLink, AppDatePipe],
  templateUrl: './calendar-page.html',
  styleUrl: './calendar-page.scss',
})
export class CalendarPage {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly clock = inject(UserClock);

  protected readonly weekdays = WEEKDAYS;
  protected readonly priorities = TASK_PRIORITIES;
  protected readonly statuses = TASK_STATUSES;
  protected readonly priorityLabels = PRIORITY_LABELS;
  protected readonly statusLabels = STATUS_LABELS;

  protected readonly view = signal<CalendarView>('month');
  protected readonly anchor = signal(this.clock.today());
  protected readonly priority = signal<TaskPriority | ''>('');
  protected readonly status = signal<TaskStatus | ''>('');
  protected readonly tasks = signal<CalendarTask[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly errorMessage = signal('');

  protected readonly range = computed(() => visibleRange(this.view(), this.anchor()));
  protected readonly title = computed(() => {
    if (this.view() === 'month') return monthTitle(this.anchor());
    return null;
  });
  protected readonly days = computed(() => {
    const filtered = this.tasks().filter(
      (task) =>
        (!this.priority() || task.priority === this.priority()) &&
        (!this.status() || task.status === this.status()),
    );
    return buildDays(
      this.view(),
      this.anchor(),
      filtered,
      this.clock.today(),
      this.clock.dueSoonDays(),
    );
  });

  constructor() {
    effect(() => {
      const range = this.range();
      untracked(() => void this.load(range));
    });
  }

  protected setView(view: CalendarView): void {
    this.view.set(view);
  }

  protected move(direction: 1 | -1): void {
    this.anchor.update((anchor) => shiftAnchor(this.view(), anchor, direction));
  }

  protected goToday(): void {
    this.anchor.set(this.clock.today());
  }

  protected openDay(date: string): void {
    this.anchor.set(date);
    this.view.set('day');
  }

  protected eventLabel(kind: 'start' | 'due'): string {
    return kind === 'start' ? 'Início' : 'Entrega';
  }

  private requestId = 0;

  protected async load(range: { from: string; to: string }): Promise<void> {
    const id = ++this.requestId;
    this.state.set('loading');
    const { from, to } = range;
    const { data, error } = await this.supabase
      .from('tasks')
      .select(COLUMNS)
      .is('deleted_at', null)
      .is('archived_at', null)
      .or(
        `and(due_date.gte.${from},due_date.lte.${to}),and(start_date.gte.${from},start_date.lte.${to})`,
      )
      .limit(2000);
    if (id !== this.requestId) return; // a newer range was requested
    if (error) {
      this.errorMessage.set(describeError(error, 'Não foi possível carregar o calendário.'));
      this.state.set('error');
      return;
    }
    this.tasks.set(data);
    this.state.set('ready');
  }
}
