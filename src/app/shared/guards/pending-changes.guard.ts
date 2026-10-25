import { inject } from '@angular/core';
import type { CanDeactivateFn } from '@angular/router';
import { ConfirmService } from '../confirm/confirm.service';

export interface HasPendingChanges {
  hasPendingChanges(): boolean;
}

/** Asks before leaving a page with unsaved form changes. */
export const pendingChangesGuard: CanDeactivateFn<HasPendingChanges> = (component) => {
  if (!component.hasPendingChanges()) return true;
  return inject(ConfirmService).ask({
    title: 'Descartar alterações?',
    message: 'Há alterações não salvas neste formulário.',
    confirmLabel: 'Descartar',
    danger: true,
  });
};
