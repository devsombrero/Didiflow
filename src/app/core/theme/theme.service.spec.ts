import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  const root = document.documentElement;

  afterEach(() => root.removeAttribute('data-theme'));

  it('forces light or dark through data-theme', () => {
    const theme = TestBed.inject(ThemeService);
    theme.apply('dark');
    expect(root.getAttribute('data-theme')).toBe('dark');
    theme.apply('light');
    expect(root.getAttribute('data-theme')).toBe('light');
  });

  it('removes the override to follow the OS', () => {
    const theme = TestBed.inject(ThemeService);
    theme.apply('dark');
    theme.apply('system');
    expect(root.hasAttribute('data-theme')).toBe(false);
  });
});
