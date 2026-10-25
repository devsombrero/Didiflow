import { TestBed } from '@angular/core/testing';
import { MarkdownView } from './markdown-view';
import { provideAppMarkdown } from './markdown.providers';

describe('MarkdownView', () => {
  async function render(text: string) {
    TestBed.configureTestingModule({ imports: [MarkdownView], providers: [provideAppMarkdown()] });
    const fixture = TestBed.createComponent(MarkdownView);
    fixture.componentRef.setInput('text', text);
    fixture.detectChanges();
    // ngx-markdown renders asynchronously.
    await new Promise((resolve) => setTimeout(resolve, 20));
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders Markdown formatting and checklists', async () => {
    const el = await render('**importante**\n\n- [x] feito\n- [ ] pendente');
    expect(el.querySelector('strong')?.textContent).toBe('importante');
    expect(el.querySelectorAll('.md-check')).toHaveLength(2);
    expect(el.querySelector('.md-check--done')?.textContent).toBe('☑');
  });

  it('strips scripts and event handlers', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const el = await render('<script>alert(1)</script><img src="x" onerror="alert(2)">texto');
    expect(el.querySelector('script')).toBeNull();
    expect(el.innerHTML).not.toContain('onerror');
    expect(el.textContent).toContain('texto');
  });

  it('opens http links outside the app and ignores other schemes', async () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const el = await render('[site](https://example.com) [local](javascript:alert(1))');
    const [site, local] = Array.from(el.querySelectorAll('a'));
    site.click();
    local?.click();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
  });

  it('shows the empty message for blank text', async () => {
    const el = await render('   ');
    expect(el.textContent).toContain('Sem descrição.');
  });
});
