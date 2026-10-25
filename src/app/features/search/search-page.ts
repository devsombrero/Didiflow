import {
  afterNextRender,
  Component,
  computed,
  effect,
  type ElementRef,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { UserClock } from '../../core/profile/user-clock';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { HighlightedText } from '../../shared/components/highlighted-text';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { describeError } from '../../shared/utils/errors';
import { excerpt, searchTerms } from '../../shared/utils/highlight';
import { PriorityBadge, StatusBadge } from '../tasks/components/task-badges';
import { deadlineLabel, deadlineState } from '../tasks/task-deadline';
import { OPEN_STATUSES } from '../tasks/task.model';

interface SearchRow {
  id: string;
  title: string;
  status: (typeof OPEN_STATUSES)[number] | 'done' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date: string | null;
  requester_name: string | null;
  project_name: string | null;
  tag_names: string[];
  description: string | null;
  notes: string | null;
  archived_at: string | null;
}

type QuickFilter = 'all' | 'open' | 'done' | 'important';

@Component({
  selector: 'app-search-page',
  imports: [RouterLink, AppDatePipe, HighlightedText, StatusBadge, PriorityBadge],
  templateUrl: './search-page.html',
  styleUrl: './search-page.scss',
})
export class SearchPage {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly router = inject(Router);
  private readonly clock = inject(UserClock);

  /** ?q= from the global search box. */
  readonly q = input<string>('');

  protected readonly query = signal('');
  protected readonly includeArchived = signal(false);
  protected readonly filter = signal<QuickFilter>('all');
  protected readonly results = signal<SearchRow[]>([]);
  protected readonly state = signal<'idle' | 'loading' | 'ready' | 'error'>('idle');
  protected readonly errorMessage = signal('');

  protected readonly terms = computed(() => searchTerms(this.query()));
  protected readonly filtered = computed(() =>
    this.results().filter((row) => {
      switch (this.filter()) {
        case 'open':
          return OPEN_STATUSES.includes(row.status as (typeof OPEN_STATUSES)[number]);
        case 'done':
          return row.status === 'done';
        case 'important':
          return row.priority === 'high' || row.priority === 'urgent';
        default:
          return true;
      }
    }),
  );

  private requestId = 0;
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  constructor() {
    // Focus the field when the page opens (keyboard users land ready to type).
    afterNextRender(() => this.searchInput()?.nativeElement.focus());
    effect(() => this.query.set(this.q() ?? ''));

    effect((onCleanup) => {
      const query = this.query();
      const archived = this.includeArchived();
      const timer = setTimeout(() => untracked(() => void this.search(query, archived)), 250);
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected snippet(row: SearchRow): string {
    const text = [row.description, row.notes].filter(Boolean).join(' · ');
    return excerpt(text, this.terms());
  }

  protected deadline(row: SearchRow): string {
    return deadlineLabel(deadlineState(row, this.clock.today(), this.clock.dueSoonDays()));
  }

  protected onInput(value: string): void {
    this.query.set(value);
    void this.router.navigate([], { queryParams: { q: value || null }, replaceUrl: true });
  }

  private async search(query: string, includeArchived: boolean): Promise<void> {
    const id = ++this.requestId;
    if (searchTerms(query).length === 0) {
      this.results.set([]);
      this.state.set('idle');
      return;
    }
    this.state.set('loading');
    const { data, error } = await this.supabase.rpc('search_tasks', {
      p_query: query,
      p_limit: 50,
      p_include_archived: includeArchived,
    });
    if (id !== this.requestId) return;
    if (error) {
      this.errorMessage.set(describeError(error, 'Não foi possível buscar.'));
      this.state.set('error');
      return;
    }
    this.results.set(data as SearchRow[]);
    this.state.set('ready');
  }
}
