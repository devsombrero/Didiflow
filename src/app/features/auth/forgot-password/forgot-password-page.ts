import { Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthFailure } from '../../../core/auth/auth-errors';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { matchFields, passwordStrength } from '../../../shared/validators/password.validators';

@Component({
  selector: 'app-forgot-password-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password-page.html',
})
export class ForgotPasswordPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly step = signal<'request' | 'reset'>('request');
  protected readonly submitting = signal(false);
  protected readonly error = signal<AuthFailure | null>(null);

  protected readonly requestForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
  });

  protected readonly resetForm = this.fb.group(
    {
      code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
      password: ['', [Validators.required, passwordStrength]],
      passwordConfirmation: ['', Validators.required],
    },
    { validators: matchFields('password', 'passwordConfirmation') },
  );

  async requestCode(): Promise<void> {
    if (this.requestForm.invalid) {
      this.requestForm.markAllAsTouched();
      return;
    }

    await this.run(async () => {
      await this.auth.requestPasswordReset(this.requestForm.getRawValue().email);
      // Same outcome whether or not the e-mail exists (no account enumeration).
      this.step.set('reset');
    });
  }

  async resetPassword(): Promise<void> {
    if (this.resetForm.invalid) {
      this.resetForm.markAllAsTouched();
      return;
    }

    const { code, password } = this.resetForm.getRawValue();
    await this.run(async () => {
      await this.auth.resetPassword(this.requestForm.getRawValue().email, code, password);
      this.toast.success('Senha redefinida com sucesso.');
      await this.router.navigateByUrl('/');
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.submitting.set(true);
    this.error.set(null);
    try {
      await action();
    } catch (error) {
      this.error.set(error as AuthFailure);
    } finally {
      this.submitting.set(false);
    }
  }
}
