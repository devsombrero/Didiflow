import { Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-auth-layout',
  imports: [RouterOutlet, MatCardModule, MatIconModule],
  template: `
    <main class="auth">
      <div class="auth__panel">
        <p class="auth__brand"><mat-icon>task_alt</mat-icon> DidiFlow</p>
        <mat-card appearance="outlined" class="auth__card">
          <mat-card-content>
            <router-outlet />
          </mat-card-content>
        </mat-card>
        <p class="auth__tagline">Gestão pessoal de demandas, prazos e indicadores.</p>
      </div>
    </main>
  `,
  styles: `
    .auth {
      min-height: 100%;
      display: grid;
      place-items: center;
      padding: var(--space-6);
      background: radial-gradient(
        circle at top left,
        var(--mat-sys-primary-container),
        var(--mat-sys-surface) 60%
      );
    }
    .auth__panel {
      width: min(440px, 100%);
    }
    .auth__brand {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-2);
      margin: 0 0 var(--space-4);
      font: var(--mat-sys-headline-small);
      color: var(--mat-sys-primary);
    }
    .auth__card {
      padding: var(--space-4) var(--space-2);
    }
    .auth__tagline {
      margin-top: var(--space-4);
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class AuthLayout {}
