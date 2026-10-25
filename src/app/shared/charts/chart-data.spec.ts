import { barPadding, formatTick, integerTicks, maxValue, toChartResults } from './chart-data';

describe('toChartResults', () => {
  const data = {
    labels: ['Jan', 'Fev'],
    series: [
      { label: 'No prazo', values: [3, 1], colorVar: '--series-1' },
      { label: 'Com atraso', values: [0, 2], colorVar: '--series-2' },
    ],
  };

  it('returns name/value points for a single series', () => {
    expect(toChartResults({ ...data, series: [data.series[0]] }, false)).toEqual([
      { name: 'Jan', value: 3 },
      { name: 'Fev', value: 1 },
    ]);
  });

  it('groups values by label for multi-series charts', () => {
    expect(toChartResults(data, true)).toEqual([
      {
        name: 'Jan',
        series: [
          { name: 'No prazo', value: 3 },
          { name: 'Com atraso', value: 0 },
        ],
      },
      {
        name: 'Fev',
        series: [
          { name: 'No prazo', value: 1 },
          { name: 'Com atraso', value: 2 },
        ],
      },
    ]);
  });

  it('fills missing values with zero', () => {
    expect(toChartResults({ labels: ['A'], series: [] }, false)).toEqual([{ name: 'A', value: 0 }]);
  });
});

describe('chart scale helpers', () => {
  const data = {
    labels: ['A', 'B'],
    series: [
      { label: 'x', values: [3, 1], colorVar: '--series-1' },
      { label: 'y', values: [4, 2], colorVar: '--series-2' },
    ],
  };

  it('uses the tallest stack when stacked and the tallest bar otherwise', () => {
    expect(maxValue(data, true)).toBe(7);
    expect(maxValue(data, false)).toBe(4);
  });

  it('builds whole-number ticks covering the maximum', () => {
    expect(integerTicks(2)).toEqual([0, 1, 2]);
    expect(integerTicks(0)).toEqual([0, 1]);
    expect(integerTicks(40)).toEqual([0, 8, 16, 24, 32, 40]);
    expect(integerTicks(7).at(-1)).toBeGreaterThanOrEqual(7);
  });

  it('formats ticks as whole numbers', () => {
    expect(formatTick(4)).toBe('4');
    expect(formatTick(2.0000001)).toBe('2');
  });

  it('keeps bars thin with a minimum gap', () => {
    expect(barPadding(1000, 5)).toBe(208);
    expect(barPadding(100, 10)).toBe(1);
    expect(barPadding(0, 3)).toBe(8);
  });
});
