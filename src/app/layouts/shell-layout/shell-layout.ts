import {
  Component,
  computed,
  effect,
  type ElementRef,
  inject,
  type OnInit,
  viewChild,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatSidenav, MatSidenavModule } from '@angular/material/sidenav';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { App as CapacitorApp } from '@capacitor/app';
import { filter, map } from 'rxjs';
import { isNativeMobile } from '../../core/platform/mobile-platform';
import { MobileScheduleSync } from '../../features/notifications/mobile-schedule-sync';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ProfileService } from '../../core/profile/profile.service';
import { OrganizationStore } from '../../features/organization/organization.service';
import { TimerStore } from '../../features/time-tracking/time.service';
import { TimerWidget } from '../../features/time-tracking/timer-widget';
import { NotificationScheduler } from '../../features/notifications/notification-scheduler';
import { FocusStore } from '../../features/focus/focus.service';
import { AttachmentsService } from '../../features/attachments/attachments.service';
import { NotificationBell } from '../../features/notifications/notification-bell';
import { BackupScheduler } from '../../features/backup/backup-scheduler';
import { formatClock } from '../../features/time-tracking/time-calc';
import { ToastService } from '../../shared/toast/toast.service';

@Component({
  selector: 'app-shell-layout',
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    TimerWidget,
    NotificationBell,
    MatSidenavModule,
    MatListModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './shell-layout.html',
  styleUrl: './shell-layout.scss',
  host: { '(document:keydown)': 'onKeydown($event)' },
})
export class ShellLayout implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  protected readonly profileService = inject(ProfileService);
  private readonly org = inject(OrganizationStore);
  private readonly timer = inject(TimerStore);
  private readonly scheduler = inject(NotificationScheduler);
  protected readonly focus = inject(FocusStore);
  private readonly backupScheduler = inject(BackupScheduler);
  private readonly attachments = inject(AttachmentsService);
  private readonly mobileSync = inject(MobileScheduleSync);
  private readonly dialog = inject(MatDialog);
  private readonly sidenav = viewChild(MatSidenav);
  /**
   * Phone layout (drawer menu and top bar) unless the screen is at least
   * 769px wide — mobile-first, same breakpoint as the styles.
   */
  protected readonly handset = toSignal(
    inject(BreakpointObserver)
      .observe('(min-width: 769px)')
      .pipe(map((state) => !state.matches)),
    { initialValue: !matchMedia('(min-width: 769px)').matches },
  );
  protected readonly focusClock = computed(() =>
    formatClock(this.focus.remaining()).replace(/^00:/, ''),
  );
  protected readonly user = this.auth.user;
  protected readonly navigation = [
    { path: '/', label: 'Dashboard', icon: 'space_dashboard', exact: true },
    { path: '/today', label: 'Hoje', icon: 'today', exact: false },
    { path: '/focus', label: 'Foco', icon: 'timer', exact: false },
    { path: '/tasks', label: 'Tarefas', icon: 'checklist', exact: false },
    { path: '/calendar', label: 'Calendário', icon: 'calendar_month', exact: false },
    { path: '/kpis', label: 'KPIs', icon: 'monitoring', exact: false },
    { path: '/goals', label: 'Metas', icon: 'flag', exact: false },
    { path: '/time', label: 'Tempo', icon: 'schedule', exact: false },
    { path: '/organization', label: 'Organização', icon: 'folder_open', exact: false },
    { path: '/notifications', label: 'Notificações', icon: 'campaign', exact: false },
    { path: '/settings', label: 'Configurações', icon: 'settings', exact: false },
  ];
  private readonly searchInput = viewChild<ElementRef<HTMLInputElement>>('searchInput');

  constructor() {
    // On phones the drawer closes after choosing a page.
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe(() => {
      if (this.handset()) void this.sidenav()?.close();
    });
    if (isNativeMobile()) this.listenBackButton();

    // Session ended elsewhere (sign-out, expired refresh token): leave the shell.
    effect(() => {
      if (!this.auth.isAuthenticated()) {
        this.profileService.clear();
        this.org.clear();
        this.timer.clear();
        this.scheduler.stop();
        this.focus.clear();
        this.backupScheduler.stop();
        void this.mobileSync.stop();
        void this.router.navigate(['/login']);
      }
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      await Promise.all([this.profileService.load(), this.timer.refresh()]);
      this.scheduler.start();
      void this.mobileSync.start();
      void this.focus.restore().catch(() => undefined);
      this.backupScheduler.start();
      // Clean up local files of attachments removed elsewhere (best effort).
      void this.attachments.pruneOrphans().catch(() => undefined);
    } catch {
      this.toast.error('Não foi possível carregar seu perfil.');
    }
  }

  /** Android back button: close a dialog, then the drawer, then go back. */
  private listenBackButton(): void {
    void CapacitorApp.addListener('backButton', ({ canGoBack }) => {
      const dialogs = this.dialog.openDialogs;
      if (dialogs.length) {
        dialogs[dialogs.length - 1].close();
      } else if (this.handset() && this.sidenav()?.opened) {
        void this.sidenav()?.close();
      } else if (canGoBack && this.router.url !== '/') {
        history.back();
      } else {
        void CapacitorApp.minimizeApp();
      }
    });
  }

  protected search(event: Event): void {
    event.preventDefault();
    const input = this.searchInput()?.nativeElement;
    const q = input?.value.trim() ?? '';
    if (!q) return;
    void this.router.navigate(['/search'], { queryParams: { q } });
    if (input) input.value = '';
  }

  /** Ctrl+K (or Cmd+K) focuses the global search from anywhere. */
  protected onKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.searchInput()?.nativeElement.focus();
    }
  }

  async signOut(): Promise<void> {
    try {
      await this.auth.signOut();
    } catch (error) {
      this.toast.error(error instanceof Error ? error.message : 'Falha ao sair.');
    }
  }
}
