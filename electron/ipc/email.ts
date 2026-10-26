import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type {
  EmailKind,
  EmailMessage,
  EmailReport,
  EmailSendResult,
  EmailSettings,
  EmailSettingsUpdate,
  EmailStatus,
} from './contract';
import type { BuiltInAccount } from './builtin-email';
import { assertEmailReport, renderEmail } from './email-template';
import type { SecureStore } from './secure-store';
import { IpcValidationError } from './validation';

export const EMAIL_KINDS: readonly EmailKind[] = ['reminder', 'digest', 'custom', 'focus'];
export const GMAIL_SMTP = { host: 'smtp.gmail.com', port: 465, secure: true } as const;
/** Secure store key of the Gmail app password (main-process store, never exposed to the renderer). */
export const APP_PASSWORD_KEY = 'gmail-app-password';
/** Notification e-mails per rolling hour; protects the account from interval rules gone wild. */
export const MAX_EMAILS_PER_HOUR = 20;

const EMAIL_PATTERN = /^[^\s@<>"']{1,64}@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/;
const APP_PASSWORD_PATTERN = /^[A-Za-z]{16}$/;

export const DEFAULT_EMAIL_SETTINGS: EmailSettings = {
  enabled: false,
  address: '',
  recipient: '',
  kinds: ['reminder', 'digest'],
};

/** Defaults when the build embeds a Gmail account: on, for every kind. */
export const BUILT_IN_DEFAULT_SETTINGS: EmailSettings = {
  enabled: true,
  address: '',
  recipient: '',
  kinds: [...EMAIL_KINDS],
};

/** Reserved/test domains (RFC 2606/6761) never receive real mail. */
const UNDELIVERABLE = /(\.(local|localhost|test|invalid|example)|@example\.(com|net|org))$/i;

export function isDeliverable(address: string): boolean {
  return isEmail(address) && !UNDELIVERABLE.test(address);
}

export interface MailTransport {
  sendMail(mail: {
    from: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<unknown>;
}

/** Builds an authenticated SMTP transport (nodemailer in production). */
export type TransportFactory = (auth: { user: string; pass: string }) => MailTransport;

function isEmail(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 254 && EMAIL_PATTERN.test(value);
}

function assertEmail(value: unknown, label: string, optional = false): string {
  if (optional && value === '') return '';
  if (!isEmail(value)) throw new IpcValidationError(`Invalid ${label}`);
  return value.trim().toLowerCase();
}

/** Gmail app passwords are 16 letters, shown by Google in groups of four. */
export function normalizeAppPassword(value: string): string | null {
  const compact = value.replace(/\s+/g, '');
  return APP_PASSWORD_PATTERN.test(compact) ? compact.toLowerCase() : null;
}

function assertKinds(value: unknown): EmailKind[] {
  if (!Array.isArray(value) || value.some((kind) => !EMAIL_KINDS.includes(kind as EmailKind))) {
    throw new IpcValidationError('Invalid e-mail notification kinds');
  }
  return EMAIL_KINDS.filter((kind) => value.includes(kind));
}

export function assertEmailSettingsUpdate(value: unknown): EmailSettingsUpdate {
  if (typeof value !== 'object' || value === null) {
    throw new IpcValidationError('Invalid e-mail settings');
  }
  const { enabled, address, recipient, kinds, appPassword } = value as Record<string, unknown>;
  if (typeof enabled !== 'boolean') throw new IpcValidationError('Invalid e-mail enabled flag');
  let password: string | null | undefined;
  if (appPassword === null || appPassword === undefined) {
    password = appPassword;
  } else if (typeof appPassword === 'string' && appPassword.length <= 64) {
    password = normalizeAppPassword(appPassword) ?? undefined;
    if (password === undefined) throw new IpcValidationError('Invalid Gmail app password');
  } else {
    throw new IpcValidationError('Invalid Gmail app password');
  }
  return {
    enabled,
    address: address === '' ? '' : assertEmail(address, 'Gmail address'),
    recipient: assertEmail(recipient, 'recipient', true),
    kinds: assertKinds(kinds),
    appPassword: password,
  };
}

/** Optional fallback recipient (the signed-in account e-mail). */
export function assertRecipient(value: unknown): string | undefined {
  return value === undefined || value === null || value === ''
    ? undefined
    : assertEmail(value, 'recipient');
}

export function assertEmailMessage(value: unknown): EmailMessage {
  if (typeof value !== 'object' || value === null) {
    throw new IpcValidationError('Invalid e-mail message');
  }
  const { kind, title, body, to, report } = value as Record<string, unknown>;
  if (!EMAIL_KINDS.includes(kind as EmailKind)) {
    throw new IpcValidationError('Invalid e-mail kind');
  }
  if (typeof title !== 'string' || title.trim() === '' || title.length > 120) {
    throw new IpcValidationError('Invalid e-mail title');
  }
  if (body !== undefined && (typeof body !== 'string' || body.length > 2000)) {
    throw new IpcValidationError('Invalid e-mail body');
  }
  return {
    kind: kind as EmailKind,
    title: title.trim(),
    body: body ?? '',
    to: assertRecipient(to),
    report: assertEmailReport(report),
  };
}

export { renderEmail };

/** Maps SMTP/network failures to a category the renderer can explain. */
export function classifyError(error: unknown): 'auth' | 'network' | 'unknown' {
  const { code, responseCode } = (error ?? {}) as { code?: unknown; responseCode?: unknown };
  if (code === 'EAUTH' || responseCode === 535 || responseCode === 534) return 'auth';
  if (
    typeof code === 'string' &&
    [
      'ECONNECTION',
      'ETIMEDOUT',
      'EDNS',
      'ESOCKET',
      'ENOTFOUND',
      'ECONNREFUSED',
      'ECONNRESET',
    ].includes(code)
  ) {
    return 'network';
  }
  return 'unknown';
}

/**
 * Sends DidiFlow notifications by e-mail through Gmail SMTP, authenticated
 * with an app password. Settings live in a JSON file; the password lives in
 * a separate OS-encrypted store that only the main process reads. Packaged
 * builds may embed a default account (builtin-email.ts), used whenever the
 * user has not saved an account of their own.
 */
export class EmailNotifier {
  private settings: Promise<EmailSettings> | null = null;
  private readonly sentAt: number[] = [];
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly settingsFile: string,
    private readonly secrets: SecureStore,
    private readonly createTransport: TransportFactory,
    private readonly canStorePassword: () => boolean,
    private readonly builtIn: BuiltInAccount | null = null,
    private readonly now: () => number = Date.now,
  ) {}

  async status(): Promise<EmailStatus> {
    return {
      settings: await this.load(),
      hasPassword: (await this.secrets.get(APP_PASSWORD_KEY)) !== null,
      canStorePassword: this.canStorePassword(),
      builtInAccount: this.builtIn?.address ?? null,
    };
  }

  async save(update: EmailSettingsUpdate): Promise<EmailStatus> {
    const { appPassword, ...settings } = update;
    if (appPassword === null) await this.secrets.remove(APP_PASSWORD_KEY);
    else if (appPassword !== undefined) await this.secrets.set(APP_PASSWORD_KEY, appPassword);
    this.settings = Promise.resolve(settings);
    await this.persist(settings);
    return this.status();
  }

  /** Sends a test message regardless of the enabled flag and kinds. */
  test(to?: string): Promise<EmailSendResult> {
    return this.deliver(
      'test',
      'E-mail de teste',
      'As notificações por e-mail estão funcionando.',
      to,
    );
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    const settings = await this.load();
    if (!settings.enabled) return { status: 'skipped', reason: 'disabled' };
    if (!settings.kinds.includes(message.kind)) return { status: 'skipped', reason: 'kind' };
    const hourAgo = this.now() - 60 * 60 * 1000;
    while (this.sentAt.length > 0 && this.sentAt[0] <= hourAgo) this.sentAt.shift();
    if (this.sentAt.length >= MAX_EMAILS_PER_HOUR) {
      return { status: 'skipped', reason: 'rate-limited' };
    }
    return this.deliver(
      message.kind,
      message.title,
      message.body ?? '',
      message.to,
      message.report,
    );
  }

  /** The user's own account when complete, otherwise the embedded one. */
  private async credentials(settings: EmailSettings): Promise<BuiltInAccount | null> {
    const pass = await this.secrets.get(APP_PASSWORD_KEY);
    if (settings.address && pass) return { address: settings.address, pass };
    return this.builtIn;
  }

  private async deliver(
    kind: EmailKind | 'test',
    title: string,
    body: string,
    to?: string,
    report?: EmailReport,
  ): Promise<EmailSendResult> {
    const settings = await this.load();
    const account = await this.credentials(settings);
    if (!account) return { status: 'skipped', reason: 'not-configured' };
    // Explicit recipient, else the signed-in account, else the sender itself.
    const recipient = settings.recipient || to || account.address;
    if (!isDeliverable(recipient)) return { status: 'skipped', reason: 'no-recipient' };

    const mail = renderEmail(kind, title, body, new Date(this.now()), report);
    try {
      await this.createTransport({ user: account.address, pass: account.pass }).sendMail({
        from: `DidiFlow <${account.address}>`,
        to: recipient,
        ...mail,
      });
      this.sentAt.push(this.now());
      return { status: 'sent' };
    } catch (error) {
      return { status: 'error', error: classifyError(error) };
    }
  }

  private load(): Promise<EmailSettings> {
    this.settings ??= readFile(this.settingsFile, 'utf8')
      .then((raw) => {
        const parsed = JSON.parse(raw) as Partial<EmailSettings>;
        return {
          enabled: parsed.enabled === true,
          address: isEmail(parsed.address) ? parsed.address : '',
          recipient: isEmail(parsed.recipient) ? parsed.recipient : '',
          kinds: Array.isArray(parsed.kinds)
            ? EMAIL_KINDS.filter((kind) => parsed.kinds?.includes(kind))
            : DEFAULT_EMAIL_SETTINGS.kinds,
        };
      })
      .catch(() => ({ ...(this.builtIn ? BUILT_IN_DEFAULT_SETTINGS : DEFAULT_EMAIL_SETTINGS) }));
    return this.settings;
  }

  /** Serializes writes and replaces the file atomically. */
  private persist(settings: EmailSettings): Promise<void> {
    const snapshot = JSON.stringify(settings, null, 2);
    this.writeQueue = this.writeQueue
      .catch(() => undefined)
      .then(async () => {
        await mkdir(path.dirname(this.settingsFile), { recursive: true });
        const tempPath = `${this.settingsFile}.tmp`;
        await writeFile(tempPath, snapshot, { encoding: 'utf8', mode: 0o600 });
        await rename(tempPath, this.settingsFile);
      });
    return this.writeQueue;
  }
}
