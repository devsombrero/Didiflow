export class IpcValidationError extends Error {
  override readonly name = 'IpcValidationError';
}

const STORE_KEY_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
export const MAX_STORE_VALUE_LENGTH = 64 * 1024;
export const MAX_URL_LENGTH = 2048;

export function assertStoreKey(value: unknown): string {
  if (typeof value !== 'string' || !STORE_KEY_PATTERN.test(value)) {
    throw new IpcValidationError('Invalid secure store key');
  }
  return value;
}

export function assertStoreValue(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_STORE_VALUE_LENGTH) {
    throw new IpcValidationError('Invalid secure store value');
  }
  return value;
}

/** Accepts only absolute https:// URLs without embedded credentials. */
export function assertExternalUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_URL_LENGTH) {
    throw new IpcValidationError('Invalid URL');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new IpcValidationError('Invalid URL');
  }

  if (url.protocol !== 'https:' || url.username || url.password) {
    throw new IpcValidationError('Only https:// URLs without credentials are allowed');
  }
  return url.href;
}

const ROUTE_PATTERN = /^\/(?!\/)[A-Za-z0-9/_-]{0,199}$/;

/** In-app route: absolute path made of safe characters only. */
export function isAppRoute(value: unknown): value is string {
  return typeof value === 'string' && ROUTE_PATTERN.test(value);
}

export interface ValidNotification {
  title: string;
  body: string;
  route: string | null;
}

export function assertNotification(value: unknown): ValidNotification {
  if (typeof value !== 'object' || value === null) {
    throw new IpcValidationError('Invalid notification');
  }
  const { title, body, route } = value as Record<string, unknown>;
  if (typeof title !== 'string' || title.trim() === '' || title.length > 120) {
    throw new IpcValidationError('Invalid notification title');
  }
  if (body !== undefined && (typeof body !== 'string' || body.length > 500)) {
    throw new IpcValidationError('Invalid notification body');
  }
  if (route !== undefined && !isAppRoute(route)) {
    throw new IpcValidationError('Invalid notification route');
  }
  return { title: title.trim(), body: body ?? '', route: route ?? null };
}

/**
 * True when the URL belongs to one of the trusted renderer origins.
 * Builds the origin from protocol and host because Node's URL reports
 * `origin === 'null'` for non-special schemes such as app://.
 */
export function isTrustedOrigin(
  url: string | undefined,
  trustedOrigins: readonly string[],
): boolean {
  if (!url) return false;
  try {
    const { protocol, host } = new URL(url);
    return host !== '' && trustedOrigins.includes(`${protocol}//${host}`);
  } catch {
    return false;
  }
}
