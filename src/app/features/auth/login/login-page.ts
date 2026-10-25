import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MATERIAL_FORMS } from '../../../shared/material';
import { AuthFailure } from '../../../core/auth/auth-errors';
import { AuthService } from '../../../core/auth/auth.service';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink, MATERIAL_FORMS],
  templateUrl: './login-page.html',
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  protected readonly submitting = signal(false);
  protected readonly showPassword = signal(false);
  protected readonly error = signal<AuthFailure | null>(null);

  async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.error.set(null);
    const { email, password } = this.form.getRawValue();
    try {
      await this.auth.signIn(email, password);
      await this.router.navigateByUrl('/');
    } catch (error) {
      this.error.set(error as AuthFailure);
    } finally {
      this.submitting.set(false);
    }
  }
}
