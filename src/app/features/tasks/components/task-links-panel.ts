import {
  Component,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  FormGroupDirective,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { DesktopBridge } from '../../../core/platform/desktop-bridge';
import type { Tables } from '../../../core/supabase/database.types';
import { SUPABASE_CLIENT } from '../../../core/supabase/supabase-client';
import { ConfirmService } from '../../../shared/confirm/confirm.service';
import { MATERIAL_FORMS } from '../../../shared/material';
import { AppDatePipe } from '../../../shared/pipes/app-date.pipe';
import { ToastService } from '../../../shared/toast/toast.service';
import { describeError } from '../../../shared/utils/errors';
import { linkIcon, linkLabel, normalizeLink, shortUrl } from '../task-links';

export type TaskLink = Tables<'task_links'>;

/** External resources of a task (https links): list, add, open and remove. */
@Component({
  selector: 'app-task-links-panel',
  imports: [ReactiveFormsModule, MATERIAL_FORMS, AppDatePipe],
  template: `
    <ul class="links" aria-label="Recursos">
      @for (link of links(); track link.id) {
        <li class="link" animate.enter="enter-fade-up" [style.--stagger]="$index">
          <mat-icon class="link__icon">{{ icon(link.url) }}</mat-icon>
          <span class="link__info">
            <button
              type="button"
              class="link__title"
              (click)="open(link)"
              [attr.aria-label]="'Abrir ' + label(link)"
            >
              {{ label(link) }}
            </button>
            <span class="muted">
              @if (link.title) {
                {{ short(link.url) }} ·
              }
              {{ link.created_at | appDate: true }}
            </span>
          </span>
          <button
            matIconButton
            type="button"
            [attr.aria-label]="'Copiar ' + label(link)"
            (click)="copy(link)"
          >
            <mat-icon>content_copy</mat-icon>
          </button>
          <button
            matIconButton
            type="button"
            [attr.aria-label]="'Remover ' + label(link)"
            (click)="remove(link)"
          >
            <mat-icon>delete</mat-icon>
          </button>
        </li>
      } @empty {
        <li class="muted empty">
          Nenhum recurso. Adicione links de documentos, protótipos, cards ou vídeos.
        </li>
      }
    </ul>
    <form class="add" [formGroup]="form" (ngSubmit)="add()" novalidate>
      <mat-form-field class="add__url" subscriptSizing="dynamic">
        <mat-label>Link (https://)</mat-label>
        <input
          matInput
          id="link-url"
          formControlName="url"
          autocomplete="off"
          placeholder="https://"
        />
        @if (error()) {
          <mat-hint class="hint-error">{{ error() }}</mat-hint>
        }
      </mat-form-field>
      <mat-form-field class="add__title" subscriptSizing="dynamic">
        <mat-label>Título (opcional)</mat-label>
        <input
          matInput
          id="link-title"
          formControlName="title"
          maxlength="200"
          autocomplete="off"
        />
      </mat-form-field>
      <button matButton="tonal" type="submit" [disabled]="busy()">
        <mat-icon>add_link</mat-icon> Adicionar link
      </button>
    </form>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }
    .links {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .link {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-2) 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .link__icon {
      color: var(--mat-sys-primary);
    }
    .link__info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .link__title {
      all: unset;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-primary);
      cursor: pointer;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .link__title:hover,
    .link__title:focus-visible {
      text-decoration: underline;
    }
    .muted {
      font: var(--mat-sys-body-small);
      color: var(--color-text-muted);
    }
    .empty {
      padding: var(--space-2) 0;
    }
    .add {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-3);
    }
    .add__url {
      flex: 2 1 280px;
    }
    .add__title {
      flex: 1 1 180px;
    }
  `,
})
export class TaskLinksPanel {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly bridge = inject(DesktopBridge);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly taskId = input.required<string>();
  /** Emitted after adding or removing a link (the activity feed reloads). */
  readonly changed = output<void>();
  /** Current number of links (shown in the tab label). */
  readonly count = output<number>();

  protected readonly links = signal<TaskLink[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  private readonly formDirective = viewChild(FormGroupDirective);
  protected readonly form = this.fb.group({
    url: ['', Validators.required],
    title: ['', Validators.maxLength(200)],
  });

  protected readonly icon = linkIcon;
  protected readonly label = linkLabel;
  protected readonly short = shortUrl;

  constructor() {
    effect(() => {
      const id = this.taskId();
      untracked(() => void this.load(id));
    });
    this.form.controls.url.valueChanges.subscribe(() => this.error.set(null));
  }

  protected async add(): Promise<void> {
    const check = normalizeLink(this.form.controls.url.value);
    if (!check.ok) {
      this.error.set(check.error);
      return;
    }
    if (this.links().some((link) => link.url === check.url)) {
      this.error.set('Este link já está na tarefa.');
      return;
    }
    this.busy.set(true);
    try {
      const { error } = await this.supabase.from('task_links').insert({
        task_id: this.taskId(),
        url: check.url,
        title: this.form.controls.title.value.trim() || null,
      });
      if (error) throw error;
      this.formDirective()?.resetForm({ url: '', title: '' });
      this.toast.success('Link adicionado.');
      await this.load(this.taskId());
      this.changed.emit();
    } catch (error) {
      this.toast.error(describeError(error, 'Não foi possível adicionar o link.'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async open(link: TaskLink): Promise<void> {
    try {
      await this.bridge.openExternal(link.url);
    } catch {
      this.toast.error('Não foi possível abrir o link.');
    }
  }

  protected async copy(link: TaskLink): Promise<void> {
    try {
      await navigator.clipboard.writeText(link.url);
      this.toast.show('Link copiado.', 'info', 2500, 'tick');
    } catch {
      this.toast.error('Não foi possível copiar o link.');
    }
  }

  protected async remove(link: TaskLink): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Remover link?',
      message: `"${linkLabel(link)}" será removido da tarefa.`,
      confirmLabel: 'Remover',
      danger: true,
    });
    if (!confirmed) return;
    try {
      const { error } = await this.supabase.from('task_links').delete().eq('id', link.id);
      if (error) throw error;
      this.toast.success('Link removido.');
      await this.load(this.taskId());
      this.changed.emit();
    } catch (error) {
      this.toast.error(describeError(error, 'Não foi possível remover o link.'));
    }
  }

  private async load(taskId: string): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from('task_links')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at');
      if (error) throw error;
      this.links.set(data);
      this.count.emit(data.length);
    } catch (error) {
      this.toast.error(describeError(error, 'Não foi possível carregar os links.'));
    }
  }
}
