import { Component, inject, input, type OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthFailure } from '../../../core/auth/auth-errors';
import { AuthService } from '../../../core/auth/auth.service';
import { ToastService } from '../../../shared/toast/toast.service';
import { matchFields, passwordStrength } from '../../../shared/validators/password.validators';

const OTP_PATTERN = /^\d{6}$/;

@Component({
  selector: 'app-register-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register-page.html',
})
export class RegisterPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(NonNullableFormBuilder);

  /** ?confirm=<email> opens the confirmation step directly (from login). */
  readonly confirm = input<string>();

  protected readonly step = signal<'form' | 'confirm'>('form');
  protected readonly email = signal('');
  protected readonly submitting = signal(false);
  protected readonly error = signal<AuthFailure | null>(null);

  protected readonly form = this.fb.group(
    {
      displayName: ['', [Validators.required, Validators.maxLength(80)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, passwordStrength]],
      passwordConfirmation: ['', Validators.required],
    },
    { validators: matchFields('password', 'passwordConfirmation') },
  );

  protected readonly codeForm = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(OTP_PATTERN)]],
  });

  ngOnInit(): void {
    const email = this.confirm();
    if (email) {
      this.email.set(email);
      this.step.set('confirm');
    }
  }

  async register(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const { displayName, email, password } = this.form.getRawValue();
    await this.run(async () => {
      const { needsConfirmation } = await this.auth.signUp(email, password, displayName.trim());
      if (needsConfirmation) {
        this.email.set(email);
        this.step.set('confirm');
      } else {
        await this.router.navigateByUrl('/');
      }
    });
  }

  async confirmCode(): Promise<void> {
    if (this.codeForm.invalid) {
      this.codeForm.markAllAsTouched();
      return;
    }

    await this.run(async () => {
      await this.auth.confirmSignUp(this.email(), this.codeForm.getRawValue().code);
      this.toast.success('E-mail confirmado. Bem-vindo ao DidiFlow!');
      await this.router.navigateByUrl('/');
    });
  }

  async resendCode(): Promise<void> {
    await this.run(async () => {
      await this.auth.resendSignUpCode(this.email());
      this.toast.success('Enviamos um novo código para o seu e-mail.');
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
