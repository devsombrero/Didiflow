import { TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { BarChart, type BarChartData, resolveTokens } from './bar-chart';

describe('BarChart colors', () => {
  // jsdom does not resolve var(): emulate the browser's computed color per element.
  const tokens: Record<string, string> = {
    '--t-blue': 'rgb(2, 132, 199)',
    '--t-orange': 'rgb(235, 104, 52)',
    '--t-green': 'rgb(27, 175, 122)',
  };
  beforeEach(() => {
    const original = window.getComputedStyle.bind(window);
    vi.spyOn(window, 'getComputedStyle').mockImplementation((element: Element) => {
      const style = original(element);
      const token = /var\((--[\w-]+)\)/.exec((element as HTMLElement).style?.color ?? '')?.[1];
      return token ? ({ ...style, color: tokens[token] } as CSSStyleDeclaration) : style;
    });
    TestBed.configureTestingModule({ providers: [provideNoopAnimations()] });
  });

  afterEach(() => vi.restoreAllMocks());

  it('resolves each token to its own color', () => {
    // Regression: every series used to get the first color.
    expect(resolveTokens(['--t-blue', '--t-orange', '--t-green'])).toEqual([
      'rgb(2, 132, 199)',
      'rgb(235, 104, 52)',
      'rgb(27, 175, 122)',
    ]);
  });

  function render(data: BarChartData) {
    const fixture = TestBed.createComponent(BarChart);
    fixture.componentRef.setInput('data', data);
    fixture.componentRef.setInput('ariaLabel', 'Teste');
    fixture.detectChanges();
    return fixture.componentInstance as unknown as {
      colors: () => { name: string; value: string }[];
      barColors: () => { name: string; value: string }[];
    };
  }

  it('maps each series to its color, matching the legend', () => {
    const chart = render({
      labels: ['S1', 'S2'],
      series: [
        { label: 'No prazo', values: [1, 2], colorVar: '--t-blue' },
        { label: 'Com atraso', values: [0, 1], colorVar: '--t-orange' },
        { label: 'Sem prazo definido', values: [1, 0], colorVar: '--t-green' },
      ],
    });
    expect(chart.colors()).toEqual([
      { name: 'No prazo', value: 'rgb(2, 132, 199)' },
      { name: 'Com atraso', value: 'rgb(235, 104, 52)' },
      { name: 'Sem prazo definido', value: 'rgb(27, 175, 122)' },
    ]);
  });

  it('colors each bar of a single-series chart by label', () => {
    const chart = render({
      labels: ['Urgente', 'Média'],
      series: [{ label: 'Tarefas', values: [1, 3], colorVar: '--t-blue' }],
      barColorVars: ['--t-orange', '--t-blue'],
    });
    expect(chart.barColors()).toEqual([
      { name: 'Urgente', value: 'rgb(235, 104, 52)' },
      { name: 'Média', value: 'rgb(2, 132, 199)' },
    ]);
  });
});
