import { Component, effect, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ProfileService } from './core/profile/profile.service';
import { ThemeService } from './core/theme/theme.service';
import { ToastContainer } from './shared/toast/toast-container';

@Component({
  imports: [RouterOutlet, ToastContainer],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  constructor() {
    const theme = inject(ThemeService);
    const preferences = inject(ProfileService).preferences;
    effect(() => theme.apply(preferences()?.theme ?? 'system'));
  }
}
