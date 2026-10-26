import { describe, expect, it } from 'vitest';
import { GEMINI_SERVICE, GoogleConnector, GOOGLE_SCOPES } from './google-connect';

const client = { clientId: 'client-id.apps.googleusercontent.com', clientSecret: 'GOCSPX-test' };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Browser stand-in: follows the authorization URL back to the loopback redirect. */
function browser(outcome: { error?: string; badState?: boolean } = {}) {
  const opened: URL[] = [];
  return {
    opened,
    open: async (raw: string) => {
      const url = new URL(raw);
      opened.push(url);
      const redirect = new URL(url.searchParams.get('redirect_uri')!);
      redirect.searchParams.set('state', outcome.badState ? 'x' : url.searchParams.get('state')!);
      if (outcome.error) redirect.searchParams.set('error', outcome.error);
      else redirect.searchParams.set('code', 'auth-code');
      void fetch(redirect).catch(() => undefined);
    },
  };
}

/** Google APIs stand-in, routed by URL. */
function google(options: { existingProject?: string; createError?: object } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (url === 'https://oauth2.googleapis.com/token') {
      return json({ access_token: 'ya29.token', scope: GOOGLE_SCOPES.join(' ') });
    }
    if (url.startsWith('https://openidconnect.googleapis.com/v1/userinfo')) {
      return json({ email: 'ana@gmail.com' });
    }
    if (url.includes('/v3/projects:search')) {
      return json(
        options.existingProject ? { projects: [{ projectId: options.existingProject }] } : {},
      );
    }
    if (url.endsWith('/v3/projects') && init.method === 'POST') {
      if (options.createError) return json({ error: options.createError }, 400);
      return json({ name: 'operations/cp.1', done: false });
    }
    if (url.endsWith('/v3/operations/cp.1')) return json({ name: 'operations/cp.1', done: true });
    if (url.includes(`/services/${GEMINI_SERVICE}:enable`))
      return json({ name: 'operations/su.1', done: true });
    if (url.includes('/locations/global/keys') && init.method === 'POST') {
      return json({ name: 'operations/ak.1', done: false });
    }
    if (url.endsWith('/v2/operations/ak.1')) {
      return json({
        name: 'operations/ak.1',
        done: true,
        response: { name: 'projects/123/locations/global/keys/k1' },
      });
    }
    if (url.endsWith('/keys/k1/keyString'))
      return json({ keyString: 'AIzaSyGenerated_key_0123456789abcdef' });
    return json({ error: { message: `unexpected ${url}` } }, 404);
  };
  return { calls, fetchImpl };
}

const create = (
  open: (url: string) => Promise<void>,
  fetchImpl: ReturnType<typeof google>['fetchImpl'],
  clientConfig = client,
) =>
  new GoogleConnector({
    client: clientConfig,
    openExternal: open,
    fetchImpl,
    pollIntervalMs: 1,
    loginTimeoutMs: 5000,
  });

describe('GoogleConnector', () => {
  it('signs in with PKCE, creates the project, enables Gemini and creates a restricted key', async () => {
    const nav = browser();
    const api = google();
    const result = await create(nav.open, api.fetchImpl).connect();

    expect(result).toEqual({
      status: 'ok',
      apiKey: 'AIzaSyGenerated_key_0123456789abcdef',
      account: 'ana@gmail.com',
      projectId: expect.stringMatching(/^didiflow-[a-z0-9]+$/),
    });
    const auth = nav.opened[0];
    expect(auth.origin + auth.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(auth.searchParams.get('code_challenge_method')).toBe('S256');
    expect(auth.searchParams.get('scope')).toContain('cloud-platform');
    expect(auth.searchParams.get('access_type')).toBe('online');
    expect(auth.searchParams.get('redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

    const token = api.calls.find((call) => call.url.includes('oauth2.googleapis.com/token'))!;
    const form = new URLSearchParams(token.init.body as string);
    expect(form.get('code')).toBe('auth-code');
    expect(form.get('code_verifier')).toMatch(/^[A-Za-z0-9_-]{43,}$/);

    const project = api.calls.find((call) => call.url.endsWith('/v3/projects'))!;
    expect(JSON.parse(project.init.body as string).labels).toEqual({ didiflow: 'didibot' });
    const key = api.calls.find(
      (call) => call.url.includes('/locations/global/keys') && call.init.method === 'POST',
    )!;
    expect(JSON.parse(key.init.body as string).restrictions).toEqual({
      apiTargets: [{ service: GEMINI_SERVICE }],
    });
    for (const call of api.calls.filter((c) => c.url.includes('googleapis.com/v'))) {
      expect((call.init.headers as Record<string, string>).Authorization).toBe('Bearer ya29.token');
    }
  });

  it('reuses the DidiFlow project of the account', async () => {
    const api = google({ existingProject: 'didiflow-abc123' });
    const result = await create(browser().open, api.fetchImpl).connect();
    expect(result).toMatchObject({ status: 'ok', projectId: 'didiflow-abc123' });
    expect(api.calls.some((call) => call.url.endsWith('/v3/projects'))).toBe(false);
  });

  it('reports a cancelled consent', async () => {
    const api = google();
    expect(
      await create(browser({ error: 'access_denied' }).open, api.fetchImpl).connect(),
    ).toMatchObject({
      status: 'error',
      error: 'cancelled',
    });
    expect(api.calls).toEqual([]);
  });

  it('rejects a callback with the wrong state', async () => {
    const api = google();
    expect(await create(browser({ badState: true }).open, api.fetchImpl).connect()).toMatchObject({
      status: 'error',
      error: 'unknown',
    });
  });

  it('explains when the Google Cloud terms were not accepted', async () => {
    const api = google({
      createError: {
        status: 'FAILED_PRECONDITION',
        message: 'Callers must accept Terms of Service',
      },
    });
    expect(await create(browser().open, api.fetchImpl).connect()).toMatchObject({
      status: 'error',
      error: 'tos',
    });
  });

  it('needs an OAuth client in the build', async () => {
    const connector = new GoogleConnector({ client: null, openExternal: async () => undefined });
    expect(connector.configured).toBe(false);
    expect(await connector.connect()).toEqual({ status: 'error', error: 'not-configured' });
  });
});
