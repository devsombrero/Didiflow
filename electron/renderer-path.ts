import path from 'node:path';

/**
 * Maps a request pathname to a file inside the renderer root. Returns null
 * when the path escapes the root (path traversal).
 */
export function resolveRendererPath(root: string, pathname: string): string | null {
  const normalizedRoot = path.resolve(root);
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const target = path.resolve(normalizedRoot, decoded.replace(/^[/\\]+/, ''));

  if (target !== normalizedRoot && !target.startsWith(normalizedRoot + path.sep)) {
    return null;
  }
  return target;
}

/** Client-side routes have no file extension and fall back to index.html. */
export function isClientRoute(pathname: string): boolean {
  return path.extname(pathname) === '';
}
