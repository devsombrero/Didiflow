import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { UserClock } from '../../core/profile/user-clock';
import type { Tables } from '../../core/supabase/database.types';
import { SUPABASE_CLIENT } from '../../core/supabase/supabase-client';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { ToastService } from '../../shared/toast/toast.service';
import { zonedDateTime } from '../../shared/utils/dates';
import { describeError } from '../../shared/utils/errors';
import { MATERIAL_FORMS } from '../../shared/material';

type Reminder = Tables<'task_reminders'>;

/** Reminders of one task: list, add (date + time in the user zone) and remove. */
@Component({
  selector: 'app-task-reminders-panel',
  imports: [ReactiveFormsModule, AppDatePipe, MATERIAL_FORMS],
  template: `
    <ul class="reminders">
      @for (reminder of reminders(); track reminder.id) {
        <li [class.sent]="reminder.sent_at">
          <mat-icon>{{ reminder.sent_at ? 'notifications_off' : 'notifications_active' }}</mat-icon>
          <span class="reminders__text">
            {{ reminder.remind_at | appDate: true }}
            @if (reminder.note) {
              · {{ reminder.note }}
            }
            @if (reminder.sent_at) {
              <span class="muted">(enviado)</span>
            }
          </span>
          <button
            matIconButton
            type="button"
            aria-label="Remover lembrete"
            (click)="remove(reminder)"
          >
            <mat-icon>close</mat-icon>
          </button>
        </li>
      } @empty {
        <li class="muted">Nenhum lembrete.</li>
      }
    </ul>
    <form class="reminder-form" [formGroup]="form" (ngSubmit)="add()">
      <mat-form-field>
        <mat-label>Data</mat-label>
        <input matInput id="reminder-date" type="date" formControlName="date" />
      </mat-form-field>
      <mat-form-field>
        <mat-label>Hora</mat-label>
        <input matInput id="reminder-time" type="time" formControlName="time" />
      </mat-form-field>
      <mat-form-field class="reminder-form__note">
        <mat-label>Nota (opcional)</mat-label>
        <input matInput id="reminder-note" formControlName="note" maxlength="200" />
      </mat-form-field>
      <button matButton="tonal" type="submit" [disabled]="busy()">
        <mat-icon>add_alert</mat-icon> Adicionar
      </button>
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
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-1) 0;
    }
    .reminders__text {
      flex: 1;
    }
    .reminders .sent {
      opacity: 0.6;
    }
    .reminder-form {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: flex-start;
    }
    .reminder-form mat-form-field {
      flex: 1 1 140px;
    }
    .reminder-form .reminder-form__note {
      flex-basis: 100%;
    }
    .reminder-form button {
      margin-top: var(--space-2);
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
