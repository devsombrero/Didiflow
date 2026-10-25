import {
  type MatDialogConfig,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogTitle,
} from '@angular/material/dialog';

/** Directives used by form dialog templates (title, content, actions, close). */
export const FORM_DIALOG = [MatDialogTitle, MatDialogContent, MatDialogActions, MatDialogClose];

/** Floating form dialog: rounded panel, responsive width, scrollable content. */
export function formDialogConfig(width = 640): MatDialogConfig {
  return {
    panelClass: 'form-dialog',
    width: `min(${width}px, 94vw)`,
    maxWidth: '94vw',
    maxHeight: '92vh',
    autoFocus: 'first-tabbable',
    restoreFocus: true,
  };
}
