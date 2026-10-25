import type { BarChartData } from './bar-chart';

export interface ChartPoint {
  name: string;
  value: number;
}

export interface ChartGroup {
  name: string;
  series: ChartPoint[];
}

/**
 * Converts the app's chart data (labels + series) into ngx-charts results:
 * a flat list for a single series, or one group per label for multi-series
 * (stacked or grouped) charts.
 */
export function toChartResults(data: BarChartData, multi: boolean): ChartPoint[] | ChartGroup[] {
  if (!multi) {
    const values = data.series[0]?.values ?? [];
    return data.labels.map((name, i) => ({ name, value: values[i] ?? 0 }));
  }
  return data.labels.map((name, i) => ({
    name,
    series: data.series.map((s) => ({ name: s.label, value: s.values[i] ?? 0 })),
  }));
}

/** Largest value on the value axis: the tallest stack, or the tallest bar. */
export function maxValue(data: BarChartData, stacked: boolean): number {
  let max = 0;
  data.labels.forEach((_, i) => {
    const values = data.series.map((s) => s.values[i] ?? 0);
    max = Math.max(max, stacked ? values.reduce((a, b) => a + b, 0) : Math.max(0, ...values));
  });
  return max;
}

/** Whole-number ticks (counts never show 0.5) with at most ~6 steps. */
export function integerTicks(max: number): number[] {
  const top = Math.max(1, Math.ceil(max));
  const step = Math.max(1, Math.ceil(top / 5));
  const ticks: number[] = [];
  for (let value = 0; value <= top + step - 1; value += step) ticks.push(value);
  return ticks;
}

/**
 * Pixel padding that keeps bars at most `maxBar` wide. ngx-charts turns the
 * padding into a band scale inner padding of `count / (size / padding + 1)`,
 * so this inverts that formula for the wanted fraction.
 */
export function barPadding(size: number, count: number, barsPerCategory = 1, maxBar = 28): number {
  if (count <= 0 || size <= 0) return 8;
  const step = size / count;
  const fraction = Math.min(0.9, Math.max(0.1, 1 - (maxBar * barsPerCategory) / step));
  return Math.max(1, Math.round(size / (count / fraction - 1)));
}

/** Axis labels for counts: whole numbers only. */
export function formatTick(value: number): string {
  return String(Math.round(value));
}
