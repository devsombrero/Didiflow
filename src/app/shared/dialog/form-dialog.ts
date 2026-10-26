import {
  type MatDialogConfig,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';

/** Directives used by form dialog templates (title, content, actions, close). */
export const FORM_DIALOG = [MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose];

/** Phone-sized screen (also the Android app). */
export function isCompactScreen(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(max-width: 768px)').matches;
}

/** Full-screen dialog settings used on phones. */
export const FULL_SCREEN_DIALOG: MatDialogConfig = {
  width: '100vw',
  maxWidth: '100vw',
  height: '100%',
  maxHeight: '100%',
  panelClass: ['form-dialog', 'form-dialog--full'],
};

/** Floating form dialog: rounded panel, responsive width, scrollable content (full screen on phones). */
export function formDialogConfig(width = 640): MatDialogConfig {
  if (isCompactScreen()) {
    return { ...FULL_SCREEN_DIALOG, autoFocus: 'first-tabbable', restoreFocus: true };
  }
  return {
    panelClass: 'form-dialog',
    width: `min(${width}px, 94vw)`,
    maxWidth: '94vw',
    maxHeight: '92vh',
    autoFocus: 'first-tabbable',
    restoreFocus: true,
  };
}
