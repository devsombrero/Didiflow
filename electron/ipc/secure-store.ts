import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Encryption backend. In production this wraps Electron's safeStorage. */
export interface Cipher {
  isAvailable(): boolean;
  encrypt(plainText: string): Buffer;
  decrypt(encrypted: Buffer): string;
}

/**
 * Small key/value store whose values are encrypted with the OS keychain
 * (DPAPI on Windows) and persisted as base64 in a JSON file.
 *
 * When encryption is unavailable, values are kept in memory only: losing the
 * session on restart is preferable to writing tokens in plain text.
 */
export class SecureStore {
  private entries: Promise<Map<string, string>> | null = null;
  private readonly memory = new Map<string, string>();
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly cipher: Cipher,
  ) {}

  async get(key: string): Promise<string | null> {
    if (!this.cipher.isAvailable()) {
      return this.memory.get(key) ?? null;
    }

    const encrypted = (await this.load()).get(key);
    if (encrypted === undefined) return null;

    try {
      return this.cipher.decrypt(Buffer.from(encrypted, 'base64'));
    } catch {
      // Unreadable entry (e.g. encrypted by another OS user): discard it.
      await this.remove(key);
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.cipher.isAvailable()) {
      this.memory.set(key, value);
      return;
    }

    const entries = await this.load();
    entries.set(key, this.cipher.encrypt(value).toString('base64'));
    await this.persist(entries);
  }

  async remove(key: string): Promise<void> {
    if (!this.cipher.isAvailable()) {
      this.memory.delete(key);
      return;
    }

    const entries = await this.load();
    if (entries.delete(key)) {
      await this.persist(entries);
    }
  }

  private load(): Promise<Map<string, string>> {
    this.entries ??= readFile(this.filePath, 'utf8')
      .then((raw) => {
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
          return new Map<string, string>();
        }
        return new Map(
          Object.entries(parsed).filter(
            (entry): entry is [string, string] => typeof entry[1] === 'string',
          ),
        );
      })
      .catch(() => new Map<string, string>());
    return this.entries;
  }

  /** Serializes writes and replaces the file atomically. */
  private persist(entries: Map<string, string>): Promise<void> {
    const snapshot = JSON.stringify(Object.fromEntries(entries));
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        await mkdir(path.dirname(this.filePath), { recursive: true });
        const tempPath = `${this.filePath}.tmp`;
        await writeFile(tempPath, snapshot, { encoding: 'utf8', mode: 0o600 });
        await rename(tempPath, this.filePath);
      });
    return this.writeQueue;
  }
}
