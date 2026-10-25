import { Component, input } from '@angular/core';
import { MarkdownComponent } from 'ngx-markdown';

/**
 * Renders user Markdown. Output goes through Angular's HTML sanitizer
 * (ngx-markdown default), and links open in the system browser instead of
 * navigating the app window (only http/https).
 */
@Component({
  selector: 'app-markdown-view',
  imports: [MarkdownComponent],
  template: `
    @if (text().trim()) {
      <markdown class="markdown-body" [data]="text()" (click)="openLink($event)" />
    } @else {
      <p class="markdown-empty">{{ empty() }}</p>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .markdown-empty {
      margin: 0;
      color: var(--color-text-muted);
    }
  `,
})
export class MarkdownView {
  readonly text = input<string>('');
  readonly empty = input('Sem descrição.');

  protected openLink(event: MouseEvent): void {
    const anchor = (event.target as HTMLElement).closest('a');
    if (!anchor) return;
    event.preventDefault();
    const href = anchor.getAttribute('href') ?? '';
    if (/^https?:\/\//i.test(href)) {
      // Electron routes window.open to the validated openExternal handler.
      window.open(href, '_blank', 'noopener,noreferrer');
    }
  }
}
