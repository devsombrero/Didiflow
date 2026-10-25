import { Component, computed, effect, inject, type OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { BackupFile } from '../../../../electron/ipc/contract';
import { DesktopBridge } from '../../core/platform/desktop-bridge';
import { ProfileService } from '../../core/profile/profile.service';
import { ConfirmService } from '../../shared/confirm/confirm.service';
import { MATERIAL_FORMS, MATERIAL_UI } from '../../shared/material';
import { AppDatePipe } from '../../shared/pipes/app-date.pipe';
import { ToastService } from '../../shared/toast/toast.service';
import { describeError } from '../../shared/utils/errors';
import { formatDateValue } from '../../shared/utils/format-date';
import { UserClock } from '../../core/profile/user-clock';
import {
  type BackupPreview,
  describeRestore,
  formatSize,
  InvalidBackupError,
  parseBackup,
} from './backup-logic';
import { BackupService, type RestoreMode } from './backup.service';

const KIND_LABELS: Record<BackupFile['kind'], string> = {
  auto: 'Automático',
  manual: 'Manual',
  prerestore: 'Antes de restaurar',
};

interface PendingRestore {
  source: string;
  content: string;
  preview: BackupPreview;
}

@Component({
  selector: 'app-backup-page',
  imports: [ReactiveFormsModule, RouterLink, AppDatePipe, MATERIAL_FORMS, MATERIAL_UI],
  templateUrl: './backup-page.html',
  styleUrl: './backup-page.scss',
})
export class BackupPage implements OnInit {
  private readonly backups = inject(BackupService);
  private readonly bridge = inject(DesktopBridge);
  private readonly profile = inject(ProfileService);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);
  private readonly clock = inject(UserClock);

  protected readonly desktop = this.backups.available;
  protected readonly kindLabels = KIND_LABELS;
  protected readonly intervals = [
    { hours: 6, label: 'A cada 6 horas' },
    { hours: 12, label: 'A cada 12 horas' },
    { hours: 24, label: 'Diariamente' },
    { hours: 72, label: 'A cada 3 dias' },
    { hours: 168, label: 'Semanalmente' },
  ];
  protected readonly files = signal<BackupFile[]>([]);
  protected readonly busy = signal<string | null>(null);
  protected readonly pending = signal<PendingRestore | null>(null);
  protected readonly mode = signal<RestoreMode>('merge');
  protected readonly lastAuto = computed(() => this.files().find((f) => f.kind === 'auto') ?? null);
  protected readonly formatSize = formatSize;

  protected readonly settingsForm = inject(NonNullableFormBuilder).group({
    auto_backup_enabled: [true],
    auto_backup_interval_hours: [24, Validators.required],
    backup_retention: [10, [Validators.required, Validators.min(1), Validators.max(100)]],
  });

  constructor() {
    effect(() => {
      const prefs = this.profile.preferences();
      if (prefs && this.settingsForm.pristine) {
        this.settingsForm.reset({
          auto_backup_enabled: prefs.auto_backup_enabled,
          auto_backup_interval_hours: prefs.auto_backup_interval_hours,
          backup_retention: prefs.backup_retention,
        });
      }
    });
  }

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  protected async saveSettings(): Promise<void> {
    if (this.settingsForm.invalid) {
      this.settingsForm.markAllAsTouched();
      return;
    }
    await this.run('settings', async () => {
      await this.profile.updatePreferences(this.settingsForm.getRawValue());
      this.settingsForm.markAsPristine();
      this.toast.success('Preferências de backup salvas.');
    });
  }

  protected async backupNow(): Promise<void> {
    await this.run('create', async () => {
      const file = await this.backups.create('manual');
      this.toast.success(`Backup criado (${formatSize(file.size)}).`);
      await this.refresh();
    });
  }

  protected async openFolder(): Promise<void> {
    await this.run('folder', () => this.backups.openFolder());
  }

  protected async remove(file: BackupFile): Promise<void> {
    const confirmed = await this.confirm.ask({
      title: 'Excluir backup?',
      message: `O arquivo ${file.name} será apagado do disco.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!confirmed) return;
    await this.run(file.name, async () => {
      await this.backups.remove(file.name);
      await this.refresh();
    });
  }

  /** Loads a backup from the local list into the restore preview. */
  protected async prepareLocal(file: BackupFile): Promise<void> {
    await this.run(file.name, async () => {
      const when = formatDateValue(
        file.createdAt,
        this.clock.dateFormat(),
        this.clock.timeZone(),
        true,
      );
      this.preparePreview(
        `backup ${KIND_LABELS[file.kind].toLowerCase()} de ${when}`,
        await this.backups.read(file.name),
      );
    });
  }

  /** Native dialog in the desktop app; the hidden file input in the browser. */
  protected async pickFile(input: HTMLInputElement): Promise<void> {
    if (!this.desktop) {
      input.click();
      return;
    }
    await this.run('pick', async () => {
      const result = await this.bridge.openBackupFile();
      if (!result.canceled && result.content)
        this.preparePreview(result.name ?? 'arquivo', result.content);
    });
  }

  protected async onFileInput(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      this.toast.error('Arquivo muito grande (máximo de 50 MB).');
      return;
    }
    this.preparePreview(file.name, await file.text());
  }

  protected cancelRestore(): void {
    this.pending.set(null);
    this.mode.set('merge');
  }

  protected async restore(): Promise<void> {
    const pending = this.pending();
    if (!pending) return;
    const replace = this.mode() === 'replace';
    const confirmed = await this.confirm.ask({
      title: replace ? 'Substituir todos os seus dados?' : 'Restaurar backup?',
      message: replace
        ? 'Suas tarefas, projetos, registros de tempo e metas atuais serão apagados e substituídos pelo conteúdo do backup. ' +
          (this.desktop
            ? 'Um backup de segurança será criado antes.'
            : 'Faça uma exportação antes, se precisar.')
        : 'Os dados do backup serão mesclados com os atuais; em conflitos, vence a versão mais recente.' +
          (this.desktop ? ' Um backup de segurança será criado antes.' : ''),
      confirmLabel: replace ? 'Substituir' : 'Restaurar',
      danger: replace,
    });
    if (!confirmed) return;

    await this.run('restore', async () => {
      const result = await this.backups.restore(pending.content, this.mode());
      this.toast.success(describeRestore(result));
      this.cancelRestore();
      await this.refresh();
    });
  }

  private preparePreview(source: string, content: string): void {
    try {
      const { preview } = parseBackup(content);
      this.pending.set({ source, content, preview });
    } catch (error) {
      this.toast.error(error instanceof InvalidBackupError ? error.message : 'Arquivo inválido.');
    }
  }

  private async refresh(): Promise<void> {
    try {
      this.files.set(await this.backups.list());
    } catch {
      this.files.set([]);
    }
  }

  private async run(key: string, action: () => Promise<void>): Promise<void> {
    this.busy.set(key);
    try {
      await action();
    } catch (error) {
      console.error('Backup action failed', error);
      this.toast.error(
        (error as { hint?: string }).hint === 'invalid_backup'
          ? 'O backup é inválido ou de uma versão não suportada.'
          : describeError(error, 'Não foi possível concluir a operação de backup.'),
      );
    } finally {
      this.busy.set(null);
    }
  }
}
