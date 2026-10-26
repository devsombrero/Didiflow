import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MATERIAL_FORMS, MATERIAL_UI } from '../../shared/material';
import {
  filterPrompts,
  type LibraryPrompt,
  MyPrompts,
  PROMPT_CATEGORIES,
  PROMPT_LIBRARY,
  type PromptCategory,
} from './didibot-prompts';

/** DidiBot prompt library: built-in prompts by category plus the user's own. */
@Component({
  selector: 'app-prompt-library-dialog',
  imports: [FormsModule, MatDialogModule, MATERIAL_FORMS, MATERIAL_UI],
  template: `
    <h2 mat-dialog-title><mat-icon inline>menu_book</mat-icon> Biblioteca de prompts</h2>
    <mat-dialog-content>
      <mat-form-field class="search" subscriptSizing="dynamic">
        <mat-label>Buscar prompt</mat-label>
        <mat-icon matPrefix>search</mat-icon>
        <input
          matInput
          id="prompt-search"
          [ngModel]="query()"
          (ngModelChange)="query.set($event)"
          autocomplete="off"
        />
      </mat-form-field>
      <div class="categories" role="tablist">
        <button
          matButton
          type="button"
          role="tab"
          [attr.aria-selected]="category() === 'todos'"
          [class.active]="category() === 'todos'"
          (click)="category.set('todos')"
        >
          Todos
        </button>
        @for (item of categories; track item.id) {
          <button
            matButton
            type="button"
            role="tab"
            [attr.aria-selected]="category() === item.id"
            [class.active]="category() === item.id"
            (click)="category.set(item.id)"
          >
            <mat-icon>{{ item.icon }}</mat-icon> {{ item.label }}
          </button>
        }
        <button
          matButton
          type="button"
          role="tab"
          [attr.aria-selected]="category() === 'meus'"
          [class.active]="category() === 'meus'"
          (click)="category.set('meus')"
        >
          <mat-icon>bookmark</mat-icon> Meus prompts ({{ mine.items().length }})
        </button>
      </div>
      <ul class="prompts">
        @for (item of visible(); track item.id) {
          <li>
            <button type="button" class="prompt" (click)="choose(item)">
              <mat-icon>{{ item.icon }}</mat-icon>
              <span class="prompt__text">
                <strong>{{ item.title }}</strong>
                @if (item.creates) {
                  <span class="badge">cria no DidiFlow</span>
                }
                <span class="muted">{{ item.description }}</span>
              </span>
            </button>
            @if (category() === 'meus') {
              <button
                matIconButton
                type="button"
                [attr.aria-label]="'Excluir ' + item.title"
                (click)="mine.remove(item.id)"
              >
                <mat-icon>delete</mat-icon>
              </button>
            }
          </li>
        } @empty {
          <li class="muted empty">
            {{
              category() === 'meus'
                ? 'Nenhum prompt salvo. Escreva uma mensagem e use “Salvar prompt”.'
                : 'Nenhum prompt encontrado.'
            }}
          </li>
        }
      </ul>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button matButton type="button" mat-dialog-close>Fechar</button>
    </mat-dialog-actions>
  `,
  styles: `
    .search {
      width: 100%;
    }
    .categories {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin: var(--space-2) 0;
    }
    .categories .active {
      background: var(--mat-sys-primary-container);
      color: var(--mat-sys-on-primary-container);
    }
    .prompts {
      display: grid;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .prompts li {
      display: flex;
      gap: var(--space-1);
      align-items: center;
    }
    .prompt {
      flex: 1;
      display: flex;
      gap: var(--space-3);
      align-items: flex-start;
      padding: var(--space-3);
      border: 1px solid var(--mat-sys-outline-variant);
      border-radius: 12px;
      background: var(--mat-sys-surface-container-low);
      color: var(--mat-sys-on-surface);
      text-align: left;
      font: inherit;
      cursor: pointer;
    }
    .prompt:hover,
    .prompt:focus-visible {
      border-color: var(--mat-sys-primary);
    }
    .prompt mat-icon {
      color: var(--mat-sys-primary);
    }
    .prompt__text {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .badge {
      align-self: flex-start;
      padding: 0 8px;
      border-radius: 999px;
      background: var(--mat-sys-tertiary-container, var(--mat-sys-primary-container));
      color: var(--mat-sys-on-tertiary-container, var(--mat-sys-on-primary-container));
      font: var(--mat-sys-label-small);
    }
    .empty {
      padding: var(--space-3);
    }
  `,
})
export class PromptLibraryDialog {
  private readonly ref = inject<MatDialogRef<PromptLibraryDialog, string>>(MatDialogRef);
  protected readonly mine = inject(MyPrompts);
  protected readonly categories = PROMPT_CATEGORIES;
  protected readonly query = signal('');
  protected readonly category = signal<PromptCategory | 'todos' | 'meus'>('todos');
  protected readonly visible = computed(() =>
    filterPrompts(
      this.category() === 'meus' ? this.mine.items() : PROMPT_LIBRARY,
      this.query(),
      this.category(),
    ),
  );

  protected choose(item: LibraryPrompt): void {
    this.ref.close(item.prompt);
  }
}
