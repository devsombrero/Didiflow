import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { MATERIAL_FORMS, MATERIAL_UI } from '../../shared/material';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { UserClock } from '../../core/profile/user-clock';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { ToastService } from '../../shared/toast/toast.service';
import { addDays, startOfDayIn, timeIn, todayIn, zonedDateTime } from '../../shared/utils/dates';
import { weekStart } from '../dashboard/metrics';
import { OrganizationStore } from '../organization/organization.service';
import type { Task } from '../tasks/task.model';
import { TasksService } from '../tasks/tasks.service';
import { formatDuration, sumBy, totalSeconds, workedSeconds } from './time-calc';
import { describeTimeError } from './time-errors';
import { TimerStore, TimeService, type TimeEntryWithTask } from './time.service';

interface DayGroup {
  date: string;
  total: number;
  entries: TimeEntryWithTask[];
}

@Component({
  selector: 'app-time-page',
  imports: [ReactiveFormsModule, RouterLink, AppDatePipe, MATERIAL_FORMS, MATERIAL_UI],
  templateUrl: './time-page.html',
  styleUrl: './time-page.scss',
})
export class TimePage {
  private readonly time = inject(TimeService);
  private readonly tasksService = inject(TasksService);
  private readonly clock = inject(UserClock);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly org = inject(OrganizationStore);
  private readonly fb = inject(NonNullableFormBuilder);
  protected readonly timer = inject(TimerStore);

  protected readonly week = signal(weekStart(this.clock.today()));
  protected readonly entries = signal<TimeEntryWithTask[]>([]);
  protected readonly monthTotal = signal(0);
  protected readonly taskOptions = signal<Pick<Task, 'id' | 'title'>[]>([]);
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly editingId = signal<string | null>(null);
  protected readonly saving = signal(false);

  protected readonly weekEnd = computed(() => addDays(this.week(), 6));
  protected readonly isCurrentWeek = computed(() => this.week() === weekStart(this.clock.today()));

  protected readonly days = computed<DayGroup[]>(() => {
    const tz = this.clock.timeZone();
    const groups = new Map<string, TimeEntryWithTask[]>();
    for (const entry of this.entries()) {
      const date = todayIn(tz, new Date(entry.started_at));
      groups.set(date, [...(groups.get(date) ?? []), entry]);
    }
    return [...groups.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([date, entries]) => ({ date, entries, total: totalSeconds(entries, this.now()) }));
  });
  protected readonly weekTotal = computed(() => totalSeconds(this.entries(), this.now()));
  protected readonly byCategory = computed(() =>
    this.breakdown((e) => e.tasks?.category_id ?? null, 'Sem categoria'),
  );
  protected readonly byTask = computed(() => this.breakdown((e) => e.task_id, 'Sem tarefa'));

  protected readonly timerForm = this.fb.group({
    task_id: [''],
    description: ['', Validators.maxLength(2000)],
  });

  protected readonly entryForm = this.fb.group({
    task_id: [''],
    date: [this.clock.today(), Validators.required],
    start: ['09:00', Validators.required],
    end: ['10:00', Validators.required],
    description: ['', Validators.maxLength(2000)],
  });

  constructor() {
    void this.tasksService
      .openOptions()
      .then((options) => this.taskOptions.set(options))
      .catch(() => undefined);
    void this.org.ensureLoaded().catch(() => undefined);

    effect(() => {
      const week = this.week();
      this.timer.version();
      untracked(() => void this.load(week));
    });
  }

  protected formatDuration = formatDuration;

  protected entrySeconds(entry: TimeEntryWithTask): number {
    return workedSeconds(entry, this.now());
  }

  protected timeRange(entry: TimeEntryWithTask): string {
    const tz = this.clock.timeZone();
    const start = timeIn(tz, new Date(entry.started_at));
    return entry.ended_at ? `${start}–${timeIn(tz, new Date(entry.ended_at))}` : `${start}–agora`;
  }

  protected shiftWeek(days: number): void {
    this.week.update((w) => addDays(w, days));
  }

  protected goToCurrentWeek(): void {
    this.week.set(weekStart(this.clock.today()));
  }

  protected async startTimer(): Promise<void> {
    const { task_id, description } = this.timerForm.getRawValue();
    try {
      await this.timer.start(task_id || null, description.trim() || null);
      this.timerForm.reset({ task_id: '', description: '' });
      this.toast.success('Cronômetro iniciado.');
    } catch (error) {
      this.toast.error(describeTimeError(error));
    }
  }

  protected edit(entry: TimeEntryWithTask): void {
    if (!entry.ended_at) return;
    const tz = this.clock.timeZone();
    this.editingId.set(entry.id);
    this.entryForm.reset({
      task_id: entry.task_id ?? '',
      date: todayIn(tz, new Date(entry.started_at)),
      start: timeIn(tz, new Date(entry.started_at)),
      end: timeIn(tz, new Date(entry.ended_at)),
      description: entry.description ?? '',
    });
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
    this.entryForm.reset({
      task_id: '',
      date: this.clock.today(),
      start: '09:00',
      end: '10:00',
      description: '',
    });
  }

  protected async saveEntry(): Promise<void> {
    if (this.entryForm.invalid) {
      this.entryForm.markAllAsTouched();
      return;
    }
    const v = this.entryForm.getRawValue();
    const tz = this.clock.timeZone();
    const startedAt = zonedDateTime(v.date, v.start, tz);
    // An end time earlier than the start means the entry crosses midnight.
    let endedAt = zonedDateTime(v.date, v.end, tz);
    if (endedAt <= startedAt) endedAt = zonedDateTime(addDays(v.date, 1), v.end, tz);

    const input = {
      task_id: v.task_id || null,
      description: v.description.trim() || null,
      started_at: startedAt.toISOString(),
      ended_at: endedAt.toISOString(),
    };
    this.saving.set(true);
    try {
      const id = this.editingId();
      if (id) await this.time.update(id, input);
      else await this.time.createManual(input);
      this.toast.success(id ? 'Registro atualizado.' : 'Tempo registrado.');
      this.cancelEdit();
      await this.load(this.week());
    } catch (error) {
      this.toast.error(describeTimeError(error));
    } finally {
      this.saving.set(false);
    }
  }

  protected async remove(entry: TimeEntryWithTask): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Excluir registro de tempo?',
      message: `${formatDuration(this.entrySeconds(entry))} serão removidos dos seus totais.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await this.time.remove(entry.id);
      if (!entry.ended_at) await this.timer.refresh();
      await this.load(this.week());
      this.toast.success('Registro excluído.');
    } catch (error) {
      this.toast.error(describeTimeError(error));
    }
  }

  /** Re-evaluated each second while a timer runs, so running totals stay live. */
  private now(): number {
    this.timer.elapsed();
    return Date.now();
  }

  private breakdown(
    keyOf: (entry: TimeEntryWithTask) => string | null,
    emptyLabel: string,
  ): { label: string; seconds: number }[] {
    const titles = new Map(this.entries().map((e) => [e.task_id ?? '', e.tasks?.title ?? '']));
    return [...sumBy(this.entries(), keyOf, this.now())]
      .map(([key, seconds]) => ({
        label: key ? (this.org.byId().get(key)?.name ?? titles.get(key) ?? emptyLabel) : emptyLabel,
        seconds,
      }))
      .sort((a, b) => b.seconds - a.seconds);
  }

  private async load(week: string): Promise<void> {
    const tz = this.clock.timeZone();
    const monthStart = `${week.slice(0, 8)}01`;
    try {
      const [entries, month] = await Promise.all([
        this.time.list(startOfDayIn(week, tz), startOfDayIn(addDays(week, 7), tz)),
        this.time.list(startOfDayIn(monthStart, tz), startOfDayIn(nextMonth(monthStart), tz)),
      ]);
      this.entries.set(entries);
      this.monthTotal.set(totalSeconds(month));
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}

function nextMonth(date: string): string {
  const [year, month] = date.split('-').map(Number);
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
}
