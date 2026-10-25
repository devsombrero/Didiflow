import type { Routes } from '@angular/router';
import { pendingChangesGuard } from '../../shared/guards/pending-changes.guard';

export const TASK_ROUTES: Routes = [
  {
    path: '',
    title: 'Tarefas · DidiFlow',
    loadComponent: () => import('./task-list/task-list-page').then((m) => m.TaskListPage),
  },
  {
    path: 'new',
    title: 'Nova tarefa · DidiFlow',
    canDeactivate: [pendingChangesGuard],
    loadComponent: () => import('./task-form/task-form-page').then((m) => m.TaskFormPage),
  },
  {
    path: 'board',
    title: 'Quadro · DidiFlow',
    loadComponent: () => import('./kanban/kanban-page').then((m) => m.KanbanPage),
  },
  {
    path: ':id',
    title: 'Tarefa · DidiFlow',
    loadComponent: () => import('./task-detail/task-detail-page').then((m) => m.TaskDetailPage),
  },
  {
    path: ':id/edit',
    title: 'Editar tarefa · DidiFlow',
    canDeactivate: [pendingChangesGuard],
    loadComponent: () => import('./task-form/task-form-page').then((m) => m.TaskFormPage),
  },
];
