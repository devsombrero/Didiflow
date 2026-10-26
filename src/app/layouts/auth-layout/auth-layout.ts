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
    @use 'breakpoints' as bp;
    .auth {
      min-height: 100%;
      display: grid;
      place-items: center;
      padding: var(--space-4);
      background:
        radial-gradient(
          800px 500px at 0% 0%,
          light-dark(hsl(204 95% 80% / 0.7), hsl(204 89% 45% / 0.25)),
          transparent 60%
        ),
        radial-gradient(
          700px 500px at 100% 100%,
          light-dark(hsl(196 94% 75% / 0.55), hsl(196 94% 45% / 0.18)),
          transparent 60%
        ),
        var(--mat-sys-surface);
    }
    @include bp.desktop {
      .auth {
        padding: var(--space-6);
      }
    }
    .auth__panel {
      width: min(440px, 100%);
    }
    .auth__brand {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-3);
      margin: 0 0 var(--space-4);
      font: var(--mat-sys-headline-small);
      font-weight: 800;
      letter-spacing: -0.03em;
      color: var(--mat-sys-on-surface);
    }
    .auth__brand mat-icon {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: 14px;
      background: var(--gradient-brand);
      color: var(--mat-sys-on-primary);
      font-size: 28px;
      box-shadow: var(--shadow-lift);
    }
    .auth__card {
      padding: var(--space-4) var(--space-1);
      border-radius: 24px;
      background: light-dark(hsl(210 50% 98% / 0.85), hsl(240 8% 6% / 0.85));
      backdrop-filter: blur(16px);
      box-shadow: var(--shadow-lift);
    }
    .auth__tagline {
      margin-top: var(--space-4);
      text-align: center;
      color: var(--mat-sys-on-surface-variant);
    }
  `,
})
export class AuthLayout {}
