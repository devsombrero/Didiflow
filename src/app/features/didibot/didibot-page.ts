import {
  afterRenderEffect,
  Component,
  type ElementRef,
  inject,
  type OnInit,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MarkdownView } from '../../shared/markdown/markdown-view';
import { MATERIAL_FORMS, MATERIAL_UI } from '../../shared/material';
import { ToastService } from '../../shared/toast/toast.service';
import {
  CONNECTING_MESSAGE,
  connectErrorMessage,
  PRIVACY_NOTICE,
  QUICK_PROMPTS,
} from './ai-messages';
import { DidiBotService } from './didibot.service';

/** DidiBot chat: questions about the user's work, answered by Gemini. */
@Component({
  selector: 'app-didibot-page',
  imports: [FormsModule, RouterLink, MarkdownView, MATERIAL_FORMS, MATERIAL_UI],
  template: `
    <header class="page-header">
      <h1>DidiBot</h1>
      @if (bot.connected()) {
        <div class="page-actions">
          <button
            matButton="outlined"
            type="button"
            [disabled]="bot.busy() || bot.entries().length === 0"
            (click)="bot.reset()"
          >
            <mat-icon>restart_alt</mat-icon> Nova conversa
          </button>
        </div>
      }
    </header>

    @if (!bot.available) {
      <mat-card appearance="outlined" class="intro">
        <mat-card-content>
          <p class="muted">O DidiBot funciona no aplicativo para computador.</p>
        </mat-card-content>
      </mat-card>
    } @else if (!loaded()) {
      <mat-progress-bar mode="indeterminate" />
    } @else if (!bot.connected()) {
      <mat-card appearance="outlined" class="intro" id="didibot-connect">
        <mat-card-content>
          <div class="hero">
            <span class="hero__icon"><mat-icon>smart_toy</mat-icon></span>
            <div>
              <h2>Seu assistente para planejar o trabalho</h2>
              <p>
                O DidiBot conversa sobre as suas tarefas, prazos e horas, resume o dia, sugere
                prioridades e quebra tarefas em subtarefas. Ele usa a API Gemini gratuita do Google
                e é <strong>opcional</strong>: conecte uma conta Google para ativar.
              </p>
              @if (bot.status()?.googleSignIn) {
                <div class="connect-actions">
                  <button
                    matButton="filled"
                    type="button"
                    id="didibot-google"
                    [disabled]="bot.connecting()"
                    (click)="connect()"
                  >
                    <mat-icon>login</mat-icon> Entrar com Google
                  </button>
                  <a matButton routerLink="/settings" fragment="didibot">Usar uma chave própria</a>
                </div>
                @if (bot.connecting()) {
                  <p class="connecting"><mat-spinner diameter="18" /> {{ connectingMessage }}</p>
                }
              } @else {
                <a matButton="filled" routerLink="/settings" fragment="didibot">
                  <mat-icon>link</mat-icon> Conectar conta Google
                </a>
              }
            </div>
          </div>
          <p class="notice">{{ privacy }}</p>
        </mat-card-content>
      </mat-card>
    } @else {
      <section class="chat" aria-live="polite">
        @if (bot.entries().length === 0) {
          <div class="welcome">
            <span class="hero__icon"><mat-icon>smart_toy</mat-icon></span>
            <p>Olá! Sou o DidiBot. Pergunte sobre suas tarefas ou escolha um atalho.</p>
          </div>
        }
        <ol class="messages" #messages>
          @for (entry of bot.entries(); track entry.id) {
            <li class="message" [attr.data-role]="entry.role">
              @if (entry.role === 'user') {
                <p>{{ entry.text }}</p>
              } @else if (entry.role === 'model') {
                <app-markdown-view [text]="entry.text" />
              } @else {
                <p><mat-icon inline>error</mat-icon> {{ entry.text }}</p>
              }
            </li>
          }
          @if (bot.busy()) {
            <li class="message typing" data-role="model">
              <span></span><span></span><span></span>
            </li>
          }
        </ol>

        <div class="prompts">
          @for (quick of quickPrompts; track quick.label) {
            <button
              matButton="outlined"
              type="button"
              [disabled]="bot.busy()"
              (click)="ask(quick.prompt)"
            >
              <mat-icon>{{ quick.icon }}</mat-icon> {{ quick.label }}
            </button>
          }
        </div>

        <form class="composer" (ngSubmit)="ask(question())">
          <mat-form-field subscriptSizing="dynamic">
            <mat-label>Pergunte ao DidiBot</mat-label>
            <textarea
              matInput
              id="didibot-input"
              rows="2"
              maxlength="4000"
              name="question"
              [ngModel]="question()"
              (ngModelChange)="question.set($event)"
              (keydown.enter)="onEnter($event)"
            ></textarea>
          </mat-form-field>
          <button
            matButton="filled"
            type="submit"
            aria-label="Enviar"
            [disabled]="bot.busy() || !question().trim()"
          >
            <mat-icon>send</mat-icon> Enviar
          </button>
        </form>
        <div class="footer">
          <mat-slide-toggle
            id="didibot-context"
            [checked]="bot.includeContext()"
            (change)="bot.setIncludeContext($event.checked)"
          >
            Incluir minhas tarefas no contexto
          </mat-slide-toggle>
          <span class="notice">{{ privacy }}</span>
        </div>
      </section>
    }
  `,
  styles: `
    @use 'breakpoints' as bp;
    .intro {
      max-width: 820px;
    }
    .hero {
      display: flex;
      gap: var(--space-4);
      align-items: flex-start;
    }
    .hero h2 {
      margin: 0 0 var(--space-2);
    }
    .hero__icon {
      flex: none;
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      border-radius: 14px;
      background: var(--gradient-brand);
      color: var(--mat-sys-on-primary);
      box-shadow: var(--shadow-lift);
    }
    .connect-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
    .connecting {
      display: flex;
      gap: var(--space-2);
      align-items: center;
      color: var(--mat-sys-primary);
    }
    .notice {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
    }
    .intro .notice {
      display: block;
      margin-top: var(--space-4);
    }
    .chat {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      max-width: 900px;
    }
    .welcome {
      display: flex;
      gap: var(--space-3);
      align-items: center;
      color: var(--mat-sys-on-surface-variant);
    }
    .messages {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .message {
      max-width: 92%;
      padding: var(--space-3) var(--space-4);
      border-radius: 16px;
      border: 1px solid var(--mat-sys-outline-variant);
      background: var(--mat-sys-surface-container-low);
      line-height: 1.5;
      overflow-wrap: anywhere;
    }
    .message p {
      margin: 0;
      white-space: pre-wrap;
    }
    .message[data-role='user'] {
      align-self: flex-end;
      border-color: transparent;
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
      border-bottom-right-radius: 4px;
    }
    .message[data-role='model'] {
      align-self: flex-start;
      border-bottom-left-radius: 4px;
    }
    .message[data-role='error'] {
      align-self: flex-start;
      background: var(--mat-sys-error-container);
      color: var(--mat-sys-on-error-container);
      border-color: transparent;
    }
    .typing {
      display: flex;
      gap: 6px;
    }
    .typing span {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--mat-sys-primary);
      animation: blink 1.2s infinite ease-in-out;
    }
    .typing span:nth-child(2) {
      animation-delay: 0.2s;
    }
    .typing span:nth-child(3) {
      animation-delay: 0.4s;
    }
    @keyframes blink {
      50% {
        opacity: 0.25;
      }
    }
    .prompts {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
    .composer {
      display: flex;
      gap: var(--space-2);
      align-items: flex-start;
    }
    .composer mat-form-field {
      flex: 1;
    }
    .composer button {
      margin-top: 8px;
    }
    .footer {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
    .footer mat-slide-toggle {
      flex: none;
      white-space: nowrap;
    }
    @include bp.desktop {
      .footer {
        flex-direction: row;
        align-items: center;
        justify-content: space-between;
      }
    }
  `,
})
export class DidiBotPage implements OnInit {
  protected readonly bot = inject(DidiBotService);
  protected readonly quickPrompts = QUICK_PROMPTS;
  protected readonly privacy = PRIVACY_NOTICE;
  protected readonly connectingMessage = CONNECTING_MESSAGE;
  private readonly toast = inject(ToastService);
  protected readonly question = signal('');
  protected readonly loaded = signal(false);
  private readonly messages = viewChild<ElementRef<HTMLElement>>('messages');

  constructor() {
    // Keep the newest message in view.
    afterRenderEffect(() => {
      this.bot.entries();
      this.bot.busy();
      this.messages()?.nativeElement.lastElementChild?.scrollIntoView({ block: 'nearest' });
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      await this.bot.refreshStatus();
    } finally {
      this.loaded.set(true);
    }
  }

  protected async connect(): Promise<void> {
    const result = await this.bot.connectGoogle();
    if (result.status === 'ok') {
      this.toast.success(`Conta Google ${result.account} conectada. O DidiBot está pronto.`);
    } else {
      this.toast.error(connectErrorMessage(result.error));
    }
  }

  protected onEnter(event: Event): void {
    if ((event as KeyboardEvent).shiftKey) return;
    event.preventDefault();
    void this.ask(this.question());
  }

  protected async ask(text: string): Promise<void> {
    if (!text.trim() || this.bot.busy()) return;
    this.question.set('');
    await this.bot.send(text);
  }
}
