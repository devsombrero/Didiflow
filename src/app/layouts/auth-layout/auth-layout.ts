import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-auth-layout',
  imports: [RouterOutlet],
  template: `
    <main class="auth">
      <div class="auth__panel">
        <p class="auth__brand">DidiFlow</p>
        <div class="card">
          <router-outlet />
        </div>
      </div>
    </main>
  `,
  styles: `
    .auth {
      min-height: 100%;
      display: grid;
      place-items: center;
      padding: var(--space-6);
    }
    .auth__panel {
      width: min(420px, 100%);
    }
    .auth__brand {
      margin: 0 0 var(--space-4);
      font-size: 22px;
      font-weight: 700;
      text-align: center;
      color: var(--color-primary);
    }
  `,
})
export class AuthLayout {}
