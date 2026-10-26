import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * Default Gmail account embedded in packaged desktop builds.
 *
 * electron/build.mjs reads DIDIFLOW_GMAIL_ADDRESS and DIDIFLOW_GMAIL_APP_PASSWORD
 * from the (git-ignored) .env, seals them with AES-256-GCM under a random key
 * generated per build, and injects the result as __BUILTIN_EMAIL__. The key
 * travels masked in the same bundle, so this keeps the credentials out of the
 * source tree and out of plain sight in the binary, but anyone determined
 * enough to reverse the app can recover them (see docs/security.md).
 */
declare const __BUILTIN_EMAIL__: string;
const BUILT_SEALED = typeof __BUILTIN_EMAIL__ === 'string' ? __BUILTIN_EMAIL__ : '';

export interface BuiltInAccount {
  address: string;
  pass: string;
}

interface SealedPayload {
  v: 1;
  iv: string;
  tag: string;
  data: string;
  /** Key = mask XOR masked. */
  mask: string;
  masked: string;
}

const xor = (a: Buffer, b: Buffer) => Buffer.from(a.map((byte, i) => byte ^ b[i]));

/** Same algorithm as electron/build.mjs (kept here for tests). */
export function sealBuiltInAccount(account: BuiltInAccount): string {
  const key = randomBytes(32);
  const mask = randomBytes(32);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(account), 'utf8'), cipher.final()]);
  const payload: SealedPayload = {
    v: 1,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: data.toString('base64'),
    mask: mask.toString('base64'),
    masked: xor(key, mask).toString('base64'),
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
}

/** Decrypts the embedded account; null when absent or tampered with. */
export function openBuiltInAccount(sealed: string = BUILT_SEALED): BuiltInAccount | null {
  if (!sealed) return null;
  try {
    const payload = JSON.parse(Buffer.from(sealed, 'base64').toString('utf8')) as SealedPayload;
    if (payload.v !== 1) return null;
    const key = xor(Buffer.from(payload.masked, 'base64'), Buffer.from(payload.mask, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(payload.data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
    const account = JSON.parse(plain) as Partial<BuiltInAccount>;
    return typeof account.address === 'string' && typeof account.pass === 'string'
      ? { address: account.address, pass: account.pass }
      : null;
  } catch {
    return null;
  }
}
