import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideSupabaseMock } from '../../../testing/supabase.mock';
import { DashboardPage } from './dashboard-page';
import { DashboardService } from './dashboard.service';
import type { MetricTask } from './metrics';

describe('DashboardPage', () => {
  async function setup(tasks: Partial<MetricTask>[]) {
    // Canvas is not implemented in jsdom; charts are covered by metrics specs.
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await TestBed.configureTestingModule({
      imports: [DashboardPage],
      providers: [
        provideRouter([]),
        provideSupabaseMock(),
        { provide: DashboardService, useValue: { metricTasks: vi.fn().mockResolvedValue(tasks) } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(DashboardPage);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => vi.restoreAllMocks());

  it('guides new accounts instead of showing empty metrics', async () => {
    const element = await setup([]);
    expect(element.textContent).toContain('Comece cadastrando suas demandas');
    expect(element.querySelector('.tiles')).toBeNull();
  });

  it('shows tiles computed from real tasks', async () => {
    const element = await setup([
      {
        status: 'in_progress',
        priority: 'high',
        progress_percentage: 40,
        due_date: '2000-01-01',
        completed_at: null,
        archived_at: null,
        category_id: null,
      },
    ]);
    const tiles = element.querySelector('.tiles')?.textContent ?? '';
    expect(tiles).toContain('Abertas1');
    expect(tiles).toMatch(/Atrasadas\s*⚠\s*1/);
    expect(tiles).toContain('Sem registros de tempo');
  });
});
