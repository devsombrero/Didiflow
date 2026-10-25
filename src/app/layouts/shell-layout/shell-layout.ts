import { Component, computed, effect, inject, type OnInit } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ProfileService } from '../../core/profile/profile.service';
import { OrganizationStore } from '../../features/organization/organization.service';
import { TimerStore } from '../../features/time-tracking/time.service';
import { TimerWidget } from '../../features/time-tracking/timer-widget';
import { NotificationScheduler } from '../../features/notifications/notification-scheduler';
import { FocusStore } from '../../features/focus/focus.service';
import { formatClock } from '../../features/time-tracking/time-calc';
import { ToastService } from '../../shared/toast/toast.service';

@Component({
  selector: 'app-shell-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TimerWidget],
  templateUrl: './shell-layout.html',
  styleUrl: './shell-layout.scss',
})
export class ShellLayout implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly profileService = inject(ProfileService);
  private readonly org = inject(OrganizationStore);
  private readonly timer = inject(TimerStore);
  private readonly scheduler = inject(NotificationScheduler);
  protected readonly focus = inject(FocusStore);
  protected readonly focusClock = computed(() =>
    formatClock(this.focus.remaining()).replace(/^00:/, ''),
  );
  protected readonly user = this.auth.user;

  constructor() {
    // Session ended elsewhere (sign-out, expired refresh token): leave the shell.
    effect(() => {
      if (!this.auth.isAuthenticated()) {
        this.profileService.clear();
        this.org.clear();
        this.timer.clear();
        this.scheduler.stop();
        this.focus.clear();
        void this.router.navigate(['/login']);
      }
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      await Promise.all([this.profileService.load(), this.timer.refresh()]);
      this.scheduler.start();
      void this.focus.restore().catch(() => undefined);
    } catch {
      this.toast.error('Não foi possível carregar seu perfil.');
    }
  }

  async signOut(): Promise<void> {
    try {
      await this.auth.signOut();
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'Falha ao sair.');
    }
  }
}
