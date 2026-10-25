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
