import {
  Component,
  computed,
  effect,
  type ElementRef,
  inject,
  Injectable,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { UserClock } from '../../../core/profile/user-clock';
import { AppDatePipe } from '../../../shared/pipes/app-date.pipe';
import { describeError } from '../../../shared/utils/errors';
import { PriorityBadge, ProgressBar, StatusBadge } from '../components/task-badges';
import { TaskActions } from '../task-actions.service';
import { deadlineLabel, deadlineState } from '../task-deadline';
import {
  type ArchiveFilter,
  DEFAULT_TASK_QUERY,
  PRIORITY_LABELS,
  SORT_OPTIONS,
  STATUS_LABELS,
  type Task,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskPage,
  type TaskPriority,
  type TaskQuery,
  type TaskStatus,
} from '../task.model';
import { canCancel, canComplete, canReopen } from '../task-rules';
import { OrganizationStore } from '../../organization/organization.service';
import { TasksService } from '../tasks.service';

/** Keeps list filters while navigating to a task and back. */
@Injectable({ providedIn: 'root' })
export class TaskListState {
  readonly query = signal<TaskQuery>(DEFAULT_TASK_QUERY);
}

@Component({
  selector: 'app-task-list-page',
  imports: [RouterLink, AppDatePipe, StatusBadge, PriorityBadge, ProgressBar],
  templateUrl: './task-list-page.html',
  styleUrl: './task-list-page.scss',
  host: { '(document:keydown)': 'onShortcut($event)' },
})
export class TaskListPage {
  private readonly tasksService = inject(TasksService);
  private readonly router = inject(Router);
  private readonly clock = inject(UserClock);
  protected readonly actions = inject(TaskActions);
  protected readonly org = inject(OrganizationStore);

  protected readonly query = inject(TaskListState).query;
  protected readonly searchTerm = signal(this.query().search);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly errorMessage = signal('');
  protected readonly result = signal<TaskPage>({ items: [], total: 0 });

  protected readonly statuses = TASK_STATUSES;
  protected readonly priorities = TASK_PRIORITIES;
  protected readonly statusLabels = STATUS_LABELS;
  protected readonly priorityLabels = PRIORITY_LABELS;
  protected readonly sortOptions = SORT_OPTIONS;

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.result().total / this.query().pageSize)),
  );
  protected readonly hasFilters = computed(() => {
    const q = this.query();
    return (
      !!q.search ||
      q.statuses.length > 0 ||
      q.priorities.length > 0 ||
      q.archive !== 'active' ||
      !!(q.projectId || q.categoryId || q.contextId || q.tagId || q.requester)
    );
  });
  protected readonly sortIndex = computed(() =>
    SORT_OPTIONS.findIndex(
      ({ sort }) =>
        sort.field === this.query().sort.field && sort.ascending === this.query().sort.ascending,
    ),
  );

  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');
  private requestId = 0;

  constructor() {
    void this.org.ensureLoaded().catch(() => undefined);

    effect(() => {
      const query = this.query();
      untracked(() => void this.load(query));
    });

    // Debounce typing before hitting the database.
    effect((onCleanup) => {
      const term = this.searchTerm();
      const timer = setTimeout(() => {
        if (term !== untracked(this.query).search) this.patch({ search: term });
      }, 300);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected deadlineOf(task: Task): { kind: string; label: string } {
    const state = deadlineState(task, this.clock.today(), this.clock.dueSoonDays());
    return { kind: state.kind, label: deadlineLabel(state) };
  }

  protected toggleStatus(status: TaskStatus): void {
    const current = this.query().statuses;
    this.patch({
      statuses: current.includes(status)
        ? current.filter((s) => s !== status)
        : [...current, status],
    });
  }

  protected setPriority(value: string): void {
    this.patch({ priorities: value ? [value as TaskPriority] : [] });
  }

  protected setFilter(
    key: 'projectId' | 'categoryId' | 'contextId' | 'tagId' | 'requester',
    value: string,
  ): void {
    this.patch({ [key]: value || null });
  }

  protected nameOf(id: string | null): string | null {
    return id ? (this.org.byId().get(id)?.name ?? null) : null;
  }

  protected setArchive(value: string): void {
    this.patch({ archive: value as ArchiveFilter });
  }

  protected setSort(index: string): void {
    this.patch({ sort: SORT_OPTIONS[Number(index)].sort });
  }

  protected goToPage(page: number): void {
    this.query.update((q) => ({ ...q, page }));
  }

  protected clearFilters(): void {
    this.searchTerm.set('');
    this.query.set({ ...DEFAULT_TASK_QUERY, sort: this.query().sort });
  }

  protected canCancel = canCancel;
  protected canReopen = canReopen;
  protected canComplete = canComplete;

  /** Runs a row action and refreshes the list when it changed something. */
  protected async act(action: Promise<unknown>): Promise<void> {
    if ((await action) !== undefined) {
      await this.load(this.query());
    }
  }

  protected onShortcut(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const typing = target?.closest('input, textarea, select, [contenteditable="true"], dialog');
    if (typing || event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.key === '/') {
      event.preventDefault();
      this.searchInput()?.nativeElement.focus();
    } else if (event.key === 'n') {
      event.preventDefault();
      void this.router.navigate(['/tasks/new']);
    }
  }

  private patch(changes: Partial<TaskQuery>): void {
    this.query.update((q) => ({ ...q, ...changes, page: 1 }));
  }

  private async load(query: TaskQuery): Promise<void> {
    const id = ++this.requestId;
    this.state.set('loading');
    try {
      const page = await this.tasksService.list(query);
      if (id !== this.requestId) return;
      // Deleting the last row of a page: step back instead of showing an empty page.
      if (page.items.length === 0 && query.page > 1) {
        this.goToPage(query.page - 1);
        return;
      }
      this.result.set(page);
      this.state.set('ready');
    } catch (error) {
      if (id !== this.requestId) return;
      this.errorMessage.set(describeError(error, 'Não foi possível carregar as tarefas.'));
      this.state.set('error');
    }
  }
}
