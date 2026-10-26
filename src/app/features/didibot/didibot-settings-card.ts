import { Component, ElementRef, inject, type OnInit, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  type AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  type ValidationErrors,
} from '@angular/forms';
import type { AiModel, AiStatus } from '../../../../electron/ipc/contract';
import { DesktopBridge } from '../../core/platform/desktop-bridge';
import { MATERIAL_FORMS, MATERIAL_UI } from '../../shared/material';
import { ToastService } from '../../shared/toast/toast.service';
import { DidiBotService } from './didibot.service';
import {
  AI_STUDIO_KEYS_URL,
  aiErrorMessage,
  CONNECTING_MESSAGE,
  connectErrorMessage,
  DEFAULT_AI_MODEL,
  FALLBACK_MODELS,
  PRIVACY_NOTICE,
} from './ai-messages';

/** Empty (keep the stored key) or a Gemini API key from Google AI Studio. */
export function apiKeyValidator(control: AbstractControl<string>): ValidationErrors | null {
  const value = control.value.trim();
  return value === '' || /^[A-Za-z0-9_-]{30,80}$/.test(value) ? null : { apiKey: true };
}

/** Settings → DidiBot: optional Google account (AI Studio key) and model. */
@Component({
  selector: 'app-didibot-settings-card',
  imports: [ReactiveFormsModule, MATERIAL_FORMS, MATERIAL_UI],
  template: `
    <mat-card appearance="outlined" class="section" id="didibot">
      <mat-card-header>
        <mat-icon mat-card-avatar>smart_toy</mat-icon>
        <mat-card-title>DidiBot (Gemini)</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        @if (!available) {
          <p class="muted">O DidiBot é configurado no aplicativo para computador.</p>
        } @else if (status(); as current) {
          <form class="form" [formGroup]="form" (ngSubmit)="save()" novalidate>
            @if (current.googleSignIn) {
              <p class="field-hint intro">
                Assistente opcional com a API Gemini gratuita do Google. Entre com a sua conta
                Google e o DidiFlow cria a chave do Gemini automaticamente, em um projeto “DidiFlow
                DidiBot” da sua conta. A chave fica criptografada neste computador; o acesso do
                Google usado para criá-la é descartado em seguida.
              </p>
            } @else {
              <p class="field-hint intro">
                Assistente opcional com a API Gemini gratuita do Google. Para ativar, conecte uma
                conta Google: o botão abaixo abre o Google AI Studio, onde você cria uma chave
                gratuita e cola aqui. A chave fica criptografada neste computador.
              </p>
            }
            <p class="state" [attr.data-on]="current.hasKey" id="didibot-state">
              <mat-icon>{{ current.hasKey ? 'check_circle' : 'link_off' }}</mat-icon>
              {{
                current.hasKey
                  ? current.account
                    ? 'Conectado com a conta Google ' + current.account
                    : 'Chave própria conectada'
                  : 'Nenhuma conta Google conectada'
              }}
            </p>
            @if (current.googleSignIn) {
              <div class="google">
                <button
                  matButton="filled"
                  type="button"
                  id="didibot-google"
                  [disabled]="busy() || bot.connecting()"
                  (click)="signIn()"
                >
                  <mat-icon>login</mat-icon>
                  {{ current.hasKey ? 'Reconectar com Google' : 'Entrar com Google' }}
                </button>
                @if (bot.connecting()) {
                  <span class="connecting"
                    ><mat-spinner diameter="18" /> {{ connectingMessage }}</span
                  >
                }
              </div>
              <h3 class="manual">Ou use uma chave própria</h3>
            }

            <div class="grid">
              <mat-form-field>
                <mat-label>Chave da API Gemini</mat-label>
                <input
                  matInput
                  id="didibot-key"
                  [type]="showKey() ? 'text' : 'password'"
                  autocomplete="off"
                  [placeholder]="current.hasKey ? '•••• salva' : 'AIza…'"
                  formControlName="apiKey"
                />
                <button
                  matIconButton
                  matSuffix
                  type="button"
                  [attr.aria-label]="showKey() ? 'Ocultar chave' : 'Mostrar chave'"
                  (click)="showKey.set(!showKey())"
                >
                  <mat-icon>{{ showKey() ? 'visibility_off' : 'visibility' }}</mat-icon>
                </button>
                <mat-hint>
                  {{
                    current.hasKey
                      ? 'Chave salva. Deixe em branco para mantê-la.'
                      : 'Criada em aistudio.google.com/apikey.'
                  }}
                </mat-hint>
                <mat-error>Cole a chave completa gerada no Google AI Studio.</mat-error>
              </mat-form-field>

              <mat-form-field>
                <mat-label>Modelo</mat-label>
                <mat-select id="didibot-model" formControlName="model">
                  @for (model of models(); track model.id) {
                    <mat-option [value]="model.id">{{ model.name }}</mat-option>
                  }
                </mat-select>
                <mat-hint>Os modelos Flash cabem no plano gratuito.</mat-hint>
              </mat-form-field>
            </div>
            @if (!current.canStoreKey) {
              <p class="field-hint warn">
                Este computador não oferece armazenamento criptografado: a chave fica só na memória
                até o DidiFlow fechar.
              </p>
            }
            <p class="field-hint">{{ privacy }}</p>

            <div class="actions">
              <button matButton="filled" type="submit" [disabled]="busy() || form.pristine">
                Salvar DidiBot
              </button>
              <button
                matButton="outlined"
                type="button"
                [disabled]="busy() || !current.hasKey || !form.pristine"
                (click)="test()"
              >
                <mat-icon>bolt</mat-icon> Testar conexão
              </button>
              <button matButton type="button" (click)="connect()">
                <mat-icon>open_in_new</mat-icon>
                {{ current.googleSignIn ? 'Criar chave no AI Studio' : 'Conectar conta Google' }}
              </button>
              @if (current.hasKey) {
                <button matButton type="button" [disabled]="busy()" (click)="disconnect()">
                  <mat-icon>link_off</mat-icon> Desconectar
                </button>
              }
            </div>
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
    .state {
      display: flex;
      gap: var(--space-2);
      align-items: center;
      font-weight: 600;
      color: var(--mat-sys-on-surface-variant);
    }
    .state[data-on='true'] {
      color: var(--color-success);
    }
    .google {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
      align-items: center;
      margin-bottom: var(--space-2);
    }
    .connecting {
      display: inline-flex;
      gap: var(--space-2);
      align-items: center;
      color: var(--mat-sys-primary);
      font: var(--mat-sys-body-medium);
    }
    .manual {
      margin: var(--space-4) 0 var(--space-2);
      font: var(--mat-sys-title-small);
    }
    .grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      align-items: start;
      gap: 0 var(--space-3);
    }
    @include bp.desktop {
      .grid {
        grid-template-columns: 2fr 1fr;
      }
    }
    .warn {
      color: var(--mat-sys-error);
    }
  `,
})
export class DidiBotSettingsCard implements OnInit {
  private readonly bridge = inject(DesktopBridge);
  private readonly toast = inject(ToastService);
  private readonly fb = inject(NonNullableFormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly available = this.bridge.ai !== null;
  protected readonly privacy = PRIVACY_NOTICE;
  protected readonly connectingMessage = CONNECTING_MESSAGE;
  protected readonly bot = inject(DidiBotService);
  protected readonly status = signal<AiStatus | null>(null);
  protected readonly models = signal<AiModel[]>(FALLBACK_MODELS);
  protected readonly busy = signal(false);
  protected readonly showKey = signal(false);

  protected readonly form = this.fb.group({
    apiKey: ['', apiKeyValidator],
    model: [DEFAULT_AI_MODEL],
  });

  async ngOnInit(): Promise<void> {
    if (!this.bridge.ai) return;
    try {
      this.apply(await this.bridge.ai.status());
      // Coming from the DidiBot page ("Conectar conta Google"): bring the card into view.
      if (this.route.snapshot.fragment === 'didibot') {
        setTimeout(() => this.host.nativeElement.scrollIntoView({ block: 'start' }));
      }
      if (this.status()?.hasKey) await this.loadModels();
    } catch {
      this.toast.error('Não foi possível carregar a configuração do DidiBot.');
    }
  }

  protected connect(): void {
    void this.bridge.openExternal(AI_STUDIO_KEYS_URL);
  }

  async save(): Promise<void> {
    const ai = this.bridge.ai;
    if (!ai) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const { apiKey, model } = this.form.getRawValue();
    await this.run(async () => {
      this.apply(await ai.save({ model, apiKey: apiKey.trim() || undefined }));
      if (!apiKey.trim()) {
        this.toast.success('DidiBot salvo.');
        return;
      }
      // New key: list its models and check it right away.
      await this.loadModels();
      const result = await ai.test();
      if (result.status === 'ok')
        this.toast.success('Conta Google conectada. O DidiBot está pronto.');
      else this.toast.error(aiErrorMessage(result.error));
    }, 'Não foi possível salvar o DidiBot.');
  }

  /** Google sign-in: the main process creates the Gemini key and stores it. */
  protected async signIn(): Promise<void> {
    await this.run(async () => {
      const result = await this.bot.connectGoogle();
      if (result.status !== 'ok') {
        this.toast.error(connectErrorMessage(result.error));
        return;
      }
      const status = await this.bridge.ai!.status();
      this.apply(status);
      await this.loadModels();
      this.toast.success(`Conta Google ${result.account} conectada. O DidiBot está pronto.`);
    }, 'Não foi possível conectar a conta Google.');
  }

  protected async test(): Promise<void> {
    const ai = this.bridge.ai;
    if (!ai) return;
    await this.run(async () => {
      const result = await ai.test();
      if (result.status === 'ok') this.toast.success(`DidiBot respondeu com ${result.model}.`);
      else this.toast.error(aiErrorMessage(result.error));
    }, 'Não foi possível testar o DidiBot.');
  }

  protected async disconnect(): Promise<void> {
    const ai = this.bridge.ai;
    if (!ai) return;
    await this.run(async () => {
      this.apply(await ai.save({ model: this.form.controls.model.value, apiKey: null }));
      this.models.set(FALLBACK_MODELS);
      this.toast.success('Conta Google desconectada do DidiBot.');
    }, 'Não foi possível desconectar.');
  }

  private async loadModels(): Promise<void> {
    const result = await this.bridge.ai!.models();
    if (result.status !== 'ok' || result.models.length === 0) return;
    const current = this.form.controls.model.value;
    const list = result.models.some((model) => model.id === current)
      ? result.models
      : [{ id: current, name: current }, ...result.models];
    this.models.set(list);
  }

  private apply(status: AiStatus): void {
    this.status.set(status);
    if (!this.models().some((model) => model.id === status.model)) {
      this.models.update((models) => [{ id: status.model, name: status.model }, ...models]);
    }
    this.form.reset({ apiKey: '', model: status.model });
    this.showKey.set(false);
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
