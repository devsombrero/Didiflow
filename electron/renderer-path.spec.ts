import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isClientRoute, resolveRendererPath } from './renderer-path';

const root = path.resolve('/app/dist/browser');

describe('resolveRendererPath', () => {
  it('resolves files inside the root', () => {
    expect(resolveRendererPath(root, '/main.js')).toBe(path.join(root, 'main.js'));
    expect(resolveRendererPath(root, '/media/logo.svg')).toBe(path.join(root, 'media', 'logo.svg'));
  });

  it('resolves the root itself', () => {
    expect(resolveRendererPath(root, '/')).toBe(root);
  });

  it('rejects path traversal', () => {
    expect(resolveRendererPath(root, '/../secret.txt')).toBeNull();
    expect(resolveRendererPath(root, '/%2e%2e/%2e%2e/etc/passwd')).toBeNull();
  });

  it('rejects sibling directories sharing the root prefix', () => {
    expect(resolveRendererPath(root, '/../browser-evil/x.js')).toBeNull();
  });

  it('rejects malformed percent-encoding', () => {
    expect(resolveRendererPath(root, '/%E0%A4%A')).toBeNull();
  });
});

describe('isClientRoute', () => {
  it('treats extensionless paths as routes', () => {
    expect(isClientRoute('/tasks/123')).toBe(true);
    expect(isClientRoute('/')).toBe(true);
  });

  it('treats paths with extensions as assets', () => {
    expect(isClientRoute('/main.js')).toBe(false);
  });
});
