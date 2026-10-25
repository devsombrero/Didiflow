import { linkIcon, linkLabel, normalizeLink, shortUrl } from './task-links';

describe('task links', () => {
  it('accepts https links and adds https:// to bare addresses', () => {
    expect(normalizeLink(' https://www.figma.com/file/abc ')).toEqual({
      ok: true,
      url: 'https://www.figma.com/file/abc',
    });
    expect(normalizeLink('docs.google.com/document/d/1')).toEqual({
      ok: true,
      url: 'https://docs.google.com/document/d/1',
    });
  });

  it('refuses http, other schemes, credentials and bad hosts', () => {
    expect(normalizeLink('http://site.com')).toMatchObject({
      ok: false,
      error: 'Use um link começando com https://.',
    });
    expect(normalizeLink('javascript:alert(1)')).toMatchObject({ ok: false });
    expect(normalizeLink('file:///C:/x')).toMatchObject({ ok: false });
    expect(normalizeLink('https://user:pass@site.com')).toMatchObject({ ok: false });
    expect(normalizeLink('https://localhost/x')).toMatchObject({ ok: false });
    expect(normalizeLink('https://a b.com')).toMatchObject({ ok: false });
    expect(normalizeLink('')).toMatchObject({ ok: false });
    expect(normalizeLink(`https://x.com/${'a'.repeat(2100)}`)).toMatchObject({ ok: false });
  });

  it('labels links by title or short address', () => {
    expect(linkLabel({ url: 'https://www.figma.com/file/abc', title: ' Protótipo ' })).toBe(
      'Protótipo',
    );
    expect(linkLabel({ url: 'https://www.figma.com/file/abc', title: null })).toBe(
      'figma.com/file/abc',
    );
    expect(shortUrl('https://site.com/')).toBe('site.com');
    expect(shortUrl(`https://site.com/${'x'.repeat(80)}`)).toHaveLength(58);
  });

  it('picks icons for known services', () => {
    expect(linkIcon('https://www.figma.com/file/1')).toBe('design_services');
    expect(linkIcon('https://github.com/a/b')).toBe('code');
    expect(linkIcon('https://empresa.atlassian.net/browse/X-1')).toBe('view_kanban');
    expect(linkIcon('https://example.com')).toBe('link');
  });
});
