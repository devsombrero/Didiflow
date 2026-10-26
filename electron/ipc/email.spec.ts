import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  APP_PASSWORD_KEY,
  assertEmailMessage,
  assertEmailSettingsUpdate,
  classifyError,
  EmailNotifier,
  MAX_EMAILS_PER_HOUR,
  type MailTransport,
  normalizeAppPassword,
  renderEmail,
} from './email';
import { type Cipher, SecureStore } from './secure-store';

const cipher: Cipher = {
  isAvailable: () => true,
  encrypt: (plain) => Buffer.from(`enc:${[...plain].reverse().join('')}`),
  decrypt: (data) => [...data.toString().slice(4)].reverse().join(''),
};

const settings = {
  enabled: true,
  address: 'ana@gmail.com',
  recipient: '',
  kinds: ['reminder', 'digest'] as ('reminder' | 'digest')[],
};

describe('e-mail validation', () => {
  it('normalizes Gmail app passwords shown in groups of four', () => {
    expect(normalizeAppPassword('abcd EFGH ijkl mnop')).toBe('abcdefghijklmnop');
    expect(normalizeAppPassword('my-real-password')).toBeNull();
    expect(normalizeAppPassword('abcdefghijklmno')).toBeNull();
  });

  it('accepts a settings update and keeps kinds in canonical order', () => {
    const update = assertEmailSettingsUpdate({
      ...settings,
      address: 'Ana@Gmail.com',
      kinds: ['custom', 'reminder'],
      appPassword: 'abcd efgh ijkl mnop',
    });
    expect(update).toEqual({
      ...settings,
      address: 'ana@gmail.com',
      kinds: ['reminder', 'custom'],
      appPassword: 'abcdefghijklmnop',
    });
  });

  it('rejects invalid addresses, kinds and passwords', () => {
    expect(() => assertEmailSettingsUpdate({ ...settings, address: 'not-an-email' })).toThrow();
    expect(() => assertEmailSettingsUpdate({ ...settings, recipient: 'x@y' })).toThrow();
    expect(() => assertEmailSettingsUpdate({ ...settings, kinds: ['system'] })).toThrow();
    expect(() => assertEmailSettingsUpdate({ ...settings, appPassword: 'senha123' })).toThrow();
    expect(() => assertEmailSettingsUpdate({ ...settings, enabled: 'yes' })).toThrow();
  });

  it('keeps or removes the stored password', () => {
    expect(assertEmailSettingsUpdate(settings).appPassword).toBeUndefined();
    expect(assertEmailSettingsUpdate({ ...settings, appPassword: null }).appPassword).toBeNull();
  });

  it('validates messages', () => {
    expect(assertEmailMessage({ kind: 'reminder', title: ' Oi ' })).toEqual({
      kind: 'reminder',
      title: 'Oi',
      body: '',
    });
    expect(() => assertEmailMessage({ kind: 'system', title: 'x' })).toThrow();
    expect(() => assertEmailMessage({ kind: 'custom', title: '' })).toThrow();
    expect(() =>
      assertEmailMessage({ kind: 'custom', title: 'x', body: 'a'.repeat(2001) }),
    ).toThrow();
  });
});

describe('renderEmail', () => {
  it('escapes user text in the HTML version', () => {
    const mail = renderEmail('custom', '<b>Pausa</b>', 'Beba água & <script>', new Date());
    expect(mail.subject).toBe('DidiFlow · <b>Pausa</b>');
    expect(mail.html).toContain('&lt;b&gt;Pausa&lt;/b&gt;');
    expect(mail.html).toContain('Beba água &amp; &lt;script&gt;');
    expect(mail.html).not.toContain('<script>');
    expect(mail.text).toContain('Beba água & <script>');
  });
});

describe('classifyError', () => {
  it('detects authentication and network failures', () => {
    expect(classifyError({ code: 'EAUTH', responseCode: 535 })).toBe('auth');
    expect(classifyError({ code: 'ETIMEDOUT' })).toBe('network');
    expect(classifyError(new Error('boom'))).toBe('unknown');
  });
});

describe('EmailNotifier', () => {
  let dir: string;
  let sent: Parameters<MailTransport['sendMail']>[0][];
  let auths: { user: string; pass: string }[];
  let failWith: unknown;
  let clock: number;

  const create = () =>
    new EmailNotifier(
      path.join(dir, 'email-settings.json'),
      new SecureStore(path.join(dir, 'email-secrets.json'), cipher),
      (auth) => {
        auths.push(auth);
        return {
          sendMail: async (mail) => {
            if (failWith) throw failWith;
            sent.push(mail);
          },
        };
      },
      () => true,
      () => clock,
    );

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'didiflow-email-'));
    sent = [];
    auths = [];
    failWith = undefined;
    clock = Date.parse('2026-10-26T12:00:00Z');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('starts disabled and skips messages', async () => {
    const notifier = create();
    expect((await notifier.status()).hasPassword).toBe(false);
    expect(await notifier.send({ kind: 'reminder', title: 'x' })).toEqual({
      status: 'skipped',
      reason: 'disabled',
    });
  });

  it('stores the password encrypted, apart from the settings file', async () => {
    const notifier = create();
    const status = await notifier.save({ ...settings, appPassword: 'abcdefghijklmnop' });
    expect(status).toEqual({ settings, hasPassword: true, canStorePassword: true });

    expect(await readFile(path.join(dir, 'email-settings.json'), 'utf8')).not.toContain('abcd');
    expect(await readFile(path.join(dir, 'email-secrets.json'), 'utf8')).not.toContain(
      'abcdefghijklmnop',
    );
    // A new instance (app restart) reads both back.
    expect(await create().status()).toEqual(status);
  });

  it('sends enabled kinds through Gmail and skips the others', async () => {
    const notifier = create();
    await notifier.save({ ...settings, appPassword: 'abcdefghijklmnop' });

    expect(
      await notifier.send({ kind: 'reminder', title: 'Revisar contrato', body: 'Hoje' }),
    ).toEqual({ status: 'sent' });
    expect(auths).toEqual([{ user: 'ana@gmail.com', pass: 'abcdefghijklmnop' }]);
    expect(sent[0]).toMatchObject({
      from: 'DidiFlow <ana@gmail.com>',
      to: 'ana@gmail.com',
      subject: 'DidiFlow · Revisar contrato',
    });

    expect(await notifier.send({ kind: 'custom', title: 'Água' })).toEqual({
      status: 'skipped',
      reason: 'kind',
    });
  });

  it('uses the configured recipient', async () => {
    const notifier = create();
    await notifier.save({
      ...settings,
      recipient: 'time@empresa.com',
      appPassword: 'abcdefghijklmnop',
    });
    await notifier.test();
    expect(sent[0].to).toBe('time@empresa.com');
  });

  it('needs an address and a password', async () => {
    const notifier = create();
    await notifier.save(settings);
    expect(await notifier.test()).toEqual({ status: 'skipped', reason: 'not-configured' });

    await notifier.save({ ...settings, appPassword: 'abcdefghijklmnop' });
    await notifier.save({ ...settings, appPassword: null });
    expect((await notifier.status()).hasPassword).toBe(false);
    expect(await create().test()).toEqual({ status: 'skipped', reason: 'not-configured' });
  });

  it('reports SMTP failures by category', async () => {
    const notifier = create();
    await notifier.save({ ...settings, appPassword: 'abcdefghijklmnop' });
    failWith = Object.assign(new Error('Invalid login'), { code: 'EAUTH', responseCode: 535 });
    expect(await notifier.test()).toEqual({ status: 'error', error: 'auth' });
  });

  it('limits notification e-mails per rolling hour', async () => {
    const notifier = create();
    await notifier.save({ ...settings, appPassword: 'abcdefghijklmnop' });
    for (let i = 0; i < MAX_EMAILS_PER_HOUR; i++) {
      expect((await notifier.send({ kind: 'digest', title: `#${i}` })).status).toBe('sent');
    }
    expect(await notifier.send({ kind: 'digest', title: 'extra' })).toEqual({
      status: 'skipped',
      reason: 'rate-limited',
    });
    clock += 60 * 60 * 1000 + 1;
    expect((await notifier.send({ kind: 'digest', title: 'later' })).status).toBe('sent');
  });

  it('never exposes the password through status', async () => {
    const notifier = create();
    await notifier.save({ ...settings, appPassword: 'abcdefghijklmnop' });
    expect(JSON.stringify(await notifier.status())).not.toContain('abcdefghijklmnop');
    expect(APP_PASSWORD_KEY).toBe('gmail-app-password');
  });
});
