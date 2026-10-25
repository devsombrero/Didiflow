import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { UserClock } from '../../core/profile/user-clock';
import type { Tables } from '../../core/supabase/database.types';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { ToastService } from '../../shared/toast/toast.service';
import { zonedDateTime } from '../../shared/utils/dates';
import { describeError } from '../../shared/utils/errors';

type Reminder = Tables<'task_reminders'>;

/** Reminders of one task: list, add (date + time in the user zone) and remove. */
@Component({
  selector: 'app-task-reminders-panel',
  imports: [ReactiveFormsModule, AppDatePipe],
  template: `
    <ul class="reminders">
      @for (reminder of reminders(); track reminder.id) {
        <li [class.sent]="reminder.sent_at">
          <span>
            {{ reminder.remind_at | appDate: true }}
            @if (reminder.note) {
              · {{ reminder.note }}
            }
            @if (reminder.sent_at) {
              <span class="muted">(enviado)</span>
            }
          </span>
          <button type="button" class="btn btn--sm" (click)="remove(reminder)">Remover</button>
        </li>
      } @empty {
        <li class="muted">Nenhum lembrete.</li>
      }
    </ul>
    <form class="reminder-form" [formGroup]="form" (ngSubmit)="add()">
      <label class="sr-only" for="reminder-date">Data</label>
      <input id="reminder-date" class="input" type="date" formControlName="date" />
      <label class="sr-only" for="reminder-time">Hora</label>
      <input id="reminder-time" class="input" type="time" formControlName="time" />
      <label class="sr-only" for="reminder-note">Nota</label>
      <input
        id="reminder-note"
        class="input"
        formControlName="note"
        maxlength="200"
        placeholder="Nota (opcional)"
      />
      <button class="btn" type="submit" [disabled]="busy()">Adicionar</button>
    </form>
    <p class="field-hint">Exibido como notificação enquanto o DidiFlow estiver aberto.</p>
  `,
  styles: `
    .reminders {
      margin: 0 0 var(--space-3);
      padding: 0;
      list-style: none;
    }
    .reminders li {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-1) 0;
    }
    .reminders .sent {
      opacity: 0.6;
    }
    .reminder-form {
      display: grid;
      grid-template-columns: auto auto 1fr auto;
      gap: var(--space-2);
    }
  `,
})
export class TaskRemindersPanel {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly clock = inject(UserClock);
  private readonly toast = inject(ToastService);

  readonly taskId = input.required<string>();

  protected readonly reminders = signal<Reminder[]>([]);
  protected readonly busy = signal(false);
  protected readonly form = inject(NonNullableFormBuilder).group({
    date: [this.clock.today(), Validators.required],
    time: ['09:00', Validators.required],
    note: ['', Validators.maxLength(200)],
  });

  constructor() {
    effect(() => {
      const id = this.taskId();
      untracked(() => void this.load(id));
    });
  }

  protected async add(): Promise<void> {
    if (this.form.invalid) return;
    const { date, time, note } = this.form.getRawValue();
    const remindAt = zonedDateTime(date, time, this.clock.timeZone());
    if (remindAt.getTime() < Date.now()) {
      this.toast.error('Escolha uma data e hora no futuro.');
      return;
    }
    this.busy.set(true);
    const { error } = await this.supabase.from('task_reminders').insert({
      task_id: this.taskId(),
      remind_at: remindAt.toISOString(),
      note: note.trim() || null,
    });
    this.busy.set(false);
    if (error) {
      this.toast.error(describeError(error));
      return;
    }
    this.form.controls.note.setValue('');
    this.toast.success('Lembrete criado.');
    await this.load(this.taskId());
  }

  protected async remove(reminder: Reminder): Promise<void> {
    const { error } = await this.supabase.from('task_reminders').delete().eq('id', reminder.id);
    if (error) {
      this.toast.error(describeError(error));
      return;
    }
    await this.load(this.taskId());
  }

  private async load(taskId: string): Promise<void> {
    const { data } = await this.supabase
      .from('task_reminders')
      .select('*')
      .eq('task_id', taskId)
      .order('remind_at');
    this.reminders.set(data ?? []);
  }
}
