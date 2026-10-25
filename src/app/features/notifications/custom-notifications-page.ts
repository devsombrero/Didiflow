import {
  Component,
  computed,
  inject,
  type OnInit,
  signal,
  type TemplateRef,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog, type MatDialogRef } from '@angular/material/dialog';
import { SoundService } from '../../core/feedback/sound.service';
import { SOUND_LABELS, type SoundName } from '../../core/feedback/sounds';
import { UserClock } from '../../core/profile/user-clock';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { FORM_DIALOG, formDialogConfig } from '../../shared/dialog/form-dialog';
import { MATERIAL_FORMS, MATERIAL_UI } from '../../shared/material';
import { ToastService } from '../../shared/toast/toast.service';
import { addDays, timeIn, todayIn, zonedDateTime } from '../../shared/utils/dates';
import { describeError } from '../../shared/utils/errors';
import {
  type CustomSchedule,
  describeSchedule,
  nextOccurrence,
  type ScheduleRule,
  WEEKDAY_LABELS,
} from './custom-schedule';
import {
  type CustomNotification,
  type CustomNotificationInput,
  CustomNotificationsService,
} from './custom-notifications.service';
import { AppNotifier } from './notification-center';

type RuleSound = SoundName | 'none';

const SCHEDULES: { value: CustomSchedule; label: string }[] = [
  { value: 'once', label: 'Uma vez' },
  { value: 'daily', label: 'Todo dia' },
  { value: 'weekdays', label: 'Dias úteis' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'interval', label: 'Intervalo' },
];

const INTERVALS = [15, 30, 45, 60, 90, 120, 180, 240, 480];
const RULE_SOUNDS: RuleSound[] = ['notify', 'chime', 'success', 'complete', 'tick', 'none'];

/** User-defined notifications: list, create/edit in a dialog, test and toggle. */
@Component({
  selector: 'app-custom-notifications-page',
  imports: [ReactiveFormsModule, MATERIAL_FORMS, MATERIAL_UI, MatButtonToggleModule, FORM_DIALOG],
  templateUrl: './custom-notifications-page.html',
  styleUrl: './custom-notifications-page.scss',
})
export class CustomNotificationsPage implements OnInit {
  private readonly service = inject(CustomNotificationsService);
  private readonly notifier = inject(AppNotifier);
  private readonly sounds = inject(SoundService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly dialog = inject(MatDialog);
  private readonly clock = inject(UserClock);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly schedules = SCHEDULES;
  protected readonly intervals = INTERVALS;
  protected readonly weekdayLabels = WEEKDAY_LABELS;
  protected readonly ruleSounds = RULE_SOUNDS;
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly rules = signal<CustomNotification[]>([]);
  protected readonly editingId = signal<string | null>(null);
  protected readonly saving = signal(false);

  private readonly editor = viewChild.required<TemplateRef<unknown>>('editor');
  private editorRef: MatDialogRef<unknown> | null = null;

  protected readonly form = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(120), Validators.pattern(/\S/)]],
    message: ['', Validators.maxLength(500)],
    schedule: this.fb.control<CustomSchedule>('daily'),
    date: [''],
    time: ['09:00', Validators.required],
    weekdays: this.fb.control<number[]>([1, 2, 3, 4, 5]),
    interval_minutes: [60],
    use_window: [true],
    window_start: ['09:00'],
    window_end: ['18:00'],
    sound: this.fb.control<RuleSound>('notify'),
    active: [true],
  });

  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  /** Live preview of the next delivery while editing. */
  protected readonly preview = computed(() => {
    this.formValue();
    const input = this.toInput();
    if (!input) return null;
    const rule: ScheduleRule = {
      ...input,
      run_at: input.run_at ?? null,
      time_of_day: input.time_of_day ?? null,
      weekdays: input.weekdays ?? null,
      interval_minutes: input.interval_minutes ?? null,
      window_start: input.window_start ?? null,
      window_end: input.window_end ?? null,
      created_at: new Date().toISOString(),
      last_fired_at: null,
    };
    const next = nextOccurrence(rule, new Date(), this.clock.timeZone());
    return {
      summary: describeSchedule(rule, this.clock.timeZone()),
      next: next ? this.format(next) : null,
    };
  });

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected soundLabel(sound: string): string {
    return sound === 'none' ? 'Sem som' : (SOUND_LABELS[sound as SoundName] ?? sound);
  }

  protected summary(rule: CustomNotification): string {
    return describeSchedule(rule, this.clock.timeZone());
  }

  protected next(rule: CustomNotification): string | null {
    if (!rule.active) return null;
    const at = nextOccurrence(rule, new Date(), this.clock.timeZone());
    return at ? this.format(at) : null;
  }

  protected create(): void {
    this.editingId.set(null);
    this.form.reset({
      title: '',
      message: '',
      schedule: 'daily',
      date: this.clock.today(),
      time: '09:00',
      weekdays: [1, 2, 3, 4, 5],
      interval_minutes: 60,
      use_window: true,
      window_start: '09:00',
      window_end: '18:00',
      sound: 'notify',
      active: true,
    });
    this.openEditor();
  }

  protected edit(rule: CustomNotification): void {
    const tz = this.clock.timeZone();
    const runAt = rule.run_at ? new Date(rule.run_at) : null;
    this.editingId.set(rule.id);
    this.form.reset({
      title: rule.title,
      message: rule.message ?? '',
      schedule: rule.schedule as CustomSchedule,
      date: runAt ? todayIn(tz, runAt) : this.clock.today(),
      time: runAt ? timeIn(tz, runAt) : (rule.time_of_day ?? '09:00').slice(0, 5),
      weekdays: rule.weekdays ?? [1, 2, 3, 4, 5],
      interval_minutes: rule.interval_minutes ?? 60,
      use_window: !!rule.window_start,
      window_start: (rule.window_start ?? '09:00').slice(0, 5),
      window_end: (rule.window_end ?? '18:00').slice(0, 5),
      sound: rule.sound as RuleSound,
      active: rule.active,
    });
    this.openEditor();
  }

  protected toggleWeekday(day: number): void {
    const current = this.form.controls.weekdays.value;
    this.form.controls.weekdays.setValue(
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort(),
    );
  }

  protected previewSound(): void {
    const sound = this.form.controls.sound.value;
    if (sound !== 'none') this.sounds.preview(sound, 70);
  }

  protected scheduleError(): string | null {
    const v = this.form.getRawValue();
    if (v.schedule === 'once' && !v.date) return 'Escolha a data.';
    if (v.schedule === 'weekly' && v.weekdays.length === 0) return 'Escolha pelo menos um dia.';
    if (v.schedule === 'interval' && v.use_window && v.window_start >= v.window_end)
      return 'O horário final precisa ser depois do inicial.';
    return null;
  }

  protected async save(): Promise<void> {
    const input = this.toInput();
    if (this.form.invalid || this.scheduleError() || !input) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    try {
      const id = this.editingId();
      await this.service.save(input, id ?? undefined);
      this.toast.success(id ? 'Notificação atualizada.' : 'Notificação criada.');
      this.editorRef?.close();
      await this.load();
    } catch (error) {
      this.toast.error(describeError(error, 'Não foi possível salvar a notificação.'));
    } finally {
      this.saving.set(false);
    }
  }

  protected async setActive(rule: CustomNotification, active: boolean): Promise<void> {
    try {
      await this.service.setActive(rule.id, active);
      this.rules.update((list) => list.map((r) => (r.id === rule.id ? { ...r, active } : r)));
    } catch (error) {
      this.toast.error(describeError(error));
      await this.load();
    }
  }

  protected async test(rule: CustomNotification): Promise<void> {
    await this.notifier.notify({
      kind: 'custom',
      title: rule.title,
      body: rule.message ?? '',
      sound: rule.sound as RuleSound,
    });
  }

  protected async remove(rule: CustomNotification): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Excluir notificação?',
      message: `"${rule.title}" deixará de ser exibida.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await this.service.remove(rule.id);
      this.toast.success('Notificação excluída.');
      await this.load();
    } catch (error) {
      this.toast.error(describeError(error));
    }
  }

  private openEditor(): void {
    this.editorRef = this.dialog.open(this.editor(), formDialogConfig(640));
    this.editorRef.afterClosed().subscribe(() => (this.editorRef = null));
  }

  /** Database fields for the current form; null when the date/time is incomplete. */
  private toInput(): CustomNotificationInput | null {
    const v = this.form.getRawValue();
    const base = {
      title: v.title.trim(),
      message: v.message.trim() || null,
      schedule: v.schedule,
      sound: v.sound,
      active: v.active,
      run_at: null as string | null,
      time_of_day: null as string | null,
      weekdays: null as number[] | null,
      interval_minutes: null as number | null,
      window_start: null as string | null,
      window_end: null as string | null,
    };
    switch (v.schedule) {
      case 'once':
        if (!v.date || !v.time) return null;
        return {
          ...base,
          run_at: zonedDateTime(v.date, v.time, this.clock.timeZone()).toISOString(),
        };
      case 'daily':
      case 'weekdays':
        return v.time ? { ...base, time_of_day: v.time } : null;
      case 'weekly':
        return v.time ? { ...base, time_of_day: v.time, weekdays: v.weekdays } : null;
      case 'interval':
        return {
          ...base,
          interval_minutes: v.interval_minutes,
          window_start: v.use_window ? v.window_start : null,
          window_end: v.use_window ? v.window_end : null,
        };
    }
  }

  private format(date: Date): string {
    const tz = this.clock.timeZone();
    const day = todayIn(tz, date);
    const today = this.clock.today();
    const [y, m, d] = day.split('-');
    const label =
      day === today
        ? 'hoje'
        : day === addDays(today, 1)
          ? 'amanhã'
          : `${d}/${m}${y === today.slice(0, 4) ? '' : `/${y}`}`;
    return `${label} às ${timeIn(tz, date)}`;
  }

  private async load(): Promise<void> {
    try {
      this.rules.set(await this.service.list());
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
