import type { Provider } from '@angular/core';
import { MARKED_OPTIONS, MarkedRenderer, provideMarkdown } from 'ngx-markdown';

/**
 * GitHub-flavored Markdown with line breaks kept. The HTML sanitizer drops
 * <input> elements, so checklist items render as check glyphs instead.
 */
export function provideAppMarkdown(): Provider[] {
  return provideMarkdown({
    markedOptions: {
      provide: MARKED_OPTIONS,
      useFactory: () => {
        const renderer = new MarkedRenderer();
        renderer.checkbox = ({ checked }) =>
          `<span class="md-check${checked ? ' md-check--done' : ''}">${checked ? '☑' : '☐'}</span> `;
        return { gfm: true, breaks: true, renderer };
      },
    },
  });
}
