import { TestBed } from '@angular/core/testing';
import type { DidiflowApi } from '../../../../electron/ipc/contract';
import { DesktopBridge, DIDIFLOW_API } from './desktop-bridge';

function setup(api: DidiflowApi | null): DesktopBridge {
  TestBed.configureTestingModule({ providers: [{ provide: DIDIFLOW_API, useValue: api }] });
  return TestBed.inject(DesktopBridge);
}

describe('DesktopBridge', () => {
  afterEach(() => vi.restoreAllMocks());

  describe('inside Electron', () => {
    const api: DidiflowApi = {
      platform: 'win32',
      secureStore: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
      openExternal: vi.fn().mockResolvedValue(undefined),
      notify: vi.fn().mockResolvedValue(true),
      onNavigate: vi.fn(() => () => undefined),
    };

    it('exposes the secure store and desktop flag', () => {
      const bridge = setup(api);
      expect(bridge.isDesktop).toBe(true);
      expect(bridge.secureStore).toBe(api.secureStore);
    });

    it('delegates openExternal to the preload API', async () => {
      const bridge = setup(api);
      await bridge.openExternal('https://example.atlassian.net/browse/DF-1');
      expect(api.openExternal).toHaveBeenCalledWith('https://example.atlassian.net/browse/DF-1');
    });

    it('delegates notifications', async () => {
      const bridge = setup(api);
      await expect(bridge.notify({ title: 'Oi' })).resolves.toBe(true);
      expect(api.notify).toHaveBeenCalledWith({ title: 'Oi' });
    });
  });

  describe('in a plain browser', () => {
    it('does not show notifications', async () => {
      await expect(setup(null).notify({ title: 'Oi' })).resolves.toBe(false);
    });

    it('has no secure store', () => {
      const bridge = setup(null);
      expect(bridge.isDesktop).toBe(false);
      expect(bridge.secureStore).toBeNull();
    });

    it('opens https links in a new tab without opener', async () => {
      const open = vi.spyOn(window, 'open').mockReturnValue(null);
      await setup(null).openExternal('https://slack.com/archives/C1/p1');
      expect(open).toHaveBeenCalledWith(
        'https://slack.com/archives/C1/p1',
        '_blank',
        'noopener,noreferrer',
      );
    });

    it('rejects non-https links', async () => {
      const open = vi.spyOn(window, 'open');
      await expect(setup(null).openExternal('javascript:alert(1)')).rejects.toThrow();
      expect(open).not.toHaveBeenCalled();
    });
  });
});
