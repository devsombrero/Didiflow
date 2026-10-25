import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import type { AttachmentUsage } from '../../../../electron/ipc/contract';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { MATERIAL_UI } from '../../shared/material';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { ToastService } from '../../shared/toast/toast.service';
import { describeError } from '../../shared/utils/errors';
import {
  addFailureMessage,
  fileIcon,
  formatBytes,
  MAX_TASK_ATTACHMENT_BYTES,
  usedBytes,
} from './attachment-logic';
import { AttachmentsService, type TaskAttachment } from './attachments.service';

/** Attachments of one task: quota bar, list, add, open and remove. */
@Component({
  selector: 'app-task-attachments-panel',
  imports: [AppDatePipe, MATERIAL_UI],
  template: `
    <div class="quota">
      <div class="quota__text">
        <span>{{ formatBytes(used()) }} de 50 MB usados</span>
        @if (usage(); as disk) {
          <span class="muted">{{ formatBytes(disk.freeBytes) }} livres no disco</span>
        }
      </div>
      <mat-progress-bar
        mode="determinate"
        [value]="percent()"
        [class.quota--full]="percent() >= 90"
        aria-label="Uso da cota de anexos da tarefa"
      />
    </div>

    <ul class="files" aria-label="Anexos">
      @for (file of attachments(); track file.id) {
        @let missing = present()[file.id] === false;
        <li class="files__item" [class.files__item--missing]="missing">
          <mat-icon class="files__icon">{{ icon(file) }}</mat-icon>
          <span class="files__info">
            <button
              type="button"
              class="files__name"
              [disabled]="!available || missing"
              (click)="open(file)"
              [attr.aria-label]="'Abrir ' + file.file_name"
            >
              {{ file.file_name }}
            </button>
            <span class="muted">
              {{ formatBytes(file.size_bytes) }} · {{ file.created_at | appDate: true }}
              @if (missing) {
                · <span class="files__missing">arquivo não está neste computador</span>
              }
            </span>
          </span>
          <button
            matIconButton
            type="button"
            [matMenuTriggerFor]="menu"
            [attr.aria-label]="'Ações de ' + file.file_name"
          >
            <mat-icon>more_vert</mat-icon>
          </button>
          <mat-menu #menu="matMenu">
            <button
              mat-menu-item
              type="button"
              [disabled]="!available || missing"
              (click)="open(file)"
            >
              <mat-icon>open_in_new</mat-icon>Abrir
            </button>
            <button
              mat-menu-item
              type="button"
              [disabled]="!available || missing"
              (click)="reveal(file)"
            >
              <mat-icon>folder_open</mat-icon>Mostrar na pasta
            </button>
            <button
              mat-menu-item
              type="button"
              [disabled]="!available || missing"
              (click)="saveAs(file)"
            >
              <mat-icon>download</mat-icon>Salvar uma cópia…
            </button>
            <button mat-menu-item type="button" (click)="remove(file)">
              <mat-icon>delete</mat-icon>Remover
            </button>
          </mat-menu>
        </li>
      } @empty {
        <li class="muted files__empty">Nenhum anexo.</li>
      }
    </ul>

    @if (available) {
      <button
        matButton="tonal"
        type="button"
        (click)="add()"
        [disabled]="busy() || used() >= maxBytes"
      >
        <mat-icon>attach_file</mat-icon> Anexar arquivos
      </button>
      <p class="hint">
        Até 50 MB por tarefa. Os arquivos ficam neste computador, na pasta de dados do DidiFlow.
      </p>
    } @else {
      <p class="hint">Anexar e abrir arquivos está disponível no aplicativo desktop.</p>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      align-items: flex-start;
    }
    .quota {
      width: 100%;
    }
    .quota__text {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: var(--space-2);
      margin-bottom: var(--space-1);
      font-size: 12px;
    }
    .quota--full {
      --mat-progress-bar-active-indicator-color: var(--mat-sys-error);
    }
    .files {
      width: 100%;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .files__item {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-2) 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
      animation: file-in 220ms ease-out;
    }
    .files__item--missing .files__icon {
      color: var(--mat-sys-outline);
    }
    .files__icon {
      color: var(--mat-sys-primary);
    }
    .files__info {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      font-size: 12px;
    }
    .files__name {
      all: unset;
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface);
      cursor: pointer;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .files__name:not(:disabled):hover,
    .files__name:focus-visible {
      color: var(--mat-sys-primary);
      text-decoration: underline;
    }
    .files__name:disabled {
      cursor: default;
    }
    .files__missing {
      color: var(--mat-sys-error);
    }
    .files__empty {
      padding: var(--space-2) 0;
    }
    .muted {
      color: var(--color-text-muted);
    }
    .hint {
      margin: 0;
      font-size: 12px;
      color: var(--color-text-muted);
    }
    @keyframes file-in {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .files__item {
        animation: none;
      }
    }
  `,
})
export class TaskAttachmentsPanel {
  private readonly service = inject(AttachmentsService);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);

  readonly taskId = input.required<string>();
  /** Emitted after files are added or removed (the activity feed reloads). */
  readonly changed = output<void>();

  protected readonly available = this.service.available;
  protected readonly maxBytes = MAX_TASK_ATTACHMENT_BYTES;
  protected readonly attachments = signal<TaskAttachment[]>([]);
  protected readonly present = signal<Record<string, boolean>>({});
  protected readonly usage = signal<AttachmentUsage | null>(null);
  protected readonly busy = signal(false);
  protected readonly used = computed(() => usedBytes(this.attachments()));
  protected readonly percent = computed(() =>
    Math.min(100, Math.round((this.used() / MAX_TASK_ATTACHMENT_BYTES) * 100)),
  );
  protected readonly formatBytes = formatBytes;

  constructor() {
    effect(() => {
      const id = this.taskId();
      untracked(() => void this.load(id));
    });
  }

  protected icon(file: TaskAttachment): string {
    return fileIcon(file.mime_type);
  }

  protected async add(): Promise<void> {
    this.busy.set(true);
    try {
      const result = await this.service.add(this.taskId(), this.attachments());
      const failure = addFailureMessage(result);
      if (failure) this.toast.error(failure);
      if (result.status === 'added') {
        const count = result.files.length;
        this.toast.success(count === 1 ? 'Arquivo anexado.' : `${count} arquivos anexados.`);
        await this.load(this.taskId());
        this.changed.emit();
      }
    } catch (error) {
      this.toast.error(describeError(error, 'Não foi possível anexar os arquivos.'));
    } finally {
      this.busy.set(false);
    }
  }

  protected async open(file: TaskAttachment): Promise<void> {
    try {
      const outcome = await this.service.open(file);
      if (outcome === 'revealed') {
        this.toast.show(
          'Arquivos executáveis não são abertos direto: mostramos o arquivo na pasta.',
        );
      } else if (outcome === 'missing') {
        this.toast.error('O arquivo não está neste computador.');
      }
    } catch (error) {
      this.toast.error(describeError(error, 'Não foi possível abrir o arquivo.'));
    }
  }

  protected async reveal(file: TaskAttachment): Promise<void> {
    if (!(await this.service.reveal(file).catch(() => false))) {
      this.toast.error('O arquivo não está neste computador.');
    }
  }

  protected async saveAs(file: TaskAttachment): Promise<void> {
    try {
      if (await this.service.saveAs(file)) this.toast.success('Cópia salva.');
    } catch (error) {
      this.toast.error(describeError(error, 'Não foi possível salvar a cópia.'));
    }
  }

  protected async remove(file: TaskAttachment): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Remover anexo',
      message: `Remover "${file.file_name}"? O arquivo também é apagado deste computador.`,
      confirmLabel: 'Remover',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await this.service.remove(file);
      this.toast.success('Anexo removido.');
      await this.load(this.taskId());
      this.changed.emit();
    } catch (error) {
      this.toast.error(describeError(error, 'Não foi possível remover o anexo.'));
    }
  }

  private async load(taskId: string): Promise<void> {
    try {
      const rows = await this.service.list(taskId);
      this.attachments.set(rows);
      const [present, usage] = await Promise.all([
        this.service.presence(taskId, rows),
        this.service.usage().catch(() => null),
      ]);
      this.present.set(present);
      this.usage.set(usage);
    } catch (error) {
      this.toast.error(describeError(error, 'Não foi possível carregar os anexos.'));
    }
  }
}
