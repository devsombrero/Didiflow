import { Component, DestroyRef, effect, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { MotionService } from './core/feedback/motion.service';
import { DesktopBridge } from './core/platform/desktop-bridge';
import { ProfileService } from './core/profile/profile.service';
import { ThemeService } from './core/theme/theme.service';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  constructor() {
    const theme = inject(ThemeService);
    // Applies the animation preference to the document root.
    inject(MotionService);
    const preferences = inject(ProfileService).preferences;
    effect(() => theme.apply(preferences()?.theme ?? 'system'));

    // Notification clicks ask the renderer to open an in-app route.
    const router = inject(Router);
    const unsubscribe = inject(DesktopBridge).onNavigate((route) => {
      if (/^\/(?!\/)/.test(route)) void router.navigateByUrl(route);
    });
    inject(DestroyRef).onDestroy(unsubscribe);
  }
}
