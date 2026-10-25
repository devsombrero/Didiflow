import {
  afterNextRender,
  Component,
  DestroyRef,
  effect,
  type ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import {
  BarController,
  BarElement,
  CategoryScale,
  Chart,
  type ChartConfiguration,
  Legend,
  LinearScale,
  Tooltip,
} from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

export interface BarSeries {
  label: string;
  values: number[];
  /** CSS custom property holding the series color, e.g. '--series-1'. */
  colorVar: string;
}

export interface BarChartData {
  labels: string[];
  series: BarSeries[];
}

/**
 * Thin-bar chart following the dataviz guidelines: recessive grid, rounded
 * data ends, hover tooltips, a legend only for 2+ series and a data table
 * for screen readers. Colors come from CSS tokens and follow the theme.
 */
@Component({
  selector: 'app-bar-chart',
  template: `
    <div class="chart" [style.height.px]="height()">
      <canvas #canvas role="img" [attr.aria-label]="ariaLabel()"></canvas>
    </div>
    <details class="chart__table">
      <summary>Ver dados em tabela</summary>
      <table>
        <thead>
          <tr>
            <th scope="col">{{ categoryLabel() }}</th>
            @for (series of data().series; track series.label) {
              <th scope="col">{{ series.label }}</th>
            }
          </tr>
        </thead>
        <tbody>
          @for (label of data().labels; track $index; let i = $index) {
            <tr>
              <th scope="row">{{ label }}</th>
              @for (series of data().series; track series.label) {
                <td>{{ series.values[i] }}</td>
              }
            </tr>
          }
        </tbody>
      </table>
    </details>
  `,
  styles: `
    .chart {
      position: relative;
    }
    .chart__table {
      margin-top: var(--space-2);
      font-size: 12px;
      color: var(--color-text-muted);
    }
    .chart__table table {
      border-collapse: collapse;
      margin-top: var(--space-2);
      font-variant-numeric: tabular-nums;
    }
    .chart__table th,
    .chart__table td {
      padding: 2px var(--space-3);
      border-bottom: 1px solid var(--color-border);
      text-align: left;
    }
  `,
})
export class BarChart {
  readonly data = input.required<BarChartData>();
  readonly ariaLabel = input.required<string>();
  readonly categoryLabel = input('Categoria');
  readonly horizontal = input(false);
  readonly stacked = input(false);
  readonly height = input(220);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly themeVersion = signal(0);
  private chart: Chart<'bar'> | null = null;

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      // Re-read tokens when the theme changes (app setting or OS preference).
      const observer = new MutationObserver(() => this.themeVersion.update((v) => v + 1));
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
      });
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const onMedia = () => this.themeVersion.update((v) => v + 1);
      media.addEventListener('change', onMedia);
      destroyRef.onDestroy(() => {
        observer.disconnect();
        media.removeEventListener('change', onMedia);
      });
    });

    effect(() => {
      const config = this.buildConfig();
      if (this.chart) {
        this.chart.data = config.data;
        this.chart.options = config.options ?? {};
        this.chart.update();
      } else {
        this.chart = new Chart(this.canvas().nativeElement, config);
      }
    });

    destroyRef.onDestroy(() => this.chart?.destroy());
  }

  private buildConfig(): ChartConfiguration<'bar'> {
    this.themeVersion();
    const styles = getComputedStyle(document.documentElement);
    const token = (name: string) => styles.getPropertyValue(name).trim();
    const surface = token('--color-surface');
    const muted = token('--chart-ink-muted');
    const grid = token('--chart-grid');
    const axis = token('--chart-axis');
    const { labels, series } = this.data();
    const horizontal = this.horizontal();
    const stacked = this.stacked();

    const valueAxis = {
      beginAtZero: true,
      stacked,
      grid: { color: grid },
      border: { display: false },
      ticks: { color: muted, precision: 0 },
    };
    const categoryAxis = {
      stacked,
      grid: { display: false },
      border: { color: axis },
      ticks: { color: muted },
    };

    return {
      type: 'bar',
      data: {
        labels,
        datasets: series.map((s) => ({
          label: s.label,
          data: s.values,
          backgroundColor: token(s.colorVar),
          hoverBackgroundColor: token(s.colorVar),
          borderRadius: 4,
          borderSkipped: 'start',
          // 2px surface gap between stacked segments.
          borderColor: surface,
          borderWidth: stacked ? (horizontal ? { right: 2 } : { top: 2 }) : 0,
          maxBarThickness: 24,
        })),
      },
      options: {
        indexAxis: horizontal ? 'y' : 'x',
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: { mode: 'index', intersect: false },
        scales: horizontal ? { x: valueAxis, y: categoryAxis } : { x: categoryAxis, y: valueAxis },
        plugins: {
          legend: {
            display: series.length > 1,
            position: 'top',
            align: 'start',
            labels: { color: muted, boxWidth: 10, boxHeight: 10, usePointStyle: true },
          },
          tooltip: { mode: 'index', intersect: false },
        },
      },
    };
  }
}
