import { createHash, randomBytes } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { FetchLike } from './gemini';

/**
 * "Conectar conta Google" for DidiBot: OAuth 2.0 for installed apps (system
 * browser, PKCE, loopback redirect) followed by the same provisioning Google
 * AI Studio does — a Cloud project for DidiFlow, the Generative Language API
 * enabled and an API key restricted to it. The access token is used only
 * during this flow and never stored (no refresh token is requested).
 */
export const GOOGLE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/cloud-platform'];
export const GEMINI_SERVICE = 'generativelanguage.googleapis.com';
export const PROJECT_LABEL = { key: 'didiflow', value: 'didibot' } as const;

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://openidconnect.googleapis.com/v1/userinfo';
const CRM = 'https://cloudresourcemanager.googleapis.com/v3';
const SERVICE_USAGE = 'https://serviceusage.googleapis.com/v1';
const API_KEYS = 'https://apikeys.googleapis.com/v2';

export type ConnectError =
  | 'not-configured'
  | 'cancelled'
  | 'denied'
  | 'timeout'
  | 'tos'
  | 'permission'
  | 'network'
  | 'unknown';

export type ConnectResult =
  | { status: 'ok'; apiKey: string; account: string; projectId: string }
  | { status: 'error'; error: ConnectError; detail?: string };

export interface GoogleOAuthClient {
  clientId: string;
  /** Installed-app client secret: not confidential by design (RFC 8252). */
  clientSecret: string;
}

// Injected by electron/build.mjs from DIDIFLOW_GOOGLE_CLIENT_ID/SECRET (Desktop OAuth client).
declare const __GOOGLE_OAUTH__: string;

/** OAuth client of this build, or null when Google sign-in is not configured. */
export function googleOAuthClient(): GoogleOAuthClient | null {
  const raw = typeof __GOOGLE_OAUTH__ === 'string' ? __GOOGLE_OAUTH__ : '';
  if (!raw) return null;
  try {
    const client = JSON.parse(raw) as Partial<GoogleOAuthClient>;
    return client.clientId && client.clientSecret
      ? { clientId: client.clientId, clientSecret: client.clientSecret }
      : null;
  } catch {
    return null;
  }
}

export interface ConnectDependencies {
  client: GoogleOAuthClient | null;
  openExternal: (url: string) => Promise<void>;
  fetchImpl?: FetchLike;
  /** How long to wait for the user in the browser. */
  loginTimeoutMs?: number;
  /** Delay between long-running operation polls. */
  pollIntervalMs?: number;
}

class ConnectFailure extends Error {
  constructor(
    readonly code: ConnectError,
    readonly detail?: string,
  ) {
    super(code);
  }
}

const base64url = (buffer: Buffer) =>
  buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const PAGE = (
  title: string,
  message: string,
) => `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>DidiFlow</title>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#f0f7fc;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
<div style="max-width:420px;padding:28px;border-radius:16px;background:#fff;border:1px solid #d7e3ee;text-align:center">
<div style="font-size:24px;font-weight:800">Didi<span style="color:#0284c7">Flow</span></div>
<h1 style="font-size:18px">${title}</h1><p style="color:#475569">${message}</p></div></body></html>`;

export class GoogleConnector {
  private readonly fetchImpl: FetchLike;
  private readonly loginTimeoutMs: number;
  private readonly pollIntervalMs: number;
  private running = false;

  constructor(private readonly deps: ConnectDependencies) {
    this.fetchImpl = deps.fetchImpl ?? ((url, init) => fetch(url, init));
    this.loginTimeoutMs = deps.loginTimeoutMs ?? 5 * 60 * 1000;
    this.pollIntervalMs = deps.pollIntervalMs ?? 1500;
  }

  get configured(): boolean {
    return !!this.deps.client?.clientId;
  }

  async connect(): Promise<ConnectResult> {
    if (!this.deps.client?.clientId) return { status: 'error', error: 'not-configured' };
    if (this.running) return { status: 'error', error: 'cancelled', detail: 'already running' };
    this.running = true;
    try {
      const token = await this.login(this.deps.client);
      const account = await this.account(token);
      const projectId = await this.project(token);
      await this.enableGemini(token, projectId);
      const apiKey = await this.createKey(token, projectId);
      return { status: 'ok', apiKey, account, projectId };
    } catch (error) {
      if (error instanceof ConnectFailure) {
        return { status: 'error', error: error.code, detail: error.detail };
      }
      return { status: 'error', error: 'unknown', detail: String(error).slice(0, 300) };
    } finally {
      this.running = false;
    }
  }

  // -------------------------------------------------------------------------
  // OAuth: system browser + PKCE + loopback redirect.
  // -------------------------------------------------------------------------

  private async login(client: GoogleOAuthClient): Promise<string> {
    const verifier = base64url(randomBytes(48));
    const challenge = base64url(createHash('sha256').update(verifier).digest());
    const state = base64url(randomBytes(16));
    const { server, redirectUri, code } = await this.listen(state);
    try {
      const url = new URL(AUTH_URL);
      url.search = new URLSearchParams({
        client_id: client.clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: GOOGLE_SCOPES.join(' '),
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state,
        prompt: 'select_account consent',
        access_type: 'online',
      }).toString();
      await this.deps.openExternal(url.toString());
      const authorizationCode = await code;
      const response = await this.call(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: client.clientId,
          client_secret: client.clientSecret,
          code: authorizationCode,
          code_verifier: verifier,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }).toString(),
      });
      const token = (response as { access_token?: string; scope?: string }).access_token;
      const scope = (response as { scope?: string }).scope ?? '';
      if (!token) throw new ConnectFailure('unknown', 'no access token');
      if (scope && !scope.includes('cloud-platform')) throw new ConnectFailure('denied', 'scope');
      return token;
    } finally {
      server.close();
    }
  }

  /** Loopback server that resolves with the authorization code. */
  private listen(
    state: string,
  ): Promise<{ server: Server; redirectUri: string; code: Promise<string> }> {
    return new Promise((ready, fail) => {
      let resolveCode!: (code: string) => void;
      let rejectCode!: (error: unknown) => void;
      const code = new Promise<string>((resolve, reject) => {
        resolveCode = resolve;
        rejectCode = reject;
      });
      code.catch(() => undefined);
      const timer = setTimeout(
        () => rejectCode(new ConnectFailure('timeout')),
        this.loginTimeoutMs,
      );
      const server = createServer((request, response) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        if (url.pathname !== '/') {
          response.writeHead(404).end();
          return;
        }
        const finish = (ok: boolean, title: string, message: string) => {
          response.writeHead(ok ? 200 : 400, { 'Content-Type': 'text/html; charset=utf-8' });
          response.end(PAGE(title, message));
          clearTimeout(timer);
        };
        if (url.searchParams.get('state') !== state) {
          finish(false, 'Pedido inválido', 'Volte ao DidiFlow e tente conectar de novo.');
          rejectCode(new ConnectFailure('unknown', 'state mismatch'));
          return;
        }
        const error = url.searchParams.get('error');
        const authorization = url.searchParams.get('code');
        if (error || !authorization) {
          finish(
            false,
            'Conexão cancelada',
            'Nenhuma permissão foi concedida. Você pode fechar esta aba.',
          );
          rejectCode(
            new ConnectFailure(
              error === 'access_denied' ? 'cancelled' : 'denied',
              error ?? undefined,
            ),
          );
          return;
        }
        finish(
          true,
          'Conta Google conectada',
          'O DidiFlow está criando sua chave do Gemini. Você pode fechar esta aba.',
        );
        resolveCode(authorization);
      });
      server.on('error', fail);
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address() as AddressInfo;
        server.on('close', () => clearTimeout(timer));
        ready({ server, redirectUri: `http://127.0.0.1:${port}`, code });
      });
    });
  }

  // -------------------------------------------------------------------------
  // Provisioning (what Google AI Studio does when creating a key).
  // -------------------------------------------------------------------------

  private async account(token: string): Promise<string> {
    const info = (await this.call(USERINFO_URL, { headers: this.auth(token) })) as {
      email?: string;
    };
    return info.email ?? '';
  }

  /** Reuses the DidiFlow project of this account or creates one. */
  private async project(token: string): Promise<string> {
    const query = encodeURIComponent(
      `labels.${PROJECT_LABEL.key}:${PROJECT_LABEL.value} state:ACTIVE`,
    );
    const found = (await this.call(`${CRM}/projects:search?query=${query}`, {
      headers: this.auth(token),
    })) as { projects?: { projectId: string }[] };
    if (found.projects?.length) return found.projects[0].projectId;

    const projectId = `didiflow-${base64url(randomBytes(6))
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')}`.slice(0, 30);
    const operation = (await this.call(`${CRM}/projects`, {
      method: 'POST',
      headers: { ...this.auth(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        displayName: 'DidiFlow DidiBot',
        labels: { [PROJECT_LABEL.key]: PROJECT_LABEL.value },
      }),
    })) as Operation;
    await this.wait(`${CRM}/`, operation, token);
    return projectId;
  }

  private async enableGemini(token: string, projectId: string): Promise<void> {
    const operation = (await this.call(
      `${SERVICE_USAGE}/projects/${projectId}/services/${GEMINI_SERVICE}:enable`,
      {
        method: 'POST',
        headers: { ...this.auth(token), 'Content-Type': 'application/json' },
        body: '{}',
      },
    )) as Operation;
    await this.wait(`${SERVICE_USAGE}/`, operation, token);
  }

  /** API key restricted to the Gemini API. */
  private async createKey(token: string, projectId: string): Promise<string> {
    const operation = (await this.call(`${API_KEYS}/projects/${projectId}/locations/global/keys`, {
      method: 'POST',
      headers: { ...this.auth(token), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        displayName: 'DidiFlow DidiBot',
        restrictions: { apiTargets: [{ service: GEMINI_SERVICE }] },
      }),
    })) as Operation;
    const done = await this.wait(`${API_KEYS}/`, operation, token);
    const keyName = (done.response as { name?: string } | undefined)?.name;
    if (!keyName) throw new ConnectFailure('unknown', 'key operation without name');
    const key = (await this.call(`${API_KEYS}/${keyName}/keyString`, {
      headers: this.auth(token),
    })) as { keyString?: string };
    if (!key.keyString) throw new ConnectFailure('unknown', 'empty key');
    return key.keyString;
  }

  private async wait(base: string, operation: Operation, token: string): Promise<Operation> {
    let current = operation;
    for (let attempt = 0; !current.done; attempt++) {
      if (attempt > 60) throw new ConnectFailure('timeout', 'operation');
      await new Promise((resolve) => setTimeout(resolve, this.pollIntervalMs));
      current = (await this.call(`${base}${current.name}`, {
        headers: this.auth(token),
      })) as Operation;
    }
    if (current.error) throw this.failure(current.error.code ?? 0, current.error);
    return current;
  }

  private auth(token: string): Record<string, string> {
    return { Authorization: `Bearer ${token}` };
  }

  private async call(url: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(30_000) });
    } catch {
      throw new ConnectFailure('network');
    }
    let body: unknown = null;
    try {
      body = await response.json();
    } catch {
      // Empty or non-JSON body.
    }
    if (!response.ok) {
      const error = (body as { error?: GoogleError | string; error_description?: string })?.error;
      throw this.failure(
        response.status,
        typeof error === 'object' ? error : { message: String(error ?? '') },
      );
    }
    return body;
  }

  /** Terms not accepted, missing permission or anything else. */
  private failure(status: number, error: GoogleError): ConnectFailure {
    const text = `${error.status ?? ''} ${error.message ?? ''} ${JSON.stringify(error.details ?? [])}`;
    if (/terms of service|tos|TOS_/i.test(text)) return new ConnectFailure('tos', error.message);
    if (status === 401 || status === 403 || /PERMISSION_DENIED/.test(text)) {
      return new ConnectFailure('permission', error.message);
    }
    return new ConnectFailure('unknown', (error.message ?? `HTTP ${status}`).slice(0, 300));
  }
}

interface GoogleError {
  code?: number;
  status?: string;
  message?: string;
  details?: unknown[];
}

interface Operation {
  name: string;
  done?: boolean;
  error?: GoogleError;
  response?: unknown;
}
