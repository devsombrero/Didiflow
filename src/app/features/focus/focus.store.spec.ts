import { TestBed } from '@angular/core/testing';
import { DesktopBridge } from '../../core/platform/desktop-bridge';
import { AppNotifier } from '../notifications/notification-center';
import { FocusService, FocusStore } from './focus.service';

describe('FocusStore', () => {
  afterEach(() => vi.useRealTimers());

  function setup() {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-25T12:00:00Z'));
    const service = {
      startSession: vi.fn().mockResolvedValue({ id: 's1', started_at: '2026-10-25T12:00:00.000Z' }),
      endSession: vi.fn().mockResolvedValue(undefined),
      logTime: vi.fn().mockResolvedValue(undefined),
    };
    const notify = vi.fn().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        { provide: FocusService, useValue: service },
        { provide: DesktopBridge, useValue: {} },
        { provide: AppNotifier, useValue: { notify } },
      ],
    });
    return { store: TestBed.inject(FocusStore), service, notify };
  }

  it('completes automatically when the countdown ends', async () => {
    const { store, service, notify } = setup();
    await store.start({
      taskId: 't1',
      taskTitle: 'Contrato',
      minutes: 1,
      record: true,
      logTime: true,
    });
    expect(store.remaining()).toBe(60);

    await vi.advanceTimersByTimeAsync(61_000);

    expect(store.active()).toBeNull();
    expect(service.endSession).toHaveBeenCalledWith('s1', true, '2026-10-25T12:01:00.000Z');
    expect(service.logTime).toHaveBeenCalledWith(
      't1',
      '2026-10-25T12:00:00.000Z',
      '2026-10-25T12:01:00.000Z',
    );
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Sessão de foco concluída' }),
    );
    expect(store.finished()).toEqual({ taskTitle: 'Contrato', completed: true });
  });

  it('keeps unrecorded sessions local and skips logging spans under a minute', async () => {
    const { store, service, notify } = setup();
    await store.start({ taskId: null, taskTitle: null, minutes: 25, record: false, logTime: true });
    await vi.advanceTimersByTimeAsync(30_000);
    await store.finish(false);

    expect(service.startSession).not.toHaveBeenCalled();
    expect(service.endSession).not.toHaveBeenCalled();
    expect(service.logTime).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(store.finished()).toEqual({ taskTitle: null, completed: false });
  });
});
