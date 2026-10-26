import { Component, inject, signal } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MATERIAL_FORMS } from '../../shared/material';

export interface SubtaskSuggestionsData {
  parentTitle: string;
  items: string[];
  /** "subtarefas" or "tarefas do épico". */
  noun: string;
}

/** Lets the user pick which DidiBot suggestions become subtasks. */
@Component({
  selector: 'app-subtask-suggestions-dialog',
  imports: [MatDialogModule, MATERIAL_FORMS],
  template: `
    <h2 mat-dialog-title><mat-icon inline>smart_toy</mat-icon> Sugestões do DidiBot</h2>
    <mat-dialog-content>
      <p class="muted">
        {{ data.noun }} sugeridas para <strong>{{ data.parentTitle }}</strong
        >. Marque as que quer criar.
      </p>
      <ul class="items">
        @for (item of data.items; track $index) {
          <li>
            <mat-checkbox [checked]="selected()[$index]" (change)="toggle($index, $event.checked)">
              {{ item }}
            </mat-checkbox>
          </li>
        }
      </ul>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>Cancelar</button>
      <button matButton="filled" type="button" [disabled]="count() === 0" (click)="confirm()">
        Criar {{ count() }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .items {
      margin: 0;
      padding: 0;
      list-style: none;
    }
  `,
})
export class SubtaskSuggestionsDialog {
  protected readonly data = inject<SubtaskSuggestionsData>(MAT_DIALOG_DATA);
  private readonly ref = inject<MatDialogRef<SubtaskSuggestionsDialog, string[]>>(MatDialogRef);
  protected readonly selected = signal(this.data.items.map(() => true));

  protected count(): number {
    return this.selected().filter(Boolean).length;
  }

  protected toggle(index: number, checked: boolean): void {
    this.selected.update((list) => list.map((value, i) => (i === index ? checked : value)));
  }

  protected confirm(): void {
    this.ref.close(this.data.items.filter((_, index) => this.selected()[index]));
  }
}
