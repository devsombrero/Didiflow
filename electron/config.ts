export const APP_SCHEME = 'app';
export const APP_HOST = 'didiflow';
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`;

// Injected by electron/build.mjs from DIDIFLOW_SUPABASE_URL (the same value
// the renderer is built with). Empty when the build had no configuration.
declare const __SUPABASE_ORIGIN__: string;
const BUILT_SUPABASE_ORIGIN = typeof __SUPABASE_ORIGIN__ === 'string' ? __SUPABASE_ORIGIN__ : '';

const SUPABASE_LOCAL_SOURCES = ['http://127.0.0.1:54321', 'ws://127.0.0.1:54321'];

/** HTTP(S) origin plus its WebSocket counterpart (Realtime/auth use both). */
export function supabaseSources(origin: string): string[] {
  if (!origin) return [];
  const url = new URL(origin);
  const ws = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return [url.origin, `${ws}//${url.host}`];
}

/**
 * Content Security Policy served with every app:// response. connect-src is
 * limited to the Supabase project the app was built for; the local stack is
 * also allowed in unpackaged (development) builds.
 */
export function buildContentSecurityPolicy(
  isPackaged: boolean,
  supabaseOrigin: string = BUILT_SUPABASE_ORIGIN,
): string {
  const connectSources = [
    ...new Set([
      "'self'",
      ...supabaseSources(supabaseOrigin),
      ...(isPackaged ? [] : SUPABASE_LOCAL_SOURCES),
    ]),
  ];

  return [
    "default-src 'self'",
    "script-src 'self'",
    // Angular injects component styles at runtime.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    `connect-src ${connectSources.join(' ')}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}
