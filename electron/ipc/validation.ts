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
