import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  type ElementRef,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { BarChartModule, type Color, ScaleType } from '@swimlane/ngx-charts';
import { barPadding, formatTick, integerTicks, maxValue, toChartResults } from './chart-data';

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

/** Space taken by the axes, subtracted when sizing the bars. */
const AXIS_WIDTH = 80;
const AXIS_HEIGHT = 40;

/**
 * Thin-bar chart (ngx-charts) following the dataviz guidelines: recessive
 * grid, rounded data ends, whole-number ticks, hover tooltips, a legend only
 * for 2+ series and a data table for screen readers. Colors come from CSS
 * tokens and follow the theme.
 */
@Component({
  selector: 'app-bar-chart',
  imports: [BarChartModule],
  template: `
    @if (data().series.length > 1) {
      <ul class="legend" aria-hidden="true">
        @for (series of data().series; track series.label) {
          <li>
            <span class="legend__dot" [style.background]="'var(' + series.colorVar + ')'"></span>
            {{ series.label }}
          </li>
        }
      </ul>
    }
    <div
      #box
      class="chart"
      role="img"
      [class.chart--stacked]="stacked()"
      [class.chart--vertical]="!horizontal()"
      [attr.aria-label]="ariaLabel()"
      [style.height.px]="height()"
    >
      @let results = chart();
      @if (multi()) {
        @if (horizontal()) {
          @if (stacked()) {
            <ngx-charts-bar-horizontal-stacked
              [results]="results"
              [customColors]="colors()"
              [scheme]="scheme()"
              [xAxis]="true"
              [yAxis]="true"
              [showGridLines]="true"
              [xAxisTicks]="ticks()"
              [xAxisTickFormatting]="formatTick"
              [xScaleMax]="scaleMax()"
              [barPadding]="padding()"
              [animations]="animations"
              [noBarWhenZero]="true"
            />
          } @else {
            <ngx-charts-bar-horizontal-2d
              [results]="results"
              [customColors]="colors()"
              [scheme]="scheme()"
              [xAxis]="true"
              [yAxis]="true"
              [xAxisTicks]="ticks()"
              [xAxisTickFormatting]="formatTick"
              [xScaleMax]="scaleMax()"
              [roundEdges]="true"
              [groupPadding]="padding()"
              [barPadding]="2"
              [animations]="animations"
              [noBarWhenZero]="true"
            />
          }
        } @else if (stacked()) {
          <ngx-charts-bar-vertical-stacked
            [results]="results"
            [customColors]="colors()"
            [scheme]="scheme()"
            [xAxis]="true"
            [yAxis]="true"
            [showGridLines]="true"
            [yAxisTicks]="ticks()"
            [yAxisTickFormatting]="formatTick"
            [yScaleMax]="scaleMax()"
            [barPadding]="padding()"
            [animations]="animations"
            [noBarWhenZero]="true"
          />
        } @else {
          <ngx-charts-bar-vertical-2d
            [results]="results"
            [customColors]="colors()"
            [scheme]="scheme()"
            [xAxis]="true"
            [yAxis]="true"
            [yAxisTicks]="ticks()"
            [yAxisTickFormatting]="formatTick"
            [yScaleMax]="scaleMax()"
            [roundEdges]="true"
            [groupPadding]="padding()"
            [barPadding]="2"
            [animations]="animations"
            [noBarWhenZero]="true"
          />
        }
      } @else if (horizontal()) {
        <ngx-charts-bar-horizontal
          [results]="results"
          [scheme]="scheme()"
          [xAxis]="true"
          [yAxis]="true"
          [showGridLines]="true"
          [xAxisTicks]="ticks()"
          [xAxisTickFormatting]="formatTick"
          [xScaleMax]="scaleMax()"
          [roundEdges]="true"
          [barPadding]="padding()"
          [showDataLabel]="true"
          [animations]="animations"
          [noBarWhenZero]="true"
        />
      } @else {
        <ngx-charts-bar-vertical
          [results]="results"
          [scheme]="scheme()"
          [xAxis]="true"
          [yAxis]="true"
          [showGridLines]="true"
          [yAxisTicks]="ticks()"
          [yAxisTickFormatting]="formatTick"
          [yScaleMax]="scaleMax()"
          [roundEdges]="true"
          [barPadding]="padding()"
          [animations]="animations"
          [noBarWhenZero]="true"
        />
      }
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
    :host {
      display: block;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1) var(--space-4);
      margin: 0 0 var(--space-2);
      padding: 0;
      list-style: none;
      font-size: 12px;
      color: var(--color-text-muted);
    }
    .legend li {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .legend__dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
    }
    .chart {
      position: relative;
      width: 100%;
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

  /** Bars grow in on first render unless the user prefers reduced motion. */
  protected readonly animations = !prefersReducedMotion();

  private readonly box = viewChild.required<ElementRef<HTMLElement>>('box');
  private readonly width = signal(0);
  private readonly themeVersion = signal(0);

  protected readonly multi = computed(() => this.data().series.length > 1 || this.stacked());
  protected readonly chart = computed(() => toChartResults(this.data(), this.multi()));

  protected readonly ticks = computed(() => integerTicks(maxValue(this.data(), this.stacked())));
  protected readonly formatTick = formatTick;
  protected readonly scaleMax = computed(() => this.ticks().at(-1) ?? 1);

  /** Keeps bars thin whatever the container size. */
  protected readonly padding = computed(() => {
    const plot = this.horizontal() ? this.height() - AXIS_HEIGHT : this.width() - AXIS_WIDTH;
    const perCategory = this.multi() && !this.stacked() ? this.data().series.length : 1;
    return barPadding(plot, this.data().labels.length, perCategory, this.horizontal() ? 20 : 28);
  });

  /** Series colors resolved from CSS tokens (SVG attributes cannot use var()). */
  private readonly resolved = computed(() => {
    this.themeVersion();
    return resolveTokens(this.data().series.map((s) => s.colorVar));
  });

  protected readonly scheme = computed<Color>(() => ({
    name: 'didiflow',
    selectable: false,
    group: ScaleType.Ordinal,
    domain: this.resolved(),
  }));

  protected readonly colors = computed(() =>
    this.data().series.map((s, i) => ({ name: s.label, value: this.resolved()[i] })),
  );

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const box = this.box().nativeElement;
      this.width.set(box.clientWidth);
      const resize =
        typeof ResizeObserver === 'function'
          ? new ResizeObserver(([entry]) => this.width.set(entry.contentRect.width))
          : null;
      resize?.observe(box);

      // Re-read tokens when the theme changes (app setting or OS preference).
      const bump = () => this.themeVersion.update((v) => v + 1);
      const observer = new MutationObserver(bump);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme'],
      });
      const media =
        typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
      media?.addEventListener('change', bump);
      destroyRef.onDestroy(() => {
        resize?.disconnect();
        observer.disconnect();
        media?.removeEventListener('change', bump);
      });
    });
  }
}

/**
 * Resolves CSS tokens (possibly light-dark() expressions) to concrete colors
 * through a probe element.
 */
function resolveTokens(names: string[]): string[] {
  const probe = document.createElement('span');
  document.body.appendChild(probe);
  const colors = names.map((name) => {
    probe.style.color = `var(${name})`;
    return getComputedStyle(probe).color;
  });
  probe.remove();
  return colors;
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}
