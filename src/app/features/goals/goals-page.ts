import { Component, computed, inject, type OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { UserClock } from '../../core/profile/user-clock';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { ToastService } from '../../shared/toast/toast.service';
import { addDays } from '../../shared/utils/dates';
import { describeError } from '../../shared/utils/errors';
import { isHttpsUrl } from '../tasks/task-form/task-form.validators';
import { OrganizationStore } from '../organization/organization.service';
import {
  evaluateGoal,
  type Goal,
  GOAL_STATUS_LABELS,
  type GoalEvaluation,
  METRIC_OPTIONS,
  metricLabel,
  metricUnit,
} from '../kpis/goals';
import type { KpiData, KpiMetric } from '../kpis/kpis';
import { type Achievement, KpisService } from '../kpis/kpis.service';

const ACHIEVEMENT_KINDS = [
  { value: 'course', label: 'Curso' },
  { value: 'certification', label: 'Certificação' },
  { value: 'skill', label: 'Habilidade' },
  { value: 'other', label: 'Outro' },
] as const;

@Component({
  selector: 'app-goals-page',
  imports: [ReactiveFormsModule, RouterLink, AppDatePipe],
  templateUrl: './goals-page.html',
  styleUrl: './goals-page.scss',
})
export class GoalsPage implements OnInit {
  private readonly service = inject(KpisService);
  private readonly clock = inject(UserClock);
  private readonly org = inject(OrganizationStore);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly metrics = METRIC_OPTIONS;
  protected readonly kinds = ACHIEVEMENT_KINDS;
  protected readonly statusLabels = GOAL_STATUS_LABELS;
  protected readonly state = signal<'loading' | 'ready' | 'error'>('loading');
  protected readonly data = signal<KpiData>({ tasks: [], history: [], time: [], achievements: [] });
  protected readonly goals = signal<Goal[]>([]);
  protected readonly achievements = signal<Achievement[]>([]);
  protected readonly editingGoal = signal<string | null>(null);
  protected readonly editingAchievement = signal<string | null>(null);
  protected readonly saving = signal(false);

  protected readonly evaluated = computed(() => {
    const ctx = {
      today: this.clock.today(),
      timeZone: this.clock.timeZone(),
      categoryName: (id: string) => this.org.byId().get(id)?.name,
    };
    return this.goals().map((goal) => ({ goal, evaluation: evaluateGoal(goal, this.data(), ctx) }));
  });

  protected readonly goalForm = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(150), Validators.pattern(/\S/)]],
    metric: this.fb.control<KpiMetric>('deliveries'),
    comparison: this.fb.control<'at_least' | 'at_most'>('at_least'),
    target_value: this.fb.control<number | null>(null, [Validators.required, Validators.min(0)]),
    achievability: ['', Validators.maxLength(1000)],
    relevance: ['', Validators.maxLength(1000)],
    start_date: [this.clock.today(), Validators.required],
    end_date: [addDays(this.clock.today(), 30), Validators.required],
  });

  protected readonly achievementForm = this.fb.group({
    title: ['', [Validators.required, Validators.maxLength(150), Validators.pattern(/\S/)]],
    kind: this.fb.control<(typeof ACHIEVEMENT_KINDS)[number]['value']>('course'),
    provider: ['', Validators.maxLength(120)],
    achieved_on: [this.clock.today(), Validators.required],
    hours: this.fb.control<number | null>(null, Validators.min(0)),
    url: [''],
    notes: ['', Validators.maxLength(2000)],
  });

  protected readonly unit = computed(() => metricUnit(this.goalForm.controls.metric.value));

  async ngOnInit(): Promise<void> {
    await this.load();
  }

  protected metricLabel = metricLabel;
  protected metricUnit = metricUnit;

  protected kindLabel(kind: string): string {
    return ACHIEVEMENT_KINDS.find((k) => k.value === kind)?.label ?? kind;
  }

  protected formatValue(metric: KpiMetric, evaluation: GoalEvaluation): string {
    if (evaluation.current === null) return '—';
    const value = Math.round(evaluation.current * 10) / 10;
    return `${value.toLocaleString('pt-BR')} ${metricUnit(metric)}`;
  }

  protected isPercent(metric: KpiMetric): boolean {
    return metricUnit(metric) === '%';
  }

  protected editGoal(goal: Goal): void {
    this.editingGoal.set(goal.id);
    this.goalForm.reset({
      title: goal.title,
      metric: goal.metric,
      comparison: goal.comparison as 'at_least' | 'at_most',
      target_value: Number(goal.target_value),
      achievability: goal.achievability ?? '',
      relevance: goal.relevance ?? '',
      start_date: goal.start_date,
      end_date: goal.end_date,
    });
  }

  protected resetGoal(): void {
    this.editingGoal.set(null);
    this.goalForm.reset({
      title: '',
      metric: 'deliveries',
      comparison: 'at_least',
      target_value: null,
      achievability: '',
      relevance: '',
      start_date: this.clock.today(),
      end_date: addDays(this.clock.today(), 30),
    });
  }

  protected goalErrors(): string | null {
    const v = this.goalForm.getRawValue();
    if (v.end_date && v.start_date && v.end_date < v.start_date)
      return 'O fim deve ser igual ou posterior ao início.';
    if (this.isPercent(v.metric) && (v.target_value ?? 0) > 100)
      return 'Metas percentuais vão até 100%.';
    return null;
  }

  protected async saveGoal(): Promise<void> {
    if (this.goalForm.invalid || this.goalErrors()) {
      this.goalForm.markAllAsTouched();
      return;
    }
    const v = this.goalForm.getRawValue();
    await this.run(async () => {
      await this.service.saveGoal(
        {
          title: v.title.trim(),
          metric: v.metric,
          comparison: v.comparison,
          target_value: v.target_value ?? 0,
          achievability: v.achievability.trim() || null,
          relevance: v.relevance.trim() || null,
          start_date: v.start_date,
          end_date: v.end_date,
        },
        this.editingGoal() ?? undefined,
      );
      this.toast.success(this.editingGoal() ? 'Meta atualizada.' : 'Meta criada.');
      this.resetGoal();
    });
  }

  protected async removeGoal(goal: Goal): Promise<void> {
    if (
      !(await this.confirm.ask({
        title: 'Excluir meta?',
        message: `"${goal.title}" será removida.`,
        confirmLabel: 'Excluir',
        danger: true,
      }))
    )
      return;
    await this.run(async () => {
      await this.service.removeGoal(goal.id);
      this.toast.success('Meta excluída.');
    });
  }

  protected editAchievement(item: Achievement): void {
    this.editingAchievement.set(item.id);
    this.achievementForm.reset({
      title: item.title,
      kind: item.kind as (typeof ACHIEVEMENT_KINDS)[number]['value'],
      provider: item.provider ?? '',
      achieved_on: item.achieved_on,
      hours: item.hours === null ? null : Number(item.hours),
      url: item.url ?? '',
      notes: item.notes ?? '',
    });
  }

  protected resetAchievement(): void {
    this.editingAchievement.set(null);
    this.achievementForm.reset({
      title: '',
      kind: 'course',
      provider: '',
      achieved_on: this.clock.today(),
      hours: null,
      url: '',
      notes: '',
    });
  }

  protected urlInvalid(): boolean {
    const url = this.achievementForm.controls.url.value.trim();
    return url !== '' && !isHttpsUrl(url);
  }

  protected async saveAchievement(): Promise<void> {
    if (this.achievementForm.invalid || this.urlInvalid()) {
      this.achievementForm.markAllAsTouched();
      return;
    }
    const v = this.achievementForm.getRawValue();
    await this.run(async () => {
      await this.service.saveAchievement(
        {
          title: v.title.trim(),
          kind: v.kind,
          provider: v.provider.trim() || null,
          achieved_on: v.achieved_on,
          hours: v.hours,
          url: v.url.trim() || null,
          notes: v.notes.trim() || null,
        },
        this.editingAchievement() ?? undefined,
      );
      this.toast.success('Registro de desenvolvimento salvo.');
      this.resetAchievement();
    });
  }

  protected async removeAchievement(item: Achievement): Promise<void> {
    if (
      !(await this.confirm.ask({
        title: 'Excluir registro?',
        message: `"${item.title}" será removido.`,
        confirmLabel: 'Excluir',
        danger: true,
      }))
    )
      return;
    await this.run(async () => {
      await this.service.removeAchievement(item.id);
      this.toast.success('Registro excluído.');
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.saving.set(true);
    try {
      await action();
      await this.load();
    } catch (error) {
      this.toast.error(describeError(error));
    } finally {
      this.saving.set(false);
    }
  }

  private async load(): Promise<void> {
    try {
      const [data, goals, achievements] = await Promise.all([
        this.service.data(),
        this.service.goals(),
        this.service.achievements(),
        this.org.ensureLoaded().catch(() => undefined),
      ]);
      this.data.set(data);
      this.goals.set(goals);
      this.achievements.set(achievements);
      this.state.set('ready');
    } catch {
      this.state.set('error');
    }
  }
}
