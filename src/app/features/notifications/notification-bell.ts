import { Component, type ElementRef, inject, viewChild } from '@angular/core';
import { MatBadge } from '@angular/material/badge';
import { MatButton, MatIconButton } from '@angular/material/button';
import { MatIcon } from '@angular/material/icon';
import { MatMenu, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltip } from '@angular/material/tooltip';
import { Router, RouterLink } from '@angular/router';
import {
  type AppNotification,
  NOTIFICATION_ICONS,
  NotificationCenter,
} from './notification-center';

/** "há 5 min", "há 2 h", "ontem"... for the notification list. */
export function relativeTime(iso: string, now = new Date()): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'ontem' : `há ${days} dias`;
}

/** Bell with unread badge; the menu lists notifications delivered on this device. */
@Component({
  selector: 'app-notification-bell',
  imports: [
    MatBadge,
    MatButton,
    MatIconButton,
    MatIcon,
    MatMenu,
    MatMenuTrigger,
    MatTooltip,
    RouterLink,
  ],
  template: `
    <button
      matIconButton
      type="button"
      [matMenuTriggerFor]="menu"
      (menuOpened)="focusPanel()"
      matTooltip="Notificações"
      [attr.aria-label]="
        center.unread() ? center.unread() + ' notificações não lidas' : 'Notificações'
      "
    >
      <mat-icon
        [matBadge]="center.unread()"
        [matBadgeHidden]="center.unread() === 0"
        matBadgeSize="small"
        matBadgeColor="warn"
        aria-hidden="false"
        >{{ center.unread() ? 'notifications_active' : 'notifications' }}</mat-icon
      >
    </button>
    <mat-menu
      #menu="matMenu"
      class="notification-menu"
      xPosition="after"
      (closed)="center.markAllRead()"
    >
      <!-- Clicks inside the panel (e.g. "Limpar") keep the menu open. -->
      <div
        #panel
        class="panel"
        tabindex="-1"
        (click)="$event.stopPropagation()"
        (keydown.enter)="$event.stopPropagation()"
      >
        <header class="panel__head">
          <strong>Notificações</strong>
          @if (center.items().length) {
            <button matButton type="button" (click)="center.clear()">Limpar</button>
          }
        </header>
        <ul class="panel__list">
          @for (item of center.items(); track item.id) {
            <li animate.enter="enter-fade-up" [style.--stagger]="$index">
              <button
                type="button"
                class="entry"
                [class.entry--unread]="!item.read"
                (click)="open(item)"
              >
                <mat-icon class="entry__icon">{{ icons[item.kind] }}</mat-icon>
                <span class="entry__text">
                  <span class="entry__title">{{ item.title }}</span>
                  @if (item.body) {
                    <span class="entry__body">{{ item.body }}</span>
                  }
                  <span class="entry__time">{{ when(item) }}</span>
                </span>
              </button>
            </li>
          } @empty {
            <li class="panel__empty">
              <mat-icon>notifications_none</mat-icon>
              Nenhuma notificação por aqui.
            </li>
          }
        </ul>
        <footer class="panel__foot">
          <a matButton routerLink="/notifications" (click)="trigger()?.closeMenu()">
            <mat-icon>tune</mat-icon> Notificações personalizadas
          </a>
        </footer>
      </div>
    </mat-menu>
  `,
  styles: `
    .panel {
      width: 380px;
      max-width: 90vw;
      outline: none;
    }
    .panel__head,
    .panel__foot {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: var(--space-1) var(--space-2) var(--space-1) var(--space-4);
    }
    .panel__foot {
      border-top: 1px solid var(--mat-sys-outline-variant);
    }
    .panel__list {
      max-height: 400px;
      margin: 0;
      padding: 0;
      overflow-y: auto;
      list-style: none;
    }
    .panel__empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-2);
      padding: var(--space-6, 24px) var(--space-4);
      color: var(--color-text-muted);
    }
    .entry {
      all: unset;
      box-sizing: border-box;
      display: flex;
      gap: var(--space-3);
      width: 100%;
      padding: var(--space-3) var(--space-4);
      cursor: pointer;
    }
    .entry:hover,
    .entry:focus-visible {
      background: var(--mat-sys-surface-container-highest);
    }
    .entry--unread {
      background: color-mix(in srgb, var(--mat-sys-primary) 8%, transparent);
    }
    .entry--unread .entry__title::after {
      content: '';
      display: inline-block;
      width: 8px;
      height: 8px;
      margin-left: var(--space-2);
      border-radius: 50%;
      background: var(--mat-sys-primary);
      vertical-align: middle;
    }
    .entry__icon {
      flex: none;
      color: var(--mat-sys-primary);
    }
    .entry__text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      min-width: 0;
    }
    .entry__title {
      font: var(--mat-sys-title-small);
    }
    .entry__body {
      font: var(--mat-sys-body-small);
      color: var(--mat-sys-on-surface-variant);
      overflow-wrap: anywhere;
    }
    .entry__time {
      font: var(--mat-sys-label-small);
      color: var(--color-text-muted);
    }
  `,
})
export class NotificationBell {
  protected readonly center = inject(NotificationCenter);
  private readonly router = inject(Router);
  protected readonly icons = NOTIFICATION_ICONS;
  protected readonly trigger = viewChild(MatMenuTrigger);
  private readonly panel = viewChild<ElementRef<HTMLElement>>('panel');

  /** The panel has no menu items; focusing it lets Esc and Tab work inside the menu. */
  protected focusPanel(): void {
    setTimeout(() => this.panel()?.nativeElement.focus());
  }

  protected when(item: AppNotification): string {
    return relativeTime(item.createdAt);
  }

  protected open(item: AppNotification): void {
    this.center.markRead(item.id);
    this.trigger()?.closeMenu();
    if (item.route) void this.router.navigateByUrl(item.route);
  }
}
