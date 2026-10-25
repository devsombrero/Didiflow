import { DOCUMENT, inject, Injectable } from '@angular/core';
import type { Enums } from '../supabase/database.types';

export type ThemePreference = Enums<'theme_preference'>;

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly root = inject(DOCUMENT).documentElement;

  /** 'system' follows the OS via prefers-color-scheme (see styles.scss). */
  apply(theme: ThemePreference): void {
    if (theme === 'system') {
      this.root.removeAttribute('data-theme');
    } else {
      this.root.setAttribute('data-theme', theme);
    }
  }
}
