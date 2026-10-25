import { Component, effect, inject, type OnInit } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ProfileService } from '../../core/profile/profile.service';
import { OrganizationStore } from '../../features/organization/organization.service';
import { ToastService } from '../../shared/toast/toast.service';

@Component({
  selector: 'app-shell-layout',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './shell-layout.html',
  styleUrl: './shell-layout.scss',
})
export class ShellLayout implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly profileService = inject(ProfileService);
  private readonly org = inject(OrganizationStore);
  protected readonly user = this.auth.user;

  constructor() {
    // Session ended elsewhere (sign-out, expired refresh token): leave the shell.
    effect(() => {
      if (!this.auth.isAuthenticated()) {
        this.profileService.clear();
        this.org.clear();
        void this.router.navigate(['/login']);
      }
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      await this.profileService.load();
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
