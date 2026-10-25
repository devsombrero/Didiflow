import { Component, type ElementRef, input, signal, viewChild } from '@angular/core';
import { type FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconButton } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIcon } from '@angular/material/icon';
import { MatInput } from '@angular/material/input';
import { MatTooltip } from '@angular/material/tooltip';
import { applyMarkdown, type MarkdownAction } from './markdown-format';
import { MarkdownView } from './markdown-view';

interface ToolbarItem {
  action: MarkdownAction;
  icon: string;
  label: string;
}

const TOOLBAR: ToolbarItem[] = [
  { action: 'heading', icon: 'title', label: 'Título' },
  { action: 'bold', icon: 'format_bold', label: 'Negrito (Ctrl+B)' },
  { action: 'italic', icon: 'format_italic', label: 'Itálico (Ctrl+I)' },
  { action: 'strike', icon: 'strikethrough_s', label: 'Riscado' },
  { action: 'bullets', icon: 'format_list_bulleted', label: 'Lista' },
  { action: 'numbers', icon: 'format_list_numbered', label: 'Lista numerada' },
  { action: 'checklist', icon: 'checklist', label: 'Checklist' },
  { action: 'quote', icon: 'format_quote', label: 'Citação' },
  { action: 'code', icon: 'code', label: 'Código' },
  { action: 'link', icon: 'link', label: 'Link (Ctrl+K)' },
];

const SHORTCUTS: Record<string, MarkdownAction> = { b: 'bold', i: 'italic', k: 'link' };

/** Markdown textarea with a formatting toolbar and a live preview tab. */
@Component({
  selector: 'app-markdown-editor',
  imports: [
    ReactiveFormsModule,
    MatButtonToggleModule,
    MatIconButton,
    MatFormFieldModule,
    MatIcon,
    MatInput,
    MatTooltip,
    MarkdownView,
  ],
  template: `
    <div class="editor">
      <div class="editor__bar">
        <mat-button-toggle-group
          [value]="mode()"
          (change)="mode.set($event.value)"
          [hideSingleSelectionIndicator]="true"
          aria-label="Modo do editor"
        >
          <mat-button-toggle value="write">Escrever</mat-button-toggle>
          <mat-button-toggle value="preview">Visualizar</mat-button-toggle>
        </mat-button-toggle-group>
        @if (mode() === 'write') {
          <div class="editor__tools" role="toolbar" [attr.aria-label]="'Formatação de ' + label()">
            @for (item of toolbar; track item.action) {
              <button
                matIconButton
                type="button"
                [matTooltip]="item.label"
                [attr.aria-label]="item.label"
                (click)="apply(item.action)"
              >
                <mat-icon>{{ item.icon }}</mat-icon>
              </button>
            }
          </div>
        }
      </div>
      @if (mode() === 'write') {
        <mat-form-field>
          <mat-label>{{ label() }}</mat-label>
          <textarea
            #area
            matInput
            [id]="inputId()"
            [rows]="rows()"
            [formControl]="control()"
            (keydown)="shortcut($event)"
          ></textarea>
          <mat-hint
            >Aceita Markdown: **negrito**, _itálico_, listas, - [ ] checklist e links.</mat-hint
          >
          <mat-hint align="end">{{ control().value.length }}/{{ maxLength() }}</mat-hint>
          <mat-error>Use até {{ maxLength() }} caracteres.</mat-error>
        </mat-form-field>
      } @else {
        <div class="editor__preview" [style.min-height.px]="rows() * 24">
          <app-markdown-view [text]="control().value" empty="Nada para visualizar ainda." />
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      margin-bottom: var(--space-4);
    }
    .editor {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }
    .editor__bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
    }
    .editor__tools {
      display: flex;
      flex-wrap: wrap;
    }
    mat-button-toggle-group {
      --mat-button-toggle-height: 36px;
    }
    .editor__preview {
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: var(--mat-sys-corner-extra-small, 4px);
      background: var(--mat-sys-surface-container-lowest);
    }
  `,
})
export class MarkdownEditor {
  readonly control = input.required<FormControl<string>>();
  readonly label = input('Descrição');
  readonly inputId = input('description');
  readonly rows = input(6);
  readonly maxLength = input(10000);

  protected readonly toolbar = TOOLBAR;
  protected readonly mode = signal<'write' | 'preview'>('write');
  private readonly area = viewChild<ElementRef<HTMLTextAreaElement>>('area');

  protected shortcut(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
    const action = SHORTCUTS[event.key.toLowerCase()];
    if (!action) return;
    event.preventDefault();
    this.apply(action);
  }

  protected apply(action: MarkdownAction): void {
    const area = this.area()?.nativeElement;
    if (!area) return;
    const edit = applyMarkdown(
      {
        value: this.control().value,
        selectionStart: area.selectionStart,
        selectionEnd: area.selectionEnd,
      },
      action,
    );
    this.control().setValue(edit.value);
    this.control().markAsDirty();
    area.value = edit.value;
    area.focus();
    area.setSelectionRange(edit.selectionStart, edit.selectionEnd);
  }
}
