import type { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth/auth.guards';
import { AuthLayout } from './layouts/auth-layout/auth-layout';
import { ShellLayout } from './layouts/shell-layout/shell-layout';

export const routes: Routes = [
  {
    path: '',
    component: ShellLayout,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        title: 'DidiFlow',
        loadComponent: () =>
          import('./features/dashboard/dashboard-page').then((m) => m.DashboardPage),
      },
      {
        path: 'tasks',
        loadChildren: () => import('./features/tasks/tasks.routes').then((m) => m.TASK_ROUTES),
      },
      {
        path: 'search',
        title: 'Busca · DidiFlow',
        loadComponent: () => import('./features/search/search-page').then((m) => m.SearchPage),
      },
      {
        path: 'today',
        title: 'Hoje · DidiFlow',
        loadComponent: () => import('./features/focus/today-page').then((m) => m.TodayPage),
      },
      {
        path: 'focus',
        title: 'Modo foco · DidiFlow',
        loadComponent: () => import('./features/focus/focus-page').then((m) => m.FocusPage),
      },
      {
        path: 'calendar',
        title: 'Calendário · DidiFlow',
        loadComponent: () =>
          import('./features/calendar/calendar-page').then((m) => m.CalendarPage),
      },
      {
        path: 'kpis',
        title: 'KPIs · DidiFlow',
        loadComponent: () => import('./features/kpis/kpis-page').then((m) => m.KpisPage),
      },
      {
        path: 'goals',
        title: 'Metas · DidiFlow',
        loadComponent: () => import('./features/goals/goals-page').then((m) => m.GoalsPage),
      },
      {
        path: 'time',
        title: 'Registro de tempo · DidiFlow',
        loadComponent: () => import('./features/time-tracking/time-page').then((m) => m.TimePage),
      },
      {
        path: 'organization',
        title: 'Organização · DidiFlow',
        loadComponent: () =>
          import('./features/organization/organization-page').then((m) => m.OrganizationPage),
      },
      {
        path: 'settings',
        title: 'Configurações · DidiFlow',
        loadComponent: () =>
          import('./features/settings/settings-page').then((m) => m.SettingsPage),
      },
    ],
  },
  {
    path: '',
    component: AuthLayout,
    canActivate: [guestGuard],
    children: [
      {
        path: 'login',
        title: 'Entrar · DidiFlow',
        loadComponent: () => import('./features/auth/login/login-page').then((m) => m.LoginPage),
      },
      {
        path: 'register',
        title: 'Criar conta · DidiFlow',
        loadComponent: () =>
          import('./features/auth/register/register-page').then((m) => m.RegisterPage),
      },
      {
        path: 'forgot-password',
        title: 'Redefinir senha · DidiFlow',
        loadComponent: () =>
          import('./features/auth/forgot-password/forgot-password-page').then(
            (m) => m.ForgotPasswordPage,
          ),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
