import { Component, inject, OnInit, signal } from '@angular/core';
import {
  type AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  type ValidationErrors,
  Validators,
} from '@angular/forms';
import type { EmailKind, EmailStatus } from '../../../../electron/ipc/contract';
import { AuthService } from '../../core/auth/auth.service';
import { DesktopBridge } from '../../core/platform/desktop-bridge';
import { MATERIAL_FORMS, MATERIAL_UI } from '../../shared/material';
import { ToastService } from '../../shared/toast/toast.service';
import {
  EMAIL_KIND_OPTIONS,
  emailResultMessage,
  GMAIL_APP_PASSWORDS_URL,
} from '../notifications/email-messages';

/** Empty (keep the stored one) or a 16-letter Gmail app password, spaces allowed. */
export function appPasswordValidator(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value.replace(/\s+/g, '');
  return value === '' || /^[A-Za-z]{16}$/.test(value) ? null : { appPassword: true };
}

/**
 * Settings → E-mail (Gmail): forwards notifications by e-mail through the
 * user's Gmail account, authenticated with an app password that stays
 * encrypted in the desktop main process.
 */
@Component({
  selector: 'app-email-settings-card',
  imports: [ReactiveFormsModule, MATERIAL_FORMS, MATERIAL_UI],
  template: `
    <mat-card appearance="outlined" class="section">
      <mat-card-header>
        <mat-icon mat-card-avatar>mail</mat-icon>
        <mat-card-title>E-mail (Gmail)</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        @if (!available) {
          <p class="muted">
            O envio de notificações por e-mail é configurado no aplicativo para computador.
          </p>
        } @else if (status(); as current) {
          <form class="form" [formGroup]="form" (ngSubmit)="save()" novalidate>
            <p class="field-hint intro">
              Receba as notificações do DidiFlow também no seu e-mail. O envio usa a sua conta do
              Gmail com uma <strong>senha de app</strong> (a senha normal da conta não funciona) e
              acontece enquanto o DidiFlow estiver aberto, como as demais notificações.
            </p>
            @if (current.builtInAccount) {
              <p class="builtin" id="email_builtin">
                <mat-icon>verified</mat-icon>
                <span>
                  Conta padrão do DidiFlow já configurada:
                  <strong>{{ current.builtInAccount }}</strong
                  >. Os e-mails vão para o endereço da sua conta DidiFlow. Preencha os campos abaixo
                  só para usar outra conta do Gmail.
                </span>
              </p>
            }
            <mat-slide-toggle id="email_enabled" formControlName="enabled">
              Enviar notificações por e-mail
            </mat-slide-toggle>

            <div class="grid">
              <mat-form-field>
                <mat-label>Conta do Gmail</mat-label>
                <input
                  matInput
                  id="email_address"
                  type="email"
                  autocomplete="email"
                  placeholder="voce@gmail.com"
                  formControlName="address"
                />
                <mat-icon matSuffix>alternate_email</mat-icon>
                <mat-hint>
                  {{
                    current.builtInAccount
                      ? 'Em branco: usa a conta padrão.'
                      : 'Conta que envia os e-mails.'
                  }}
                </mat-hint>
                <mat-error>Informe um endereço de e-mail válido.</mat-error>
              </mat-form-field>

              <mat-form-field>
                <mat-label>Senha de app</mat-label>
                <input
                  matInput
                  id="email_app_password"
                  [type]="showPassword() ? 'text' : 'password'"
                  autocomplete="new-password"
                  [placeholder]="current.hasPassword ? '•••• salva' : 'xxxx xxxx xxxx xxxx'"
                  formControlName="appPassword"
                />
                <button
                  matIconButton
                  matSuffix
                  type="button"
                  [attr.aria-label]="showPassword() ? 'Ocultar senha' : 'Mostrar senha'"
                  (click)="showPassword.set(!showPassword())"
                >
                  <mat-icon>{{ showPassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
                </button>
                <mat-hint>
                  {{
                    current.hasPassword
                      ? 'Senha salva. Deixe em branco para mantê-la.'
                      : '16 letras geradas pelo Google.'
                  }}
                </mat-hint>
                <mat-error>A senha de app tem 16 letras (os espaços são ignorados).</mat-error>
              </mat-form-field>

              <mat-form-field>
                <mat-label>Enviar para (opcional)</mat-label>
                <input
                  matInput
                  id="email_recipient"
                  type="email"
                  autocomplete="email"
                  formControlName="recipient"
                />
                <mat-hint>Em branco: o e-mail da sua conta DidiFlow.</mat-hint>
                <mat-error>Informe um endereço de e-mail válido.</mat-error>
              </mat-form-field>
            </div>

            <h3>O que enviar</h3>
            <div class="kinds">
              @for (option of kindOptions; track option.value) {
                <mat-checkbox
                  [checked]="form.controls.kinds.value.includes(option.value)"
                  (change)="toggleKind(option.value, $event.checked)"
                >
                  {{ option.label }}
                  <span class="muted kind-hint">{{ option.hint }}</span>
                </mat-checkbox>
              }
            </div>
            <p class="field-hint">
              No máximo 20 e-mails por hora. Avisos com intervalo curto (ex.: a cada 15 minutos)
              podem encher a caixa de entrada.
            </p>
            @if (!current.canStorePassword) {
              <p class="field-hint warn">
                Este computador não oferece armazenamento criptografado: a senha de app fica só na
                memória e precisa ser informada de novo ao reabrir o DidiFlow.
              </p>
            }

            <div class="actions">
              <button matButton="filled" type="submit" [disabled]="busy() || form.pristine">
                Salvar e-mail
              </button>
              <button
                matButton="outlined"
                type="button"
                [disabled]="
                  busy() || !(current.hasPassword || current.builtInAccount) || !form.pristine
                "
                (click)="sendTest()"
              >
                <mat-icon>send</mat-icon> Enviar teste
              </button>
              <button matButton type="button" (click)="openAppPasswords()">
                <mat-icon>open_in_new</mat-icon> Criar senha de app
              </button>
              @if (current.hasPassword) {
                <button matButton type="button" [disabled]="busy()" (click)="removePassword()">
                  <mat-icon>key_off</mat-icon> Remover senha
                </button>
              }
            </div>
            <details class="help">
              <summary>Como criar a senha de app</summary>
              <ol>
                <li>Ative a verificação em duas etapas na sua Conta Google.</li>
                <li>
                  Abra <strong>Criar senha de app</strong> (myaccount.google.com/apppasswords) e dê
                  um nome, por exemplo “DidiFlow”.
                </li>
                <li>Copie as 16 letras exibidas e cole no campo <strong>Senha de app</strong>.</li>
              </ol>
            </details>
          </form>
        } @else {
          <mat-progress-bar mode="indeterminate" />
        }
      </mat-card-content>
    </mat-card>
  `,
  styles: `
    @use 'breakpoints' as bp;
    mat-icon[mat-card-avatar] {
      display: grid;
      place-items: center;
      background: var(--mat-sys-secondary-container);
      color: var(--mat-sys-on-secondary-container);
      border-radius: 50%;
    }
    .intro {
      margin-top: 0;
    }
    .grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      align-items: start;
      gap: 0 var(--space-3);
      margin-top: var(--space-3);
    }
    @include bp.desktop {
      .grid {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }
    h3 {
      margin-top: var(--space-4);
    }
    .kinds {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
    }
    @include bp.tablet {
      .kinds {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }
    .kind-hint {
      display: block;
      font: var(--mat-sys-body-small);
    }
    .warn {
      color: var(--mat-sys-error);
    }
    .builtin {
      display: flex;
      gap: var(--space-2);
      align-items: flex-start;
      margin: 0 0 var(--space-3);
      padding: var(--space-3);
      border-radius: 12px;
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
      font: var(--mat-sys-body-medium);
    }
    .builtin mat-icon {
      flex: none;
      color: var(--mat-sys-primary);
    }
    .help {
      margin-top: var(--space-3);
      font: var(--mat-sys-body-medium);
      color: var(--mat-sys-on-surface-variant);
    }
    .help summary {
      cursor: pointer;
      color: var(--mat-sys-primary);
      font-weight: 600;
    }
  `,
})
export class EmailSettingsCard implements OnInit {
  private readonly bridge = inject(DesktopBridge);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly available = this.bridge.email !== null;
  protected readonly kindOptions = EMAIL_KIND_OPTIONS;
  protected readonly status = signal<EmailStatus | null>(null);
  protected readonly busy = signal(false);
  protected readonly showPassword = signal(false);

  protected readonly form = this.fb.group({
    enabled: [false],
    address: ['', [Validators.email, Validators.maxLength(254)]],
    appPassword: ['', appPasswordValidator],
    recipient: ['', [Validators.email, Validators.maxLength(254)]],
    kinds: this.fb.control<EmailKind[]>([]),
  });

  async ngOnInit(): Promise<void> {
    if (!this.bridge.email) return;
    try {
      this.apply(await this.bridge.email.status());
    } catch {
      this.toast.error('Não foi possível carregar a configuração de e-mail.');
    }
  }

  protected toggleKind(kind: EmailKind, checked: boolean): void {
    const kinds = this.form.controls.kinds.value.filter((value) => value !== kind);
    this.form.controls.kinds.setValue(checked ? [...kinds, kind] : kinds);
    this.form.markAsDirty();
  }

  async save(): Promise<void> {
    const email = this.bridge.email;
    const current = this.status();
    if (!email || !current) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { enabled, address, appPassword, recipient, kinds } = this.form.getRawValue();
    const password = appPassword.replace(/\s+/g, '');
    const ownAccount = address.trim() !== '' && (password !== '' || current.hasPassword);
    if (enabled && !ownAccount && !current.builtInAccount) {
      this.toast.error('Para ativar, informe a conta do Gmail e a senha de app.');
      return;
    }
    await this.run(async () => {
      this.apply(
        await email.save({
          enabled,
          address: address.trim().toLowerCase(),
          recipient: recipient.trim().toLowerCase(),
          kinds,
          appPassword: password || undefined,
        }),
      );
      this.toast.success('Configuração de e-mail salva.');
    }, 'Não foi possível salvar a configuração de e-mail.');
  }

  protected async sendTest(): Promise<void> {
    const email = this.bridge.email;
    if (!email) return;
    await this.run(async () => {
      const result = await email.test(this.auth.user()?.email || undefined);
      const message = emailResultMessage(result);
      if (message) this.toast.error(message);
      else this.toast.success('E-mail de teste enviado. Confira a caixa de entrada.');
    }, 'Não foi possível enviar o e-mail de teste.');
  }

  protected async removePassword(): Promise<void> {
    const email = this.bridge.email;
    const current = this.status();
    if (!email || !current) return;
    // With an embedded account, removing the user's own falls back to it.
    const fallback = current.builtInAccount !== null;
    await this.run(async () => {
      this.apply(
        await email.save({
          ...current.settings,
          address: fallback ? '' : current.settings.address,
          enabled: fallback && current.settings.enabled,
          appPassword: null,
        }),
      );
      this.toast.success(
        fallback
          ? 'Senha de app removida. O DidiFlow volta a usar a conta padrão.'
          : 'Senha de app removida e envio por e-mail desativado.',
      );
    }, 'Não foi possível remover a senha de app.');
  }

  protected openAppPasswords(): void {
    void this.bridge.openExternal(GMAIL_APP_PASSWORDS_URL);
  }

  private apply(status: EmailStatus): void {
    this.status.set(status);
    this.form.reset({ ...status.settings, appPassword: '' });
    this.showPassword.set(false);
  }

  private async run(action: () => Promise<void>, failure: string): Promise<void> {
    this.busy.set(true);
    try {
      await action();
    } catch {
      this.toast.error(failure);
    } finally {
      this.busy.set(false);
    }
  }
}
