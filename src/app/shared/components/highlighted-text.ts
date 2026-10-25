import { Component, computed, input } from '@angular/core';
import { highlight } from '../utils/highlight';

/** Renders text with matching search terms wrapped in <mark> (content stays escaped). */
@Component({
  selector: 'app-highlighted-text',
  template: `@for (segment of segments(); track $index) {
    @if (segment.match) {
      <mark>{{ segment.text }}</mark>
    } @else {
      {{ segment.text }}
    }
  }`,
  styles: `
    mark {
      background: color-mix(in srgb, var(--color-warning) 35%, transparent);
      color: inherit;
      border-radius: 2px;
    }
  `,
})
export class HighlightedText {
  readonly text = input.required<string>();
  readonly terms = input.required<readonly string[]>();
  protected readonly segments = computed(() => highlight(this.text(), this.terms()));
}
