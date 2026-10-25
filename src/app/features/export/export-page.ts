import { Component, inject, signal } from '@angular/core';
import { MATERIAL_FORMS, MATERIAL_UI } from '../../shared/material';
import { RouterLink } from '@angular/router';
import { DesktopBridge } from '../../core/platform/desktop-bridge';
import { ToastService } from '../../shared/toast/toast.service';
import { describeError } from '../../shared/utils/errors';
import { PERIOD_PRESETS, type PeriodPreset } from '../dashboard/metrics';
import { type Dataset, type ExportFormat, ExportService } from './export.service';

interface DatasetOption {
  id: Dataset;
  icon: string;
  title: string;
  description: string;
  formats: ExportFormat[];
}

const DATASETS: DatasetOption[] = [
  {
    id: 'tasks',
    icon: 'checklist',
    title: 'Tarefas',
    description: 'Todas as tarefas não excluídas, com projeto, categoria, contexto e tags.',
    formats: ['csv', 'json'],
  },
  {
    id: 'organization',
    icon: 'folder_open',
    title: 'Projetos e organização',
    description: 'Projetos, categorias, tags e contextos de trabalho.',
    formats: ['csv', 'json'],
  },
  {
    id: 'time',
    icon: 'schedule',
    title: 'Registros de tempo',
    description: 'Apontamentos manuais e de cronômetro, no seu fuso horário.',
    formats: ['csv', 'json'],
  },
  {
    id: 'kpis',
    icon: 'monitoring',
    title: 'Indicadores (KPIs)',
    description: 'Valores, fórmulas e estados de dados insuficientes do período escolhido.',
    formats: ['csv', 'json'],
  },
  {
    id: 'backup',
    icon: 'backup',
    title: 'Cópia completa (JSON)',
    description: 'Todas as suas tabelas em um único arquivo, para guardar ou migrar.',
    formats: ['json'],
  },
];

@Component({
  selector: 'app-export-page',
  imports: [RouterLink, MATERIAL_FORMS, MATERIAL_UI],
  template: `
    <header class="page-header">
      <h1>Exportar dados</h1>
      <a matButton="outlined" routerLink="/settings"><mat-icon>settings</mat-icon> Configurações</a>
    </header>
    <p class="muted">
      As exportações incluem apenas os seus dados. Elas não substituem os backups do banco de dados
      (veja <code>docs/backup-restore.md</code>).
    </p>

    <mat-card appearance="outlined" class="exports">
      <mat-card-content>
        @for (dataset of datasets; track dataset.id) {
          <article class="export">
            <mat-icon class="export__icon">{{ dataset.icon }}</mat-icon>
            <div class="export__info">
              <h2>{{ dataset.title }}</h2>
              <p class="muted">{{ dataset.description }}</p>
              @if (dataset.id === 'kpis') {
                <mat-form-field class="period">
                  <mat-label>Período dos KPIs</mat-label>
                  <mat-select [value]="preset()" (selectionChange)="preset.set($event.value)">
                    @for (option of presets; track option.value) {
                      <mat-option [value]="option.value">{{ option.label }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>
              }
            </div>
            <div class="actions">
              @for (format of dataset.formats; track format) {
                <button
                  matButton="outlined"
                  type="button"
                  [disabled]="busy() !== null"
                  (click)="export(dataset.id, format)"
                >
                  <mat-icon>{{
                    busy() === dataset.id + format ? 'hourglass_top' : 'download'
                  }}</mat-icon>
                  {{ busy() === dataset.id + format ? 'Gerando…' : format.toUpperCase() }}
                </button>
              }
            </div>
          </article>
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    .exports {
      max-width: 960px;
    }
    .export {
      display: flex;
      align-items: center;
      gap: var(--space-4);
      padding: var(--space-4) 0;
      border-bottom: 1px solid var(--mat-sys-outline-variant);
    }
    .export:last-child {
      border-bottom: 0;
    }
    .export__icon {
      color: var(--mat-sys-primary);
    }
    .export__info {
      flex: 1;
    }
    .export h2 {
      margin: 0 0 var(--space-1);
    }
    .export p {
      margin: 0;
    }
    .period {
      width: 220px;
      margin-top: var(--space-2);
    }
  `,
})
export class ExportPage {
  private readonly exporter = inject(ExportService);
  private readonly bridge = inject(DesktopBridge);
  private readonly toast = inject(ToastService);

  protected readonly datasets = DATASETS;
  protected readonly presets = PERIOD_PRESETS;
  protected readonly preset = signal<PeriodPreset>('30d');
  protected readonly busy = signal<string | null>(null);

  protected async export(dataset: Dataset, format: ExportFormat): Promise<void> {
    this.busy.set(dataset + format);
    try {
      const file = await this.exporter.build(dataset, format, this.preset());
      const result = await this.bridge.saveFile({
        defaultName: file.name,
        content: file.content,
        kind: file.kind,
      });
      if (result.saved)
        this.toast.success(result.path ? `Arquivo salvo em ${result.path}` : 'Arquivo gerado.');
    } catch (error) {
      console.error('Export failed', error);
      this.toast.error(describeError(error, 'Não foi possível exportar.'));
    } finally {
      this.busy.set(null);
    }
  }
}
