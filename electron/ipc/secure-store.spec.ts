import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Cipher, SecureStore } from './secure-store';

/** Reversible fake cipher: prefixes and reverses so plaintext never hits disk. */
function fakeCipher(available = true): Cipher {
  return {
    isAvailable: () => available,
    encrypt: (plain) => Buffer.from(`enc:${[...plain].reverse().join('')}`),
    decrypt: (data) => {
      const text = data.toString();
      if (!text.startsWith('enc:')) throw new Error('bad ciphertext');
      return [...text.slice(4)].reverse().join('');
    },
  };
}

describe('SecureStore', () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'didiflow-store-'));
    file = path.join(dir, 'nested', 'secure-store.json');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('round-trips values and persists them encrypted', async () => {
    const store = new SecureStore(file, fakeCipher());
    await store.set('sb-auth-token', '{"access_token":"secret"}');

    expect(await store.get('sb-auth-token')).toBe('{"access_token":"secret"}');

    const raw = await readFile(file, 'utf8');
    expect(raw).not.toContain('secret');
    expect(await new SecureStore(file, fakeCipher()).get('sb-auth-token')).toBe(
      '{"access_token":"secret"}',
    );
  });

  it('returns null for missing keys and removes keys', async () => {
    const store = new SecureStore(file, fakeCipher());
    expect(await store.get('missing')).toBeNull();

    await store.set('k', 'v');
    await store.remove('k');
    expect(await store.get('k')).toBeNull();
    expect(await new SecureStore(file, fakeCipher()).get('k')).toBeNull();
  });

  it('keeps every value under concurrent writes', async () => {
    const store = new SecureStore(file, fakeCipher());
    await Promise.all(Array.from({ length: 20 }, (_, i) => store.set(`k${i}`, `v${i}`)));

    const reloaded = new SecureStore(file, fakeCipher());
    for (let i = 0; i < 20; i++) {
      expect(await reloaded.get(`k${i}`)).toBe(`v${i}`);
    }
  });

  it('discards entries that cannot be decrypted', async () => {
    await new SecureStore(file, fakeCipher()).set('k', 'v');
    const raw = JSON.parse(await readFile(file, 'utf8')) as Record<string, string>;
    raw['k'] = Buffer.from('garbage').toString('base64');
    await writeFile(file, JSON.stringify(raw));

    const store = new SecureStore(file, fakeCipher());
    expect(await store.get('k')).toBeNull();
    expect(JSON.parse(await readFile(file, 'utf8'))).not.toHaveProperty('k');
  });

  it('treats a corrupted file as empty', async () => {
    const store = new SecureStore(path.join(dir, 'bad.json'), fakeCipher());
    await writeFile(path.join(dir, 'bad.json'), '{not json');
    expect(await store.get('k')).toBeNull();
    await store.set('k', 'v');
    expect(await store.get('k')).toBe('v');
  });

  it('keeps values in memory only when encryption is unavailable', async () => {
    const store = new SecureStore(file, fakeCipher(false));
    await store.set('k', 'v');

    expect(await store.get('k')).toBe('v');
    await expect(readFile(file)).rejects.toThrow();
    expect(await new SecureStore(file, fakeCipher(false)).get('k')).toBeNull();
  });
});
